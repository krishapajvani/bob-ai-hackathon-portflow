/**
 * routeAdvisor.test.js
 *
 * Unit tests for the route recommendation service.
 * No database — all inputs are plain JavaScript objects.
 */

const { recommendRoutes } = require('../services/routeAdvisor');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVessel(overrides = {}) {
  return {
    _id: 'v1',
    name: 'Test Vessel',
    imoNumber: 'IMO0000001',
    type: 'container',
    draught: 10,
    ...overrides,
  };
}

function makeRoute(overrides = {}) {
  return {
    _id: 'r1',
    name: 'Test Route',
    fromNode: 'MAIN',
    toNode: 'NORTH',
    distanceNm: 10,
    avgTransitHours: 2,
    maxDraught: 16,
    hasHazard: false,
    isActive: true,
    suitableFor: ['container', 'bulk', 'tanker', 'roro', 'general'],
    destinationPort: {
      portCode: 'DEST',
      portName: 'Test Port',
      country: 'Local',
      typicalWaitHours: 2,
    },
    ...overrides,
  };
}

// ── Input validation ──────────────────────────────────────────────────────────

describe('recommendRoutes — input validation', () => {
  it('throws if vessel is missing', () => {
    expect(() => recommendRoutes({ vessel: null, routes: [] })).toThrow('vessel is required');
  });

  it('throws if routes is not an array', () => {
    expect(() => recommendRoutes({ vessel: makeVessel(), routes: null })).toThrow(
      'routes must be an array'
    );
  });
});

// ── Result shape ──────────────────────────────────────────────────────────────

describe('recommendRoutes — result shape', () => {
  it('returns the expected top-level keys', () => {
    const result = recommendRoutes({ vessel: makeVessel(), routes: [makeRoute()] });
    expect(result).toHaveProperty('vessel');
    expect(result).toHaveProperty('recommendations');
    expect(result).toHaveProperty('excludedRoutes');
    expect(result).toHaveProperty('topRecommendation');
    expect(result).toHaveProperty('evaluatedAt');
  });
});

// ── Draught safety — never recommend unsafe route ────────────────────────────

describe('recommendRoutes — draught safety', () => {
  it('excludes a route when vessel draught exceeds route maxDraught', () => {
    const vessel = makeVessel({ draught: 14 });
    const route = makeRoute({ maxDraught: 12 });
    const result = recommendRoutes({ vessel, routes: [route] });
    expect(result.recommendations).toHaveLength(0);
    expect(result.excludedRoutes).toHaveLength(1);
    expect(result.excludedRoutes[0].reason).toMatch(/draught/i);
  });

  it('includes a route when vessel draught equals route maxDraught', () => {
    const vessel = makeVessel({ draught: 12 });
    const route = makeRoute({ maxDraught: 12 });
    const result = recommendRoutes({ vessel, routes: [route] });
    expect(result.recommendations).toHaveLength(1);
  });

  it('includes a route when vessel draught is well below route maxDraught', () => {
    const vessel = makeVessel({ draught: 8 });
    const route = makeRoute({ maxDraught: 16 });
    const result = recommendRoutes({ vessel, routes: [route] });
    expect(result.recommendations).toHaveLength(1);
  });
});

// ── Inactive route is excluded ────────────────────────────────────────────────

describe('recommendRoutes — inactive route', () => {
  it('excludes an inactive route', () => {
    const vessel = makeVessel({ draught: 5 });
    const route = makeRoute({ isActive: false, maxDraught: 16 });
    const result = recommendRoutes({ vessel, routes: [route] });
    expect(result.recommendations).toHaveLength(0);
    expect(result.excludedRoutes[0].reason).toMatch(/inactive/i);
  });
});

// ── Vessel type suitability ───────────────────────────────────────────────────

describe('recommendRoutes — vessel type suitability', () => {
  it('excludes a route not suitable for the vessel type', () => {
    const vessel = makeVessel({ type: 'tanker', draught: 8 });
    const route = makeRoute({ suitableFor: ['container', 'bulk'], maxDraught: 16 });
    const result = recommendRoutes({ vessel, routes: [route] });
    expect(result.recommendations).toHaveLength(0);
    expect(result.excludedRoutes[0].reason).toMatch(/tanker/i);
  });
});

// ── Valid route recommendation ────────────────────────────────────────────────

describe('recommendRoutes — valid recommendation', () => {
  it('recommends a safe compatible route with a positive score', () => {
    const vessel = makeVessel({ type: 'container', draught: 10 });
    const route = makeRoute({ maxDraught: 16, distanceNm: 5, hasHazard: false });
    const result = recommendRoutes({ vessel, routes: [route] });
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].score).toBeGreaterThan(0);
    expect(result.topRecommendation).not.toBeNull();
  });

  it('returns reasons explaining the score', () => {
    const result = recommendRoutes({ vessel: makeVessel(), routes: [makeRoute()] });
    expect(result.recommendations[0].reasons.length).toBeGreaterThan(0);
  });

  it('attaches a suitabilityLabel to each recommendation', () => {
    const result = recommendRoutes({ vessel: makeVessel(), routes: [makeRoute()] });
    expect(result.recommendations[0]).toHaveProperty('suitabilityLabel');
  });
});

// ── Ranking — shorter distance ranks higher ───────────────────────────────────

describe('recommendRoutes — ranking by distance', () => {
  it('ranks shorter route above longer route when both are otherwise equal', () => {
    const vessel = makeVessel({ draught: 8 });
    const shortRoute = makeRoute({ _id: 'r-short', name: 'Short', distanceNm: 5 });
    const longRoute = makeRoute({ _id: 'r-long', name: 'Long', distanceNm: 40 });
    const result = recommendRoutes({ vessel, routes: [longRoute, shortRoute] });
    expect(result.recommendations[0].distanceNm).toBe(5);
    expect(result.recommendations[1].distanceNm).toBe(40);
  });
});

// ── Hazard warning ────────────────────────────────────────────────────────────

describe('recommendRoutes — hazard warning', () => {
  it('adds a warning for routes with known hazards', () => {
    const vessel = makeVessel({ draught: 5 });
    const route = makeRoute({ hasHazard: true, maxDraught: 16 });
    const result = recommendRoutes({ vessel, routes: [route] });
    expect(result.recommendations[0].warnings.some((w) => /hazard/i.test(w))).toBe(true);
  });

  it('scores hazard-free route higher than otherwise identical hazardous route', () => {
    const vessel = makeVessel({ draught: 5 });
    const safeRoute = makeRoute({ _id: 'r-safe', name: 'Safe', hasHazard: false, distanceNm: 10 });
    const hazardRoute = makeRoute({ _id: 'r-haz', name: 'Hazard', hasHazard: true, distanceNm: 10 });
    const result = recommendRoutes({ vessel, routes: [hazardRoute, safeRoute] });
    const safeScore = result.recommendations.find((r) => r.name === 'Safe').score;
    const hazardScore = result.recommendations.find((r) => r.name === 'Hazard').score;
    expect(safeScore).toBeGreaterThan(hazardScore);
  });
});

// ── No recommendations when no routes ────────────────────────────────────────

describe('recommendRoutes — empty routes', () => {
  it('returns empty recommendations when no routes exist', () => {
    const result = recommendRoutes({ vessel: makeVessel(), routes: [] });
    expect(result.recommendations).toHaveLength(0);
    expect(result.topRecommendation).toBeNull();
  });
});
