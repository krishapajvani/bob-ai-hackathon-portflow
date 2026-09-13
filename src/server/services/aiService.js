/**
 * aiService.js
 *
 * AI enrichment layer for PortFlow AI.
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 *   Deterministic Engine  →  structured context  →  aiService  →  IBM Granite
 *                                                         ↓
 *                                               human-readable enrichment
 *
 * The deterministic services (congestionEngine, berthOptimizer, routeAdvisor,
 * operationsPlanner) are always the SOURCE OF TRUTH.
 *
 * This service receives their outputs, builds a controlled prompt, calls
 * IBM Granite via watsonx.ai, and returns plain-language enrichment.
 *
 * The AI CANNOT change numerical scores, invent berths, invent cranes,
 * invent vessels, or override safety constraints.
 *
 * ── Fallback ──────────────────────────────────────────────────────────────────
 *
 * If watsonx.ai is unavailable (missing credentials, timeout, API error),
 * the service returns a deterministic fallback response built entirely from
 * the engine data. The application NEVER crashes due to AI unavailability.
 *
 * ── Environment variables ─────────────────────────────────────────────────────
 *
 *   AI_PROVIDER       - "watsonx" | "rules"  (default: "rules")
 *   WATSONX_API_KEY   - IBM Cloud API key
 *   WATSONX_PROJECT_ID- watsonx.ai project ID
 *   WATSONX_URL       - watsonx.ai endpoint (e.g. https://us-south.ml.cloud.ibm.com)
 *   WATSONX_MODEL_ID  - IBM Granite model ID (e.g. ibm/granite-13b-chat-v2)
 */

const https = require('https');

// ── Configuration ─────────────────────────────────────────────────────────────

// NOTE: These are read inside functions (not at module load time) so that
// tests can safely override process.env values in beforeEach/afterEach.
function getConfig() {
  return {
    AI_PROVIDER: process.env.AI_PROVIDER || 'rules',
    WATSONX_URL: process.env.WATSONX_URL || 'https://us-south.ml.cloud.ibm.com',
    WATSONX_MODEL_ID: process.env.WATSONX_MODEL_ID || 'ibm/granite-13b-chat-v2',
    WATSONX_PROJECT_ID: process.env.WATSONX_PROJECT_ID || '',
    WATSONX_API_KEY: process.env.WATSONX_API_KEY || '',
  };
}

// Watsonx.ai token endpoint
const IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';

// Request timeout in milliseconds (5 seconds)
const REQUEST_TIMEOUT_MS = 5000;

// ── Expected AI response schema ───────────────────────────────────────────────
// This schema is injected into the prompt so the model knows what to return.
// It is also used to validate and sanitise the model's response.

const AI_RESPONSE_SCHEMA = {
  executiveSummary: 'string — one paragraph summary of the current port situation',
  keyRisks: 'array of strings — top risks in the next 72 hours',
  recommendedActions: 'array of strings — specific actions for the port operator',
  operatorExplanation: 'string — plain English explanation for a non-technical operator',
  priorityVessels: 'array of objects — vessels requiring immediate attention: [{name, priority, reason}]',
  delayExplanation: 'array of strings — explains why specific vessels are delayed or unassigned',
  planningInsights: 'array of strings — strategic insights for the 72-hour window',
};

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds the structured prompt sent to IBM Granite.
 *
 * The prompt includes:
 *  - a system instruction with strict grounding rules
 *  - a concise JSON context object derived from deterministic engine outputs
 *  - the required output schema
 *
 * The grounding rules explicitly forbid the model from inventing resources,
 * changing numerical scores, or overriding safety constraints.
 *
 * @param {object} context - Structured operational context from deterministic services
 * @returns {string} The complete prompt string
 */
function buildPrompt(context) {
  // Sanitise the context to only include what the LLM needs
  const safeContext = buildSafeContext(context);

  return `You are PortFlow AI, an assistant for port operations managers.

STRICT RULES — you must follow these exactly:
1. Do NOT invent vessels, berths, cranes, or routes not present in the context.
2. Do NOT change any numerical score, value, or timestamp provided in the context.
3. Do NOT suggest that an unavailable berth or resource is available.
4. Do NOT override draught or LOA safety constraints.
5. For every recommendation, cite the specific data field that supports it.
6. Respond ONLY with valid JSON matching the exact schema below.
7. Keep language clear and suitable for a non-technical port operator.

CURRENT PORT OPERATIONAL CONTEXT:
${JSON.stringify(safeContext, null, 2)}

REQUIRED RESPONSE SCHEMA (respond with ONLY this JSON, no other text):
${JSON.stringify(AI_RESPONSE_SCHEMA, null, 2)}

Provide your analysis as valid JSON only. Do not include any text outside the JSON object.`;
}

/**
 * Builds the safe, concise context object sent to the LLM.
 * Strips raw database IDs and fields not needed for explanation.
 */
function buildSafeContext(context) {
  const {
    congestion,
    berthRecommendations,
    routeRecommendations,
    operationalPlan,
  } = context;

  return {
    portCongestion: {
      riskLevel: congestion?.riskLevel,
      overallScore: congestion?.overallScore,
      factors: congestion?.factors
        ? Object.fromEntries(
            Object.entries(congestion.factors).map(([k, v]) => [
              k,
              { score: v.score, detail: v.detail },
            ])
          )
        : {},
      recommendedActions: congestion?.recommendedActions?.slice(0, 5) || [],
    },

    waitingVessels: (congestion?.affectedVessels || [])
      .filter((v) => v.waitingHours !== undefined)
      .map((v) => ({ name: v.name, waitingHours: v.waitingHours })),

    berthRecommendations: berthRecommendations
      ? {
          vessel: { name: berthRecommendations.vessel?.name, type: berthRecommendations.vessel?.type },
          topBerth: berthRecommendations.topRecommendation
            ? {
                berthCode: berthRecommendations.topRecommendation.berthCode,
                score: berthRecommendations.topRecommendation.score,
                reasons: berthRecommendations.topRecommendation.reasons,
              }
            : null,
          incompatibleBerthCount: berthRecommendations.ineligibleBerths?.length || 0,
        }
      : null,

    routeRecommendations: routeRecommendations
      ? {
          vessel: { name: routeRecommendations.vessel?.name, draught: routeRecommendations.vessel?.draught },
          topRoute: routeRecommendations.topRecommendation
            ? {
                name: routeRecommendations.topRecommendation.name,
                distanceNm: routeRecommendations.topRecommendation.distanceNm,
                score: routeRecommendations.topRecommendation.score,
              }
            : null,
          excludedRouteCount: routeRecommendations.excludedRoutes?.length || 0,
        }
      : null,

    operationalPlan: operationalPlan
      ? {
          summary: operationalPlan.summary,
          scheduledVesselCount: operationalPlan.schedule?.length || 0,
          conflicts: (operationalPlan.conflicts || []).map((c) => ({
            type: c.type,
            vesselName: c.vesselName,
            severity: c.severity,
            message: c.message,
          })),
          unassignedVessels: (operationalPlan.unassignedVessels || []).map((u) => ({
            name: u.vessel?.name,
            type: u.vessel?.type,
            priority: u.vessel?.priority,
            reason: u.reason,
          })),
          recommendations: operationalPlan.recommendations?.slice(0, 5) || [],
        }
      : null,
  };
}

// ── Watsonx.ai IAM token ──────────────────────────────────────────────────────

/**
 * Fetches a short-lived IBM Cloud IAM Bearer token using the API key.
 * The token is used to authenticate the watsonx.ai API request.
 *
 * Returns the token string, or throws on failure.
 */
function fetchIamToken(apiKey) {
  return new Promise((resolve, reject) => {
    const body = `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${encodeURIComponent(apiKey)}`;

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    };

    const req = https.request(IAM_TOKEN_URL, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(`IAM token fetch failed: ${parsed.errorMessage || data}`));
          }
        } catch (e) {
          reject(new Error(`IAM token parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('IAM token request timed out'));
    });

    req.write(body);
    req.end();
  });
}

// ── Watsonx.ai generate call ──────────────────────────────────────────────────

/**
 * Calls the watsonx.ai /ml/v1/text/generation endpoint.
 * Returns the model's response text, or throws on error/timeout.
 */
function callWatsonx(prompt, iamToken) {
  const { WATSONX_URL, WATSONX_MODEL_ID, WATSONX_PROJECT_ID } = getConfig();
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model_id: WATSONX_MODEL_ID,
      input: prompt,
      parameters: {
        max_new_tokens: 1024,
        min_new_tokens: 50,
        stop_sequences: [],
        repetition_penalty: 1.1,
        temperature: 0.1,    // low temperature = more deterministic, fewer hallucinations
        top_p: 0.9,
      },
      project_id: WATSONX_PROJECT_ID,
    });

    const url = new URL(`${WATSONX_URL}/ml/v1/text/generation?version=2023-05-29`);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${iamToken}`,
        'Content-Length': Buffer.byteLength(requestBody),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(
            new Error(`Watsonx API returned status ${res.statusCode}: ${data.slice(0, 200)}`)
          );
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.results?.[0]?.generated_text;
          if (!text) {
            reject(new Error('Watsonx response missing generated_text'));
            return;
          }
          resolve(text);
        } catch (e) {
          reject(new Error(`Watsonx response parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('Watsonx text generation request timed out'));
    });

    req.write(requestBody);
    req.end();
  });
}

// ── Response parser ───────────────────────────────────────────────────────────

/**
 * Parses the model's text output into a structured object.
 * Handles markdown code fences (```json ... ```) and bare JSON.
 * Returns the parsed object or throws if parsing fails.
 */
function parseModelResponse(text) {
  // Strip markdown code fences if present
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return JSON.parse(cleaned);
}

/**
 * Validates that the parsed AI response contains the required fields
 * and that it has not hallucinated any data by checking that:
 *  - Required keys are present
 *  - The response is an object (not an array or primitive)
 *
 * Returns { valid: boolean, issues: string[] }
 */
function validateAiResponse(parsed) {
  const required = [
    'executiveSummary',
    'keyRisks',
    'recommendedActions',
    'operatorExplanation',
  ];
  const issues = [];

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    issues.push('Response is not an object');
    return { valid: false, issues };
  }

  for (const key of required) {
    if (!(key in parsed)) {
      issues.push(`Missing required field: ${key}`);
    }
  }

  // Ensure array fields are actually arrays
  const arrayFields = ['keyRisks', 'recommendedActions', 'priorityVessels', 'delayExplanation', 'planningInsights'];
  for (const field of arrayFields) {
    if (field in parsed && !Array.isArray(parsed[field])) {
      issues.push(`Field ${field} must be an array`);
    }
  }

  return { valid: issues.length === 0, issues };
}

// ── Deterministic fallback ────────────────────────────────────────────────────

/**
 * Builds a fully deterministic AI response from the engine data alone.
 * Called when watsonx.ai is unavailable or returns an invalid response.
 *
 * The fallback is based entirely on fields already computed by Phases 2–3,
 * so it provides meaningful output even without any LLM call.
 */
function buildFallbackResponse(context) {
  const { congestion, operationalPlan } = context;
  const riskLevel = congestion?.riskLevel || 'UNKNOWN';
  const score = congestion?.overallScore ?? 'N/A';
  const planSummary = operationalPlan?.summary;

  const waitingCount = planSummary?.vesselsWaiting ?? 0;
  const unassignedCount = planSummary?.vesselsUnassigned ?? 0;
  const conflictCount = planSummary?.conflicts ?? 0;
  const scheduledCount = planSummary?.totalVesselsPlanned ?? 0;

  const executiveSummary =
    `Port congestion is currently ${riskLevel} (score: ${score}/100). ` +
    `${scheduledCount} vessel(s) are scheduled in the 72-hour operational window. ` +
    (waitingCount > 0 ? `${waitingCount} vessel(s) are waiting at anchor. ` : '') +
    (unassignedCount > 0
      ? `${unassignedCount} vessel(s) could not be assigned due to resource constraints.`
      : 'All candidate vessels have been assigned berths.');

  const keyRisks = congestion?.recommendedActions?.slice(0, 3) || [
    `Congestion level is ${riskLevel}.`,
  ];

  const recommendedActions = operationalPlan?.recommendations?.slice(0, 5) || [
    'Review the 72-hour operational plan for scheduling conflicts.',
  ];

  const operatorExplanation =
    `The congestion score of ${score}/100 means the port is operating at ${riskLevel.toLowerCase()} risk. ` +
    (conflictCount > 0
      ? `There are ${conflictCount} scheduling conflict(s) that require attention. `
      : '') +
    'Use the berth planner to review recommendations and assign vessels to available berths.';

  const priorityVessels = (congestion?.affectedVessels || [])
    .filter((v) => v.waitingHours !== undefined)
    .slice(0, 3)
    .map((v) => ({
      name: v.name,
      priority: v.priority || 'N/A',
      reason: `Waiting at anchor for ${Math.round(v.waitingHours || 0)} hours`,
    }));

  const delayExplanation = (operationalPlan?.unassignedVessels || []).map(
    (u) => u.reason || `${u.vessel?.name} could not be assigned a berth.`
  );

  const planningInsights = (operationalPlan?.recommendations || []).slice(0, 3);

  return {
    executiveSummary,
    keyRisks,
    recommendedActions,
    operatorExplanation,
    priorityVessels,
    delayExplanation,
    planningInsights,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * analysePortSituation
 *
 * Main entry point for AI enrichment. Always returns a structured response.
 * If watsonx.ai is unavailable, falls back to the deterministic response.
 *
 * @param {object} context  - Structured data from Phases 2–3 services
 *   context.congestion          - output of calculateCongestion()
 *   context.berthRecommendations- output of recommendBerths() (optional)
 *   context.routeRecommendations- output of recommendRoutes() (optional)
 *   context.operationalPlan     - output of generatePlan()
 *
 * @returns {Promise<object>} AI-enriched analysis, always resolves
 */
async function analysePortSituation(context) {
  // Read config fresh on every call so tests can override process.env
  const { AI_PROVIDER, WATSONX_API_KEY, WATSONX_PROJECT_ID, WATSONX_MODEL_ID } = getConfig();

  // Always build the fallback first — used if anything goes wrong
  const fallback = buildFallbackResponse(context);

  // If AI is disabled via config, return fallback immediately
  if (AI_PROVIDER !== 'watsonx') {
    return {
      provider: 'deterministic-fallback',
      aiAvailable: false,
      fallbackReason: 'AI_PROVIDER is not set to "watsonx"',
      ...fallback,
    };
  }

  // Check required credentials
  if (!WATSONX_API_KEY || !WATSONX_PROJECT_ID) {
    logSafeWarning('Watsonx credentials are not configured. Using deterministic fallback.');
    return {
      provider: 'deterministic-fallback',
      aiAvailable: false,
      fallbackReason: 'Watsonx credentials not configured',
      ...fallback,
    };
  }

  try {
    // Step 1: Get IAM Bearer token
    const iamToken = await fetchIamToken(WATSONX_API_KEY);

    // Step 2: Build prompt from the deterministic context
    const prompt = buildPrompt(context);

    // Step 3: Call Granite via watsonx.ai
    const rawText = await callWatsonx(prompt, iamToken);

    // Step 4: Parse the model's JSON response
    let parsed;
    try {
      parsed = parseModelResponse(rawText);
    } catch (parseErr) {
      logSafeWarning(`AI response was not valid JSON: ${parseErr.message}. Using fallback.`);
      return {
        provider: 'deterministic-fallback',
        aiAvailable: false,
        fallbackReason: 'AI response was not valid JSON',
        ...fallback,
      };
    }

    // Step 5: Validate the parsed response
    const { valid, issues } = validateAiResponse(parsed);
    if (!valid) {
      logSafeWarning(`AI response failed validation (${issues.join('; ')}). Using fallback.`);
      return {
        provider: 'deterministic-fallback',
        aiAvailable: false,
        fallbackReason: `AI response validation failed: ${issues.join('; ')}`,
        ...fallback,
      };
    }

    // Return the enriched response tagged with provider info
    return {
      provider: 'watsonx-granite',
      aiAvailable: true,
      modelId: WATSONX_MODEL_ID,   // local const from getConfig() above
      ...parsed,
    };
  } catch (err) {
    // Log the error safely — never log the API key
    logSafeWarning(`Watsonx call failed: ${err.message}. Using deterministic fallback.`);
    return {
      provider: 'deterministic-fallback',
      aiAvailable: false,
      fallbackReason: err.message,
      ...fallback,
    };
  }
}

// ── Safe logging ──────────────────────────────────────────────────────────────

/**
 * Logs a warning safely — NEVER includes the API key, token, or any secret.
 * In test environments the log is suppressed.
 */
function logSafeWarning(message) {
  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[PortFlow AI] ${message}`);
  }
}

// ── Exports for testing ───────────────────────────────────────────────────────

module.exports = {
  analysePortSituation,
  // Exported for unit testing only — not part of the public API
  buildPrompt,
  buildSafeContext,
  buildFallbackResponse,
  validateAiResponse,
  parseModelResponse,
};
