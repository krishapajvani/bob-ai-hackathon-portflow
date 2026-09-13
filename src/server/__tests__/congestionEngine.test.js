/**
 * congestionEngine.test.js
 *
 * Unit tests for the deterministic congestion scoring model.
 * No database — all inputs are plain JavaScript objects.
 */

const { calculateCongestion, getRiskLevel, WEIGHTS } = require('../services/congestionEngine');

// ── Helpers ───────────────────────────────────────────────────────────────────

function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}
function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function makeVessel(overrides = {}) {
  return {
    _id: 'v1',
    name: 'Test Vessel',
    imoNumber: 'IMO0000001',
    type: 'container',
    loa: 200,
    draught: 10,
    eta: hoursAgo(1),
    status: 'inbound',
    priority: 3,
    ...overrides,
  };
}

function makeBerth(overrides = {}) {
  return {
    _id: 'b1',
    berthCode: 'B01',
    terminalZone: 'North',
    maxLOA: 400,
    maxDraught: 16,
    craneCount: 4,
    cranesAvailable: 4,
    status: 'available',
    ...overrides,
  };
}

// ── getRiskLevel ──────────────────────────────────────────────────────────────

describe('getRiskLevel', () => {
  it('returns LOW for score 0', () => expect(getRiskLevel(0)).toBe('LOW'));
  it('returns LOW for score 35', () => expect(getRiskLevel(35)).toBe('LOW'));
  it('returns MEDIUM for score 36', () => expect(getRiskLevel(36)).toBe('MEDIUM'));
  it('returns MEDIUM for score 60', () => expect(getRiskLevel(60)).toBe('MEDIUM'));
  it('returns HIGH for score 61', () => expect(getRiskLevel(61)).toBe('HIGH'));
  it('returns HIGH for score 80', () => expect(getRiskLevel(80)).toBe('HIGH'));
  it('returns CRITICAL for score 81', () => expect(getRiskLevel(81)).toBe('CRITICAL'));
  it('returns CRITICAL for score 100', () => expect(getRiskLevel(100)).toBe('CRITICAL'));
});

// ── Empty port ────────────────────────────────────────────────────────────────

describe('calculateCongestion — empty port', () => {
  it('returns score 0 for an empty port', () => {
    const result = calculateCongestion({ vessels: [], berths: [] });
    expect(result.overallScore).toBe(0);
    expect(result.riskLevel).toBe('LOW');
  });

  it('returns a well-formed result shape', () => {
    const result = calculateCongestion({ vessels: [], berths: [] });
    expect(result).toHaveProperty('overallScore');
    expect(result).toHaveProperty('riskLevel');
    expect(result).toHaveProperty('factors');
    expect(result).toHaveProperty('affectedVessels');
    expect(result).toHaveProperty('affectedBerths');
    expect(result).toHaveProperty('recommendedActions');
    expect(result).toHaveProperty('calculatedAt');
    expect(result).toHaveProperty('weights');
  });
});

// ── LOW congestion scenario ───────────────────────────────────────────────────

describe('calculateCongestion — LOW scenario', () => {
  it('scores LOW when one vessel is berthed and all berths are available', () => {
    const vessels = [makeVessel({ status: 'berthed' })];
    const berths = [makeBerth({ status: 'available', cranesAvailable: 4 })];
    const result = calculateCongestion({ vessels, berths });
    expect(result.riskLevel).toBe('LOW');
    expect(result.overallScore).toBeLessThanOrEqual(35);
  });
});

// ── MEDIUM congestion scenario ────────────────────────────────────────────────

describe('calculateCongestion — MEDIUM scenario', () => {
  it('scores MEDIUM when 3 berths of 4 are occupied, 3 vessels are waiting and cranes are heavily used', () => {
    const vessels = [
      makeVessel({ _id: 'v1', status: 'waiting', eta: hoursAgo(1) }),
      makeVessel({ _id: 'v2', status: 'waiting', eta: hoursAgo(2) }),
      makeVessel({ _id: 'v3', status: 'waiting', eta: hoursAgo(3) }),
      makeVessel({ _id: 'v4', status: 'berthed' }),
      makeVessel({ _id: 'v5', status: 'berthed' }),
      makeVessel({ _id: 'v6', status: 'berthed' }),
    ];
    const berths = [
      makeBerth({ _id: 'b1', berthCode: 'B01', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
      makeBerth({ _id: 'b2', berthCode: 'B02', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
      makeBerth({ _id: 'b3', berthCode: 'B03', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
      makeBerth({ _id: 'b4', berthCode: 'B04', status: 'available', craneCount: 4, cranesAvailable: 4 }),
    ];
    const result = calculateCongestion({ vessels, berths });
    expect(result.overallScore).toBeGreaterThan(35);
    expect(result.overallScore).toBeLessThanOrEqual(70);
  });
});

// ── HIGH congestion scenario ──────────────────────────────────────────────────

describe('calculateCongestion — HIGH scenario', () => {
  it('scores HIGH when all berths are occupied and 5+ vessels are waiting with all cranes busy', () => {
    const vessels = [
      makeVessel({ _id: 'v1', status: 'waiting', eta: hoursAgo(1) }),
      makeVessel({ _id: 'v2', status: 'waiting', eta: hoursAgo(2) }),
      makeVessel({ _id: 'v3', status: 'waiting', eta: hoursAgo(3) }),
      makeVessel({ _id: 'v4', status: 'waiting', eta: hoursAgo(4) }),
      makeVessel({ _id: 'v5', status: 'waiting', eta: hoursAgo(5) }),
      makeVessel({ _id: 'v6', status: 'berthed' }),
      makeVessel({ _id: 'v7', status: 'berthed' }),
      makeVessel({ _id: 'v8', status: 'berthed' }),
      makeVessel({ _id: 'v9', status: 'berthed' }),
    ];
    const berths = [
      makeBerth({ _id: 'b1', berthCode: 'B01', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
      makeBerth({ _id: 'b2', berthCode: 'B02', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
      makeBerth({ _id: 'b3', berthCode: 'B03', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
      makeBerth({ _id: 'b4', berthCode: 'B04', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
    ];
    const result = calculateCongestion({ vessels, berths });
    expect(result.overallScore).toBeGreaterThan(60);
    expect(result.riskLevel).not.toBe('LOW');
  });
});

// ── CRITICAL / Priority-1 stranded ───────────────────────────────────────────

describe('calculateCongestion — CRITICAL scenario', () => {
  it('scores CRITICAL when port is full, 7 vessels waiting, all cranes busy, and Priority-1 vessel stranded', () => {
    const vessels = [
      makeVessel({ _id: 'v1', status: 'waiting', priority: 1, eta: hoursAgo(5) }),
      makeVessel({ _id: 'v2', status: 'waiting', eta: hoursAgo(3) }),
      makeVessel({ _id: 'v3', status: 'waiting', eta: hoursAgo(2) }),
      makeVessel({ _id: 'v4', status: 'waiting', eta: hoursAgo(1) }),
      makeVessel({ _id: 'v5', status: 'waiting', eta: hoursAgo(2) }),
      makeVessel({ _id: 'v6', status: 'waiting', eta: hoursAgo(3) }),
      makeVessel({ _id: 'v7', status: 'waiting', eta: hoursAgo(4) }),
      makeVessel({ _id: 'v8', status: 'berthed' }),
      makeVessel({ _id: 'v9', status: 'berthed' }),
      makeVessel({ _id: 'v10', status: 'berthed' }),
      makeVessel({ _id: 'v11', status: 'berthed' }),
    ];
    const berths = [
      makeBerth({ _id: 'b1', berthCode: 'B01', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
      makeBerth({ _id: 'b2', berthCode: 'B02', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
      makeBerth({ _id: 'b3', berthCode: 'B03', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
      makeBerth({ _id: 'b4', berthCode: 'B04', status: 'occupied', craneCount: 4, cranesAvailable: 0 }),
    ];
    const result = calculateCongestion({ vessels, berths });
    expect(result.overallScore).toBeGreaterThan(80);
    expect(result.riskLevel).toBe('CRITICAL');
  });

  it('includes the Priority-1 stranded vessel in affectedVessels', () => {
    const p1vessel = makeVessel({ _id: 'v-priority', status: 'waiting', priority: 1, eta: hoursAgo(5) });
    const result = calculateCongestion({ vessels: [p1vessel], berths: [] });
    const ids = result.affectedVessels.map((v) => String(v.id));
    expect(ids).toContain('v-priority');
  });
});

// ── Waiting vessels increase the score ───────────────────────────────────────

describe('calculateCongestion — anchor queue factor', () => {
  it('score increases with each additional waiting vessel', () => {
    const base = calculateCongestion({ vessels: [], berths: [] });
    const withOne = calculateCongestion({
      vessels: [makeVessel({ status: 'waiting', eta: hoursAgo(1) })],
      berths: [],
    });
    const withFour = calculateCongestion({
      vessels: [
        makeVessel({ _id: 'v1', status: 'waiting', eta: hoursAgo(1) }),
        makeVessel({ _id: 'v2', status: 'waiting', eta: hoursAgo(2) }),
        makeVessel({ _id: 'v3', status: 'waiting', eta: hoursAgo(3) }),
        makeVessel({ _id: 'v4', status: 'waiting', eta: hoursAgo(4) }),
      ],
      berths: [],
    });
    expect(withOne.overallScore).toBeGreaterThan(base.overallScore);
    expect(withFour.overallScore).toBeGreaterThan(withOne.overallScore);
  });
});

// ── Maintenance berths increase congestion ────────────────────────────────────

describe('calculateCongestion — maintenance berths', () => {
  it('treats maintenance berths as unavailable (raises berth occupancy factor)', () => {
    const berthsAllAvailable = [
      makeBerth({ _id: 'b1', berthCode: 'B01', status: 'available' }),
      makeBerth({ _id: 'b2', berthCode: 'B02', status: 'available' }),
    ];
    const berthsOneMaintenance = [
      makeBerth({ _id: 'b1', berthCode: 'B01', status: 'maintenance' }),
      makeBerth({ _id: 'b2', berthCode: 'B02', status: 'available' }),
    ];
    const scoreAvailable = calculateCongestion({ vessels: [], berths: berthsAllAvailable });
    const scoreMaintenance = calculateCongestion({ vessels: [], berths: berthsOneMaintenance });
    expect(scoreMaintenance.overallScore).toBeGreaterThan(scoreAvailable.overallScore);
  });
});

// ── Factor weights sum to 1.0 ─────────────────────────────────────────────────

describe('WEIGHTS', () => {
  it('weights sum to 1.0', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
});
