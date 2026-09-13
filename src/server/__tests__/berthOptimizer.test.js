/**
 * berthOptimizer.test.js
 *
 * Unit tests for the berth recommendation service.
 * No database — all inputs are plain JavaScript objects.
 */

const { recommendBerths } = require('../services/berthOptimizer');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeVessel(overrides = {}) {
  return {
    _id: 'v1',
    name: 'Test Vessel',
    imoNumber: 'IMO0000001',
    type: 'container',
    loa: 200,
    beam: 30,
    draught: 9,
    priority: 3,
    ...overrides,
  };
}

function makeBerth(overrides = {}) {
  return {
    _id: 'b1',
    berthCode: 'B01',
    terminalZone: 'North',
    maxLOA: 300,
    maxDraught: 12,
    berthLength: 310,
    vesselTypes: ['container'],
    craneCount: 4,
    cranesAvailable: 4,
    status: 'available',
    ...overrides,
  };
}

// ── Input validation ──────────────────────────────────────────────────────────

describe('recommendBerths — input validation', () => {
  it('throws if vessel is missing', () => {
    expect(() => recommendBerths({ vessel: null, berths: [] })).toThrow('vessel is required');
  });

  it('throws if berths is not an array', () => {
    expect(() => recommendBerths({ vessel: makeVessel(), berths: null })).toThrow(
      'berths must be an array'
    );
  });
});

// ── Result shape ──────────────────────────────────────────────────────────────

describe('recommendBerths — result shape', () => {
  it('returns the expected top-level keys', () => {
    const result = recommendBerths({ vessel: makeVessel(), berths: [makeBerth()] });
    expect(result).toHaveProperty('vessel');
    expect(result).toHaveProperty('recommendations');
    expect(result).toHaveProperty('ineligibleBerths');
    expect(result).toHaveProperty('topRecommendation');
    expect(result).toHaveProperty('evaluatedAt');
  });
});

// ── Maintenance berth is never recommended ────────────────────────────────────

describe('recommendBerths — maintenance exclusion', () => {
  it('does not recommend a berth under maintenance', () => {
    const vessel = makeVessel();
    const berth = makeBerth({ status: 'maintenance' });
    const result = recommendBerths({ vessel, berths: [berth] });
    expect(result.recommendations).toHaveLength(0);
    expect(result.ineligibleBerths).toHaveLength(1);
    expect(result.ineligibleBerths[0].reason).toMatch(/maintenance/i);
  });

  it('does not recommend an occupied berth', () => {
    const vessel = makeVessel();
    const berth = makeBerth({ status: 'occupied' });
    const result = recommendBerths({ vessel, berths: [berth] });
    expect(result.recommendations).toHaveLength(0);
  });
});

// ── Oversized vessel is not assigned to an unsuitable berth ──────────────────

describe('recommendBerths — LOA constraint', () => {
  it('excludes berth where vessel LOA exceeds berth maxLOA', () => {
    const vessel = makeVessel({ loa: 350 });
    const berth = makeBerth({ maxLOA: 300 });
    const result = recommendBerths({ vessel, berths: [berth] });
    expect(result.recommendations).toHaveLength(0);
    expect(result.ineligibleBerths[0].reason).toMatch(/LOA/i);
  });

  it('includes berth when vessel LOA exactly equals maxLOA', () => {
    const vessel = makeVessel({ loa: 300 });
    const berth = makeBerth({ maxLOA: 300 });
    const result = recommendBerths({ vessel, berths: [berth] });
    expect(result.recommendations).toHaveLength(1);
  });
});

// ── Draught constraint ────────────────────────────────────────────────────────

describe('recommendBerths — draught constraint', () => {
  it('excludes berth where vessel draught exceeds berth maxDraught', () => {
    const vessel = makeVessel({ draught: 13 });
    const berth = makeBerth({ maxDraught: 12 });
    const result = recommendBerths({ vessel, berths: [berth] });
    expect(result.recommendations).toHaveLength(0);
    expect(result.ineligibleBerths[0].reason).toMatch(/draught/i);
  });
});

// ── Vessel type constraint ────────────────────────────────────────────────────

describe('recommendBerths — vessel type constraint', () => {
  it('excludes berth that does not accept the vessel type', () => {
    const vessel = makeVessel({ type: 'tanker' });
    const berth = makeBerth({ vesselTypes: ['container', 'bulk'] });
    const result = recommendBerths({ vessel, berths: [berth] });
    expect(result.recommendations).toHaveLength(0);
    expect(result.ineligibleBerths[0].reason).toMatch(/tanker/i);
  });
});

// ── Valid berth recommendation ────────────────────────────────────────────────

describe('recommendBerths — valid recommendation', () => {
  it('recommends a compatible berth with a positive score', () => {
    const vessel = makeVessel({ type: 'container', loa: 200, draught: 9 });
    const berth = makeBerth({
      terminalZone: 'North',
      vesselTypes: ['container'],
      maxLOA: 300,
      maxDraught: 12,
      craneCount: 4,
      cranesAvailable: 4,
    });
    const result = recommendBerths({ vessel, berths: [berth] });
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].score).toBeGreaterThan(0);
    expect(result.topRecommendation).not.toBeNull();
  });

  it('returns reasons explaining the score', () => {
    const result = recommendBerths({ vessel: makeVessel(), berths: [makeBerth()] });
    expect(result.recommendations[0].reasons.length).toBeGreaterThan(0);
  });
});

// ── Ranking ───────────────────────────────────────────────────────────────────

describe('recommendBerths — ranking', () => {
  it('ranks berth with more cranes above berth with no cranes', () => {
    const vessel = makeVessel({ type: 'container', loa: 200, draught: 9, priority: 3 });
    const berthWithCranes = makeBerth({
      _id: 'b-cranes',
      berthCode: 'B01',
      craneCount: 4,
      cranesAvailable: 4,
    });
    const berthNoCranes = makeBerth({
      _id: 'b-nocranes',
      berthCode: 'B02',
      craneCount: 0,
      cranesAvailable: 0,
    });
    const result = recommendBerths({ vessel, berths: [berthNoCranes, berthWithCranes] });
    expect(result.recommendations[0].berthCode).toBe('B01');
  });

  it('topRecommendation is the first in the ranked list', () => {
    const vessel = makeVessel();
    const berths = [
      makeBerth({ _id: 'b1', berthCode: 'B01', craneCount: 4, cranesAvailable: 4 }),
      makeBerth({ _id: 'b2', berthCode: 'B02', craneCount: 1, cranesAvailable: 1 }),
    ];
    const result = recommendBerths({ vessel, berths });
    expect(result.topRecommendation.berthCode).toBe(result.recommendations[0].berthCode);
  });
});

// ── Priority bonus ────────────────────────────────────────────────────────────

describe('recommendBerths — priority bonus', () => {
  it('awards extra score to Priority-1 vessel at a crane-ready berth', () => {
    const normalVessel = makeVessel({ priority: 3 });
    const urgentVessel = makeVessel({ priority: 1 });
    const berth = makeBerth({ craneCount: 4, cranesAvailable: 4 });

    const normalResult = recommendBerths({ vessel: normalVessel, berths: [berth] });
    const urgentResult = recommendBerths({ vessel: urgentVessel, berths: [berth] });

    expect(urgentResult.recommendations[0].score).toBeGreaterThan(
      normalResult.recommendations[0].score
    );
  });
});

// ── No recommendations when no berths ────────────────────────────────────────

describe('recommendBerths — empty berths', () => {
  it('returns empty recommendations when no berths exist', () => {
    const result = recommendBerths({ vessel: makeVessel(), berths: [] });
    expect(result.recommendations).toHaveLength(0);
    expect(result.topRecommendation).toBeNull();
  });
});
