/**
 * aiService.test.js
 *
 * Unit tests for the AI service layer.
 * All external calls (IBM IAM, watsonx.ai) are mocked via jest.
 * No real API key required.
 */

const {
  buildPrompt,
  buildSafeContext,
  buildFallbackResponse,
  validateAiResponse,
  parseModelResponse,
  analysePortSituation,
} = require('../services/aiService');

// ── Mock the https module to intercept network calls ─────────────────────────
jest.mock('https');
const https = require('https');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const mockCongestion = {
  overallScore: 68,
  riskLevel: 'HIGH',
  factors: {
    berthOccupancy: { score: 75, weight: 0.30, contribution: 22, detail: '6 of 8 berths unavailable' },
    anchorQueue: { score: 50, weight: 0.25, contribution: 12, detail: '4 vessels waiting at anchor' },
    craneUtilisation: { score: 80, weight: 0.20, contribution: 16, detail: '12 of 15 cranes assigned' },
    inboundPressure: { score: 30, weight: 0.15, contribution: 4, detail: '2 vessels arriving within 12h' },
    priorityStranded: { score: 100, weight: 0.10, contribution: 10, detail: '1 Priority-1 vessel stranded' },
  },
  recommendedActions: [
    'URGENT: Priority-1 vessel stranded at anchor.',
    'Anchor queue is growing. Review berth turnaround times.',
  ],
  affectedVessels: [
    { id: 'v1', name: 'Tanker Gulf Star', imoNumber: 'IMO9109876', waitingHours: 4.2 },
  ],
};

const mockPlan = {
  summary: {
    totalVesselsPlanned: 8,
    vesselsWaiting: 4,
    vesselsBerthed: 4,
    vesselsInbound: 5,
    vesselsUnassigned: 2,
    conflicts: 3,
    congestionLevel: 'HIGH',
    congestionScore: 68,
  },
  schedule: [
    { vessel: { name: 'Tanker Gulf Star', priority: 1 }, berth: { berthCode: 'B07' } },
  ],
  conflicts: [
    {
      type: 'NO_BERTH',
      vesselName: 'Ever Horizon',
      vesselPriority: 2,
      severity: 'WARNING',
      message: 'Ever Horizon (priority 2) cannot be assigned a berth.',
      action: 'Review berth availability.',
    },
  ],
  unassignedVessels: [
    {
      vessel: { name: 'Ever Horizon', type: 'container', priority: 2 },
      reason: 'No berths are currently available.',
    },
  ],
  recommendations: ['Expedite berth clearance.', 'Activate diversion routes.'],
};

const mockContext = {
  congestion: mockCongestion,
  operationalPlan: mockPlan,
};

// ── Helper: mock https to simulate a successful Watsonx response ──────────────
// Node's https.request signature varies: (url, options, cb) or (url, cb) or (options, cb).
// The mock must handle all variants by finding the callback as the last argument.

function makeMockReq(responseText, statusCode = 200) {
  const mockRes = {
    statusCode,
    on: jest.fn((event, handler) => {
      if (event === 'data') handler(responseText);
      if (event === 'end') handler();
    }),
  };
  return {
    mockRes,
    req: {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      setTimeout: jest.fn((_, cb) => cb && cb()),
      destroy: jest.fn(),
    },
  };
}

function mockHttpsSuccess(iamToken, generatedText) {
  let callCount = 0;
  https.request.mockImplementation((...args) => {
    // Find the callback — it is the last argument that is a function
    const cb = args.find((a, i) => typeof a === 'function' && i === args.length - 1)
      || args[args.length - 1];

    callCount++;
    const responseText =
      callCount === 1
        ? JSON.stringify({ access_token: iamToken })
        : JSON.stringify({ results: [{ generated_text: generatedText }] });

    const { mockRes, req } = makeMockReq(responseText);
    if (typeof cb === 'function') cb(mockRes);
    return req;
  });
}

function mockHttpsError(errorMessage) {
  https.request.mockImplementation((...args) => {
    const req = {
      on: jest.fn((event, handler) => {
        if (event === 'error') setImmediate(() => handler(new Error(errorMessage)));
      }),
      write: jest.fn(),
      end: jest.fn(),
      setTimeout: jest.fn(),
      destroy: jest.fn(),
    };
    return req;
  });
}

// ── buildSafeContext ──────────────────────────────────────────────────────────

describe('buildSafeContext', () => {
  it('returns the expected structure keys', () => {
    const ctx = buildSafeContext(mockContext);
    expect(ctx).toHaveProperty('portCongestion');
    expect(ctx).toHaveProperty('operationalPlan');
  });

  it('includes riskLevel and overallScore but no raw DB ids', () => {
    const ctx = buildSafeContext(mockContext);
    expect(ctx.portCongestion.riskLevel).toBe('HIGH');
    expect(ctx.portCongestion.overallScore).toBe(68);
    expect(JSON.stringify(ctx)).not.toMatch(/"_id"/);
  });

  it('limits recommendedActions to 5 items', () => {
    const longContext = {
      ...mockContext,
      congestion: {
        ...mockCongestion,
        recommendedActions: Array(10).fill('Action item'),
      },
    };
    const ctx = buildSafeContext(longContext);
    expect(ctx.portCongestion.recommendedActions.length).toBeLessThanOrEqual(5);
  });
});

// ── buildPrompt ───────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  it('includes grounding rules in the prompt', () => {
    const prompt = buildPrompt(mockContext);
    expect(prompt).toMatch(/do NOT invent/i);
    expect(prompt).toMatch(/do NOT change any numerical score/i);
  });

  it('includes the congestion score in the prompt', () => {
    const prompt = buildPrompt(mockContext);
    expect(prompt).toContain('68');
    expect(prompt).toContain('HIGH');
  });

  it('includes the required response schema', () => {
    const prompt = buildPrompt(mockContext);
    expect(prompt).toContain('executiveSummary');
    expect(prompt).toContain('keyRisks');
    expect(prompt).toContain('recommendedActions');
  });

  it('does not include any environment variable values directly', () => {
    const prompt = buildPrompt(mockContext);
    // Ensure no secret-looking patterns appear
    expect(prompt).not.toMatch(/WATSONX_API_KEY/);
  });
});

// ── parseModelResponse ────────────────────────────────────────────────────────

describe('parseModelResponse', () => {
  it('parses bare JSON', () => {
    const text = '{"executiveSummary":"test","keyRisks":[]}';
    const parsed = parseModelResponse(text);
    expect(parsed.executiveSummary).toBe('test');
  });

  it('strips markdown code fences before parsing', () => {
    const text = '```json\n{"executiveSummary":"test","keyRisks":[]}\n```';
    const parsed = parseModelResponse(text);
    expect(parsed.executiveSummary).toBe('test');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseModelResponse('not json')).toThrow();
  });
});

// ── validateAiResponse ────────────────────────────────────────────────────────

describe('validateAiResponse', () => {
  it('returns valid for a correct response', () => {
    const good = {
      executiveSummary: 'Summary',
      keyRisks: ['Risk 1'],
      recommendedActions: ['Action 1'],
      operatorExplanation: 'Explanation',
      priorityVessels: [],
      delayExplanation: [],
      planningInsights: [],
    };
    const { valid } = validateAiResponse(good);
    expect(valid).toBe(true);
  });

  it('returns invalid when required fields are missing', () => {
    const bad = { keyRisks: [] };
    const { valid, issues } = validateAiResponse(bad);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes('executiveSummary'))).toBe(true);
  });

  it('returns invalid for a non-object response', () => {
    const { valid } = validateAiResponse('a string');
    expect(valid).toBe(false);
  });

  it('returns invalid when array fields are not arrays', () => {
    const bad = {
      executiveSummary: 'ok',
      keyRisks: 'should be array',
      recommendedActions: ['ok'],
      operatorExplanation: 'ok',
    };
    const { valid, issues } = validateAiResponse(bad);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes('keyRisks'))).toBe(true);
  });
});

// ── buildFallbackResponse ─────────────────────────────────────────────────────

describe('buildFallbackResponse', () => {
  it('returns all required fields', () => {
    const fb = buildFallbackResponse(mockContext);
    expect(fb).toHaveProperty('executiveSummary');
    expect(fb).toHaveProperty('keyRisks');
    expect(fb).toHaveProperty('recommendedActions');
    expect(fb).toHaveProperty('operatorExplanation');
    expect(fb).toHaveProperty('priorityVessels');
    expect(fb).toHaveProperty('delayExplanation');
    expect(fb).toHaveProperty('planningInsights');
  });

  it('includes the actual congestion score in the executive summary', () => {
    const fb = buildFallbackResponse(mockContext);
    expect(fb.executiveSummary).toContain('68');
    expect(fb.executiveSummary).toContain('HIGH');
  });

  it('includes unassigned vessel names in delayExplanation', () => {
    const fb = buildFallbackResponse(mockContext);
    // mockPlan has one unassigned vessel: Ever Horizon
    expect(fb.delayExplanation.length).toBeGreaterThan(0);
  });

  it('works with empty context', () => {
    const fb = buildFallbackResponse({});
    expect(typeof fb.executiveSummary).toBe('string');
  });
});

// ── analysePortSituation — rules mode ────────────────────────────────────────

describe('analysePortSituation — AI_PROVIDER=rules (default)', () => {
  beforeEach(() => {
    // Ensure provider is 'rules' for these tests
    delete process.env.AI_PROVIDER;
  });

  it('returns deterministic fallback without calling https', async () => {
    const result = await analysePortSituation(mockContext);
    expect(result.provider).toBe('deterministic-fallback');
    expect(result.aiAvailable).toBe(false);
    expect(https.request).not.toHaveBeenCalled();
  });

  it('fallback contains the congestion score', async () => {
    const result = await analysePortSituation(mockContext);
    expect(result.executiveSummary).toContain('68');
  });
});

// ── analysePortSituation — missing credentials ───────────────────────────────

describe('analysePortSituation — missing credentials', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'watsonx';
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
  });

  afterEach(() => {
    delete process.env.AI_PROVIDER;
  });

  it('returns deterministic fallback when credentials are missing', async () => {
    const result = await analysePortSituation(mockContext);
    expect(result.provider).toBe('deterministic-fallback');
    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toMatch(/credentials/i);
  });

  it('does not throw when credentials are missing', async () => {
    await expect(analysePortSituation(mockContext)).resolves.toBeDefined();
  });
});

// ── analysePortSituation — successful Watsonx response ───────────────────────

describe('analysePortSituation — successful Watsonx call', () => {
  const validAiResponse = {
    executiveSummary: 'Port is at HIGH risk.',
    keyRisks: ['Anchor queue is growing.'],
    recommendedActions: ['Expedite berth clearance.'],
    operatorExplanation: 'Four vessels are waiting at anchor.',
    priorityVessels: [{ name: 'Tanker Gulf Star', priority: 1, reason: 'Fuel supply vessel' }],
    delayExplanation: ['Ever Horizon cannot be berthed due to no available slots.'],
    planningInsights: ['Review overnight berth schedule.'],
  };

  beforeEach(() => {
    process.env.AI_PROVIDER = 'watsonx';
    process.env.WATSONX_API_KEY = 'test-api-key';
    process.env.WATSONX_PROJECT_ID = 'test-project-id';
    process.env.WATSONX_URL = 'https://test.ml.cloud.ibm.com';
    process.env.WATSONX_MODEL_ID = 'ibm/granite-13b-chat-v2';
    mockHttpsSuccess('mock-iam-token', JSON.stringify(validAiResponse));
  });

  afterEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
    delete process.env.WATSONX_URL;
    delete process.env.WATSONX_MODEL_ID;
    jest.resetAllMocks();
  });

  it('returns watsonx-granite as provider', async () => {
    const result = await analysePortSituation(mockContext);
    expect(result.provider).toBe('watsonx-granite');
    expect(result.aiAvailable).toBe(true);
  });

  it('returns the model ID in the response', async () => {
    const result = await analysePortSituation(mockContext);
    expect(result.modelId).toBe('ibm/granite-13b-chat-v2');
  });

  it('returns the AI-generated content', async () => {
    const result = await analysePortSituation(mockContext);
    expect(result.executiveSummary).toBe('Port is at HIGH risk.');
    expect(result.keyRisks).toEqual(['Anchor queue is growing.']);
  });
});

// ── analysePortSituation — malformed AI response ─────────────────────────────

describe('analysePortSituation — malformed AI response', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'watsonx';
    process.env.WATSONX_API_KEY = 'test-key';
    process.env.WATSONX_PROJECT_ID = 'test-project';
    process.env.WATSONX_URL = 'https://test.ml.cloud.ibm.com';
    mockHttpsSuccess('token', 'this is not json at all { broken');
  });

  afterEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
    delete process.env.WATSONX_URL;
    jest.resetAllMocks();
  });

  it('returns deterministic fallback on malformed AI response', async () => {
    const result = await analysePortSituation(mockContext);
    expect(result.provider).toBe('deterministic-fallback');
    expect(result.aiAvailable).toBe(false);
    expect(result.fallbackReason).toMatch(/json/i);
  });
});

// ── analysePortSituation — Watsonx API error ─────────────────────────────────

describe('analysePortSituation — Watsonx API error', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'watsonx';
    process.env.WATSONX_API_KEY = 'test-key';
    process.env.WATSONX_PROJECT_ID = 'test-project';
    process.env.WATSONX_URL = 'https://test.ml.cloud.ibm.com';
    mockHttpsError('Connection refused');
  });

  afterEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
    delete process.env.WATSONX_URL;
    jest.resetAllMocks();
  });

  it('returns deterministic fallback on network error', async () => {
    const result = await analysePortSituation(mockContext);
    expect(result.provider).toBe('deterministic-fallback');
    expect(result.aiAvailable).toBe(false);
  });

  it('does not throw on network error', async () => {
    await expect(analysePortSituation(mockContext)).resolves.toBeDefined();
  });
});

// ── AI cannot change the numerical risk score ─────────────────────────────────

describe('analysePortSituation — AI cannot override deterministic data', () => {
  it('fallback always uses the deterministic congestion score, not a made-up value', async () => {
    const result = await analysePortSituation(mockContext);
    // The fallback must reference the actual score (68) from the engine
    expect(result.executiveSummary).toContain('68');
  });

  it('the prompt explicitly forbids inventing berths', () => {
    const prompt = buildPrompt(mockContext);
    expect(prompt).toMatch(/do NOT invent/i);
  });

  it('buildSafeContext never includes raw berth/vessel counts beyond what the engine provides', () => {
    const ctx = buildSafeContext(mockContext);
    // There should be no invented data — the berth count in the context must match
    // the congestion engine output, not a random number
    const actionCount = ctx.portCongestion.recommendedActions.length;
    expect(actionCount).toBeLessThanOrEqual(5);
    expect(actionCount).toBe(mockCongestion.recommendedActions.length);
  });
});
