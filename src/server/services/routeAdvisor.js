/**
 * routeAdvisor.js
 *
 * Deterministic route-recommendation service for PortFlow AI.
 *
 * ── Algorithm ────────────────────────────────────────────────────────────────
 *
 * For a given vessel, each active route is evaluated through two stages:
 *
 *  Stage 1 — Hard safety checks (any failure → route excluded)
 *    • Route must be active (isActive = true)
 *    • Vessel draught must be ≤ route maxDraught   ← safety-critical, never waived
 *    • Vessel type must be in route.suitableFor
 *
 *  Stage 2 — Scoring (suitable routes only, 0–100)
 *
 *    Criterion                          Points   Rationale
 *    ─────────────────────────────────  ──────   ─────────────────────────────
 *    Distance (shorter = higher score)    40      Minimise transit time
 *    Draught safety margin (0–30 pts)     30      More margin = safer passage
 *    No hazard bonus                      15      Routes without known hazards
 *    Destination wait time (0–15 pts)     15      Shorter wait at destination
 *
 *  Routes are ranked by score (descending).
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   const { recommendRoutes } = require('./routeAdvisor');
 *   const results = recommendRoutes({ vessel, routes });
 */

// Maximum distance treated as "reference max" for distance scoring.
// Routes beyond this distance score 0 distance points.
const MAX_DISTANCE_NM = 60;

// Maximum destination wait time for scoring (beyond this = 0 wait points)
const MAX_WAIT_HOURS = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value, max = 100) {
  return Math.max(0, Math.min(max, value));
}

// ── Stage 1: Eligibility ──────────────────────────────────────────────────────

/**
 * Returns null if the route is safe for this vessel,
 * or a string reason if it must be excluded.
 */
function getExclusionReason(vessel, route) {
  if (!route.isActive) {
    return `Route "${route.name}" is currently inactive`;
  }
  if (vessel.draught > route.maxDraught) {
    return (
      `Vessel draught ${vessel.draught}m exceeds route maximum ${route.maxDraught}m — ` +
      'unsafe passage'
    );
  }
  if (!route.suitableFor.includes(vessel.type)) {
    return `Route not suitable for ${vessel.type} vessels`;
  }
  return null; // suitable
}

// ── Stage 2: Scoring ──────────────────────────────────────────────────────────

/**
 * Scores a suitable route for a given vessel.
 */
function scoreRoute(vessel, route) {
  let score = 0;
  const reasons = [];
  const warnings = [];

  // ── Distance score (0–40 points) ─────────────────────────────────────────
  // Shorter route earns more points. Linear from MAX_DISTANCE_NM (0 pts) to 0 nm (40 pts).
  const distanceScore = clamp(
    ((MAX_DISTANCE_NM - route.distanceNm) / MAX_DISTANCE_NM) * 40,
    40
  );
  score += distanceScore;
  reasons.push(
    `Distance: ${route.distanceNm} nm, ~${route.avgTransitHours}h transit (+${Math.round(distanceScore)} pts)`
  );

  // ── Draught safety margin (0–30 points) ──────────────────────────────────
  // margin = route.maxDraught - vessel.draught
  // Full 30 pts when margin ≥ 4 m; 0 pts when margin = 0 m.
  const margin = route.maxDraught - vessel.draught;
  const draughtScore = clamp((margin / 4) * 30, 30);
  score += draughtScore;
  reasons.push(
    `Draught safety margin: ${margin.toFixed(1)}m (vessel ${vessel.draught}m / route max ${route.maxDraught}m, +${Math.round(draughtScore)} pts)`
  );

  if (margin < 1) {
    warnings.push(
      `Very tight draught margin (${margin.toFixed(1)}m). Verify tidal conditions before transit.`
    );
  }

  // ── Hazard bonus (0 or 15 points) ────────────────────────────────────────
  if (!route.hasHazard) {
    score += 15;
    reasons.push('No known navigational hazards on this route (+15 pts)');
  } else {
    warnings.push('Route has known navigational hazards — proceed with caution');
  }

  // ── Destination wait time (0–15 points) ──────────────────────────────────
  const waitHours = route.destinationPort?.typicalWaitHours ?? MAX_WAIT_HOURS;
  const waitScore = clamp(((MAX_WAIT_HOURS - waitHours) / MAX_WAIT_HOURS) * 15, 15);
  score += waitScore;
  reasons.push(
    `Typical wait at destination: ${waitHours}h (+${Math.round(waitScore)} pts)`
  );

  return { score: Math.round(clamp(score)), reasons, warnings };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * recommendRoutes
 *
 * @param {object} params
 * @param {object} params.vessel  - Vessel document
 * @param {Array}  params.routes  - Array of route documents
 *
 * @returns {object} { recommendations, excludedRoutes, vessel }
 */
function recommendRoutes({ vessel, routes }) {
  if (!vessel) throw new Error('vessel is required');
  if (!Array.isArray(routes)) throw new Error('routes must be an array');

  const recommendations = [];
  const excludedRoutes = [];

  for (const route of routes) {
    const reason = getExclusionReason(vessel, route);

    if (reason) {
      excludedRoutes.push({
        id: route._id,
        name: route.name,
        fromNode: route.fromNode,
        toNode: route.toNode,
        reason,
      });
    } else {
      const { score, reasons, warnings } = scoreRoute(vessel, route);
      recommendations.push({
        id: route._id,
        name: route.name,
        fromNode: route.fromNode,
        toNode: route.toNode,
        distanceNm: route.distanceNm,
        avgTransitHours: route.avgTransitHours,
        maxDraught: route.maxDraught,
        hasHazard: route.hasHazard,
        destinationPort: route.destinationPort || null,
        score,
        reasons,
        warnings,
        suitabilityLabel: score >= 70 ? 'Highly Suitable' : score >= 40 ? 'Suitable' : 'Marginal',
      });
    }
  }

  // Sort by score descending; ties broken by distance ascending
  recommendations.sort(
    (a, b) => b.score - a.score || a.distanceNm - b.distanceNm
  );

  return {
    vessel: {
      id: vessel._id,
      name: vessel.name,
      imoNumber: vessel.imoNumber,
      type: vessel.type,
      draught: vessel.draught,
    },
    recommendations,
    excludedRoutes,
    topRecommendation: recommendations[0] || null,
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = { recommendRoutes };
