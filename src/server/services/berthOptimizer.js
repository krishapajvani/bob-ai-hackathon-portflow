/**
 * berthOptimizer.js
 *
 * Deterministic berth-recommendation service for PortFlow AI.
 *
 * ── Algorithm ────────────────────────────────────────────────────────────────
 *
 * For a given vessel, each berth is evaluated through two stages:
 *
 *  Stage 1 — Hard eligibility checks (any failure → berth is excluded)
 *    • Berth must not be in maintenance
 *    • Berth must be available (status = 'available')
 *    • Vessel LOA must be ≤ berth maxLOA
 *    • Vessel draught must be ≤ berth maxDraught
 *    • Vessel type must be in berth.vesselTypes
 *
 *  Stage 2 — Scoring (eligible berths only, 0–100)
 *    Points are awarded for desirable properties; penalties for warnings.
 *
 *    Criterion                       Points   Rationale
 *    ──────────────────────────────  ──────   ────────────────────────────────
 *    Crane availability (0–30 pts)     30      More cranes = faster turnaround
 *    LOA headroom (0–20 pts)           20      Prefer tightest fit (less waste)
 *    Draught headroom (0–20 pts)       20      Prefer tightest safe fit
 *    Priority-vessel bonus             15      Extra points for high-priority vessels
 *    Zone match (vessel type)          15      Preferred terminal zone for type
 *
 *  Berths are ranked by score (descending).
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   const { recommendBerths } = require('./berthOptimizer');
 *   const results = recommendBerths({ vessel, berths });
 */

// ── Zone preferences per vessel type ─────────────────────────────────────────
// A vessel type maps to its "home" terminal zone.
// Matching zone earns the full zone-match bonus.
const ZONE_PREFERENCE = {
  container: 'North',
  bulk: 'South',
  tanker: 'East',
  roro: 'West',
  general: null, // no preferred zone
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clamps a number to [0, max]. */
function clamp(value, max) {
  return Math.max(0, Math.min(max, value));
}

// ── Stage 1: Eligibility ──────────────────────────────────────────────────────

/**
 * Returns null if the berth passes all hard checks,
 * or a string reason if it is ineligible.
 */
function getIneligibilityReason(vessel, berth) {
  if (berth.status === 'maintenance') {
    return `Berth ${berth.berthCode} is under maintenance`;
  }
  if (berth.status !== 'available') {
    return `Berth ${berth.berthCode} is ${berth.status}`;
  }
  if (vessel.loa > berth.maxLOA) {
    return `Vessel LOA ${vessel.loa}m exceeds berth max ${berth.maxLOA}m`;
  }
  if (vessel.draught > berth.maxDraught) {
    return `Vessel draught ${vessel.draught}m exceeds berth max ${berth.maxDraught}m`;
  }
  if (!berth.vesselTypes.includes(vessel.type)) {
    return `Berth does not accept ${vessel.type} vessels (accepts: ${berth.vesselTypes.join(', ')})`;
  }
  return null; // eligible
}

// ── Stage 2: Scoring ──────────────────────────────────────────────────────────

/**
 * Scores an eligible berth for a given vessel.
 *
 * Returns { score, reasons, warnings }
 */
function scoreBerth(vessel, berth) {
  let score = 0;
  const reasons = [];
  const warnings = [];

  // ── Crane availability (0–30 points) ──────────────────────────────────────
  // Full points if all cranes at this berth are free.
  const craneScore =
    berth.craneCount > 0
      ? clamp((berth.cranesAvailable / berth.craneCount) * 30, 30)
      : 15; // berths without cranes get half points (they serve non-crane cargo)

  score += craneScore;

  if (berth.craneCount > 0) {
    reasons.push(
      `${berth.cranesAvailable} of ${berth.craneCount} cranes available (+${Math.round(craneScore)} pts)`
    );
    if (berth.cranesAvailable === 0) {
      warnings.push('No cranes available at this berth — cargo operations will be delayed');
    }
  }

  // ── LOA headroom (0–20 points) ────────────────────────────────────────────
  // Prefer the berth where the vessel fits most snugly (smallest safe headroom).
  // Headroom of 0 m = 20 pts; headroom of maxLOA = 0 pts.
  const loaHeadroom = berth.maxLOA - vessel.loa;
  const loaScore = clamp(20 - (loaHeadroom / berth.maxLOA) * 20, 20);
  score += loaScore;
  reasons.push(
    `LOA fit: vessel ${vessel.loa}m / berth max ${berth.maxLOA}m (headroom ${loaHeadroom}m, +${Math.round(loaScore)} pts)`
  );

  // ── Draught headroom (0–20 points) ────────────────────────────────────────
  const draughtHeadroom = berth.maxDraught - vessel.draught;
  const draughtScore = clamp(20 - (draughtHeadroom / berth.maxDraught) * 20, 20);
  score += draughtScore;
  reasons.push(
    `Draught fit: vessel ${vessel.draught}m / berth max ${berth.maxDraught}m (headroom ${draughtHeadroom}m, +${Math.round(draughtScore)} pts)`
  );

  // ── Priority-vessel bonus (0–15 points) ───────────────────────────────────
  // High-priority vessels get extra points for any berth with at least one crane
  if (vessel.priority <= 2 && berth.cranesAvailable > 0) {
    score += 15;
    reasons.push(`Priority-${vessel.priority} vessel: crane-ready berth bonus (+15 pts)`);
  }

  // ── Zone match (0–15 points) ──────────────────────────────────────────────
  const preferredZone = ZONE_PREFERENCE[vessel.type];
  if (preferredZone === berth.terminalZone) {
    score += 15;
    reasons.push(`Preferred terminal zone (${berth.terminalZone}) for ${vessel.type} vessels (+15 pts)`);
  } else if (preferredZone !== null) {
    warnings.push(
      `Berth is in ${berth.terminalZone} zone; preferred zone for ${vessel.type} is ${preferredZone}`
    );
  }

  return { score: Math.round(clamp(score, 100)), reasons, warnings };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * recommendBerths
 *
 * @param {object} params
 * @param {object} params.vessel  - Vessel document (plain object or Mongoose doc)
 * @param {Array}  params.berths  - Array of berth documents
 *
 * @returns {object} { recommendations, ineligibleBerths, vessel }
 *
 *   recommendations  - ranked array of eligible berths with scores and reasons
 *   ineligibleBerths - array of berths excluded with their exclusion reason
 */
function recommendBerths({ vessel, berths }) {
  if (!vessel) throw new Error('vessel is required');
  if (!Array.isArray(berths)) throw new Error('berths must be an array');

  const recommendations = [];
  const ineligibleBerths = [];

  for (const berth of berths) {
    const reason = getIneligibilityReason(vessel, berth);

    if (reason) {
      ineligibleBerths.push({
        id: berth._id,
        berthCode: berth.berthCode,
        terminalZone: berth.terminalZone,
        status: berth.status,
        reason,
      });
    } else {
      const { score, reasons, warnings } = scoreBerth(vessel, berth);
      recommendations.push({
        id: berth._id,
        berthCode: berth.berthCode,
        terminalZone: berth.terminalZone,
        maxLOA: berth.maxLOA,
        maxDraught: berth.maxDraught,
        craneCount: berth.craneCount,
        cranesAvailable: berth.cranesAvailable,
        score,
        reasons,
        warnings,
      });
    }
  }

  // Sort by score descending; ties broken alphabetically by berthCode
  recommendations.sort((a, b) => b.score - a.score || a.berthCode.localeCompare(b.berthCode));

  return {
    vessel: {
      id: vessel._id,
      name: vessel.name,
      imoNumber: vessel.imoNumber,
      type: vessel.type,
      loa: vessel.loa,
      draught: vessel.draught,
      priority: vessel.priority,
    },
    recommendations,
    ineligibleBerths,
    topRecommendation: recommendations[0] || null,
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = { recommendBerths };
