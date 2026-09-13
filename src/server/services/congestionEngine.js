/**
 * congestionEngine.js
 *
 * Deterministic, explainable congestion-risk calculator for PortFlow AI.
 *
 * ── Scoring model ────────────────────────────────────────────────────────────
 *
 * Five factors are measured independently, each scored 0–100, then
 * combined with fixed weights that sum to 1.0:
 *
 *  Factor                          Weight  What it measures
 *  ─────────────────────────────── ──────  ──────────────────────────────────
 *  1. Berth occupancy rate           0.30  How full the port is right now
 *  2. Anchor queue depth             0.25  Vessels waiting with no berth
 *  3. Crane utilisation              0.20  Equipment bottleneck
 *  4. Inbound pressure (next 12 h)   0.15  Vessels arriving soon
 *  5. Priority-1 vessel stranded     0.10  Urgent vessel waiting >2 h
 *
 * Final score  = Σ(factor_score × weight)          range 0–100
 * Risk level   : LOW 0–35 | MEDIUM 36–60 | HIGH 61–80 | CRITICAL 81–100
 *
 * Every factor reports its own raw value and contribution so the caller
 * (and the UI) can explain exactly why the score is what it is.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   const { calculateCongestion } = require('./congestionEngine');
 *
 *   // Pass plain JS objects that match the Mongoose document shape.
 *   const result = calculateCongestion({ vessels, berths });
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const WEIGHTS = {
  berthOccupancy: 0.30,
  anchorQueue: 0.25,
  craneUtilisation: 0.20,
  inboundPressure: 0.15,
  priorityStranded: 0.10,
};

const RISK_LEVELS = [
  { label: 'CRITICAL', min: 81 },
  { label: 'HIGH', min: 61 },
  { label: 'MEDIUM', min: 36 },
  { label: 'LOW', min: 0 },
];

// A Priority-1 vessel is considered "stranded" after waiting this long
const PRIORITY_WAIT_THRESHOLD_HOURS = 2;

// Inbound window to consider as "imminent" pressure
const INBOUND_WINDOW_HOURS = 12;

// Anchor queue size that maps to a factor score of 100
// (i.e. 8+ waiting vessels = max pressure)
const MAX_QUEUE_FOR_FULL_SCORE = 8;

// Inbound vessel count that maps to a factor score of 100
const MAX_INBOUND_FOR_FULL_SCORE = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clamps a number to [0, 100]. */
function clamp(value) {
  return Math.max(0, Math.min(100, value));
}

/** Returns the risk-level label for a given score. */
function getRiskLevel(score) {
  for (const { label, min } of RISK_LEVELS) {
    if (score >= min) return label;
  }
  return 'LOW';
}

/** Returns how many hours ago a Date was (positive = in the past). */
function hoursAgo(date) {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}

/** Returns how many hours from now a Date is (positive = in the future). */
function hoursFromNow(date) {
  return (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60);
}

// ── Factor calculators ────────────────────────────────────────────────────────

/**
 * Factor 1 — Berth occupancy rate (0–100).
 *
 * Counts berths that are occupied OR in maintenance as "unavailable".
 * Maintenance berths are included because they cannot accept vessels either.
 *
 * Score = unavailableBerths / totalBerths × 100
 */
function calcBerthOccupancy(berths) {
  if (!berths.length) return { score: 0, detail: 'No berths in database' };

  const total = berths.length;
  const occupied = berths.filter((b) => b.status === 'occupied').length;
  const maintenance = berths.filter((b) => b.status === 'maintenance').length;
  const unavailable = occupied + maintenance;

  const score = clamp((unavailable / total) * 100);

  return {
    score,
    detail: `${unavailable} of ${total} berths unavailable (${occupied} occupied, ${maintenance} in maintenance)`,
    raw: { total, occupied, maintenance, unavailable },
  };
}

/**
 * Factor 2 — Anchor queue depth (0–100).
 *
 * The number of vessels with status="waiting" drives this score.
 * Score scales linearly from 0 (no waiting vessels) to 100 at MAX_QUEUE_FOR_FULL_SCORE.
 */
function calcAnchorQueue(vessels) {
  const waiting = vessels.filter((v) => v.status === 'waiting');
  const count = waiting.length;

  const score = clamp((count / MAX_QUEUE_FOR_FULL_SCORE) * 100);

  return {
    score,
    detail: `${count} vessel${count !== 1 ? 's' : ''} waiting at anchor`,
    raw: { waitingCount: count },
    affectedVessels: waiting.map((v) => ({ id: v._id, name: v.name, imoNumber: v.imoNumber })),
  };
}

/**
 * Factor 3 — Crane utilisation (0–100).
 *
 * Measures what fraction of the total crane fleet is currently assigned.
 * Score = assignedCranes / totalCranes × 100
 *
 * If there are no cranes in the database the factor scores 0 (not 100)
 * because the port may not use cranes (e.g. bulk-only terminal).
 */
function calcCraneUtilisation(berths) {
  const totalCranes = berths.reduce((sum, b) => sum + (b.craneCount || 0), 0);
  const availableCranes = berths.reduce((sum, b) => sum + (b.cranesAvailable || 0), 0);

  if (totalCranes === 0) {
    return { score: 0, detail: 'No cranes tracked at this port', raw: { totalCranes: 0 } };
  }

  const assigned = totalCranes - availableCranes;
  const score = clamp((assigned / totalCranes) * 100);

  return {
    score,
    detail: `${assigned} of ${totalCranes} cranes assigned (${availableCranes} free)`,
    raw: { totalCranes, availableCranes, assigned },
  };
}

/**
 * Factor 4 — Inbound pressure over the next INBOUND_WINDOW_HOURS (0–100).
 *
 * Counts vessels with status="inbound" whose ETA is within the window.
 * Score scales linearly from 0 to 100 at MAX_INBOUND_FOR_FULL_SCORE.
 */
function calcInboundPressure(vessels) {
  const imminent = vessels.filter((v) => {
    if (v.status !== 'inbound') return false;
    const h = hoursFromNow(v.eta);
    return h >= 0 && h <= INBOUND_WINDOW_HOURS;
  });

  const count = imminent.length;
  const score = clamp((count / MAX_INBOUND_FOR_FULL_SCORE) * 100);

  return {
    score,
    detail: `${count} vessel${count !== 1 ? 's' : ''} arriving within ${INBOUND_WINDOW_HOURS} hours`,
    raw: { imminentCount: count, windowHours: INBOUND_WINDOW_HOURS },
    affectedVessels: imminent.map((v) => ({
      id: v._id,
      name: v.name,
      imoNumber: v.imoNumber,
      eta: v.eta,
      hoursUntilArrival: Math.round(hoursFromNow(v.eta) * 10) / 10,
    })),
  };
}

/**
 * Factor 5 — Priority-1 vessel stranded (0–100).
 *
 * Returns 100 if any Priority-1 vessel has been waiting more than
 * PRIORITY_WAIT_THRESHOLD_HOURS hours. Returns 0 otherwise.
 *
 * This is a binary "alarm" factor: either there's a critical vessel
 * stuck at anchor or there isn't.
 */
function calcPriorityStranded(vessels) {
  const stranded = vessels.filter((v) => {
    if (v.priority !== 1 || v.status !== 'waiting') return false;
    return hoursAgo(v.eta) >= PRIORITY_WAIT_THRESHOLD_HOURS;
  });

  const score = stranded.length > 0 ? 100 : 0;

  return {
    score,
    detail:
      stranded.length > 0
        ? `${stranded.length} Priority-1 vessel(s) waiting more than ${PRIORITY_WAIT_THRESHOLD_HOURS} hours`
        : 'No Priority-1 vessels stranded',
    raw: { strandedCount: stranded.length, thresholdHours: PRIORITY_WAIT_THRESHOLD_HOURS },
    affectedVessels: stranded.map((v) => ({
      id: v._id,
      name: v.name,
      imoNumber: v.imoNumber,
      waitingHours: Math.round(hoursAgo(v.eta) * 10) / 10,
    })),
  };
}

// ── Immediate actions ─────────────────────────────────────────────────────────

/**
 * Derives a list of plain-English recommended actions from the factor scores
 * and the raw port data. These are deterministic rules — no LLM needed.
 */
function buildRecommendedActions(factors, vessels, berths, overallScore) {
  const actions = [];

  if (factors.priorityStranded.score === 100) {
    actions.push(
      'URGENT: One or more Priority-1 vessels are stranded at anchor. ' +
        'Expedite berth clearance or assign the next available compatible berth immediately.'
    );
  }

  if (factors.anchorQueue.score >= 75) {
    actions.push(
      `Anchor queue is critically long (${factors.anchorQueue.raw.waitingCount} vessels). ` +
        'Consider activating diversion routes to nearby anchorages or ports.'
    );
  } else if (factors.anchorQueue.score >= 50) {
    actions.push(
      `Anchor queue is growing (${factors.anchorQueue.raw.waitingCount} vessels). ` +
        'Review berth turnaround times and expedite departures where possible.'
    );
  }

  const maintenanceBerths = berths.filter((b) => b.status === 'maintenance');
  if (maintenanceBerths.length > 0) {
    actions.push(
      `${maintenanceBerths.length} berth(s) are in maintenance (${maintenanceBerths.map((b) => b.berthCode).join(', ')}). ` +
        'Prioritise repairs to restore capacity.'
    );
  }

  if (factors.craneUtilisation.score >= 80) {
    actions.push(
      `Crane utilisation is at ${Math.round(factors.craneUtilisation.score)}%. ` +
        'Consider scheduling maintenance windows to avoid peak arrival periods.'
    );
  }

  if (factors.inboundPressure.score >= 60) {
    actions.push(
      `${factors.inboundPressure.raw.imminentCount} vessels arriving in the next ` +
        `${INBOUND_WINDOW_HOURS} hours. Pre-assign berths now to minimise waiting time.`
    );
  }

  if (factors.berthOccupancy.score >= 80 && factors.anchorQueue.raw.waitingCount > 0) {
    actions.push(
      'Port is near capacity. Review ETD accuracy for berthed vessels — ' +
        'early departures would free space for waiting vessels.'
    );
  }

  if (overallScore <= 35) {
    actions.push('Port is operating normally. No immediate action required.');
  }

  return actions;
}

// ── Affected berths summary ───────────────────────────────────────────────────

function buildAffectedBerths(berths) {
  return berths
    .filter((b) => b.status !== 'available')
    .map((b) => ({
      id: b._id,
      berthCode: b.berthCode,
      terminalZone: b.terminalZone,
      status: b.status,
      occupiedUntil: b.occupiedUntil || null,
      cranesAvailable: b.cranesAvailable,
    }));
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * calculateCongestion
 *
 * @param {object} params
 * @param {Array}  params.vessels  - Array of vessel documents (plain objects or Mongoose docs)
 * @param {Array}  params.berths   - Array of berth documents
 *
 * @returns {object} Full congestion assessment
 */
function calculateCongestion({ vessels = [], berths = [] }) {
  // ── 1. Calculate each factor ──────────────────────────────────────────────
  const factors = {
    berthOccupancy: calcBerthOccupancy(berths),
    anchorQueue: calcAnchorQueue(vessels),
    craneUtilisation: calcCraneUtilisation(berths),
    inboundPressure: calcInboundPressure(vessels),
    priorityStranded: calcPriorityStranded(vessels),
  };

  // ── 2. Weighted sum ───────────────────────────────────────────────────────
  const rawScore =
    factors.berthOccupancy.score * WEIGHTS.berthOccupancy +
    factors.anchorQueue.score * WEIGHTS.anchorQueue +
    factors.craneUtilisation.score * WEIGHTS.craneUtilisation +
    factors.inboundPressure.score * WEIGHTS.inboundPressure +
    factors.priorityStranded.score * WEIGHTS.priorityStranded;

  const overallScore = Math.round(clamp(rawScore));
  const riskLevel = getRiskLevel(overallScore);

  // ── 3. Collect affected vessels (union of factor-level lists) ─────────────
  const affectedVesselIds = new Set();
  const affectedVessels = [];

  for (const key of ['anchorQueue', 'inboundPressure', 'priorityStranded']) {
    for (const v of factors[key].affectedVessels || []) {
      if (!affectedVesselIds.has(String(v.id))) {
        affectedVesselIds.add(String(v.id));
        affectedVessels.push(v);
      }
    }
  }

  // ── 4. Build factor summary (strip affectedVessels from the nested level) ─
  const factorSummary = Object.fromEntries(
    Object.entries(factors).map(([key, val]) => [
      key,
      {
        score: Math.round(val.score),
        weight: WEIGHTS[key],
        contribution: Math.round(val.score * WEIGHTS[key]),
        detail: val.detail,
        raw: val.raw,
      },
    ])
  );

  // ── 5. Build output ───────────────────────────────────────────────────────
  return {
    overallScore,
    riskLevel,
    factors: factorSummary,
    affectedVessels,
    affectedBerths: buildAffectedBerths(berths),
    recommendedActions: buildRecommendedActions(factors, vessels, berths, overallScore),
    calculatedAt: new Date().toISOString(),
    // Expose weights so the UI can display "how was this score calculated"
    weights: WEIGHTS,
  };
}

module.exports = { calculateCongestion, getRiskLevel, WEIGHTS };
