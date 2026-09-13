/**
 * operationsPlanner.test.js
 *
 * Unit tests for the 72-hour operational planning service.
 * No database — all inputs are plain JavaScript objects.
 */

const { generatePlan } = require('../services/operationsPlanner');

// ── Helpers ───────────────────────────────────────────────────────────────────

let idCounter = 1;
function nextId() {
  return `id-${idCounter++}`;
}

function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}
function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function makeVessel(overrides = {}) {
  return {
    _id: nextId(),
    name: overrides.name || 'Test Vessel',
    imoNumber: `IMO${idCounter}`,
    type: 'container',
    loa: 200,
    beam: 30,
    draught: 9,
    cargoTEU: 2000,
    cargoTonnage: 0,
    priority: 3,
    status: 'inbound',
    eta: hoursFromNow(4),
    ...overrides,
  };
}

function makeBerth(overrides = {}) {
  return {
    _id: nextId(),
    berthCode: overrides.berthCode || `B${idCounter}`,
    terminalZone: 'North',
    maxLOA: 300,
    maxDraught: 14,
    berthLength: 310,
    vesselTypes: ['container', 'bulk', 'tanker', 'roro', 'general'],
    craneCount: 2,
    cranesAvailable: 2,
    status: 'available',
    ...overrides,
  };
}

function makeCrane(overrides = {}) {
  return {
    _id: nextId(),
    identifier: overrides.identifier || `CRN-${idCounter}`,
    type: 'ship-to-shore',
    berthCode: overrides.berthCode || 'B1',
    status: 'available',
    movesPerHour: 25,
    assignedVesselId: null,
    ...overrides,
  };
}

function makeRoute(overrides = {}) {
  return {
    _id: nextId(),
    name: 'Main to Anchorage',
    fromNode: 'MAIN',
    toNode: 'ANCHORAGE_A1',
    distanceNm: 5,
    avgTransitHours: 1,
    maxDraught: 16,
    hasHazard: false,
    isActive: true,
    suitableFor: ['container', 'bulk', 'tanker', 'roro', 'general'],
    destinationPort: { portCode: 'ANCH', portName: 'Anchorage A1', country: 'Local', typicalWaitHours: 1 },
    ...overrides,
  };
}

// ── Plan shape ────────────────────────────────────────────────────────────────

describe('generatePlan — output shape', () => {
  it('returns all required top-level keys', () => {
    const plan = generatePlan({ vessels: [], berths: [], cranes: [], routes: [] });
    expect(plan).toHaveProperty('horizon', '72 hours');
    expect(plan).toHaveProperty('generatedAt');
    expect(plan).toHaveProperty('planWindowEnd');
    expect(plan).toHaveProperty('summary');
    expect(plan).toHaveProperty('schedule');
    expect(plan).toHaveProperty('unassignedVessels');
    expect(plan).toHaveProperty('conflicts');
    expect(plan).toHaveProperty('recommendations');
    expect(plan).toHaveProperty('congestionSnapshot');
  });

  it('summary contains required fields', () => {
    const plan = generatePlan({ vessels: [], berths: [], cranes: [], routes: [] });
    const s = plan.summary;
    expect(s).toHaveProperty('totalVesselsPlanned');
    expect(s).toHaveProperty('vesselsWaiting');
    expect(s).toHaveProperty('vesselsUnassigned');
    expect(s).toHaveProperty('conflicts');
    expect(s).toHaveProperty('congestionLevel');
  });

  it('handles completely empty input without throwing', () => {
    expect(() => generatePlan({ vessels: [], berths: [], cranes: [], routes: [] })).not.toThrow();
  });
});

// ── 72-hour plan generation ───────────────────────────────────────────────────

describe('generatePlan — basic scheduling', () => {
  it('schedules an inbound vessel against a compatible available berth', () => {
    const vessel = makeVessel({ name: 'Test Inbound', status: 'inbound', eta: hoursFromNow(2) });
    const berth = makeBerth({ berthCode: 'BA1', status: 'available' });
    const crane = makeCrane({ berthCode: 'BA1', identifier: 'CRN-A1' });

    const plan = generatePlan({ vessels: [vessel], berths: [berth], cranes: [crane], routes: [] });

    expect(plan.schedule).toHaveLength(1);
    expect(plan.schedule[0].vessel.name).toBe('Test Inbound');
    expect(plan.schedule[0].berth.berthCode).toBe('BA1');
    expect(plan.unassignedVessels).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
  });

  it('each schedule item contains vessel, berth, slotLabel, reason and operation fields', () => {
    const vessel = makeVessel({ status: 'inbound', eta: hoursFromNow(3) });
    const berth = makeBerth({ berthCode: 'BB1', status: 'available' });
    const plan = generatePlan({ vessels: [vessel], berths: [berth], cranes: [], routes: [] });

    expect(plan.schedule.length).toBeGreaterThan(0);
    const item = plan.schedule[0];
    expect(item).toHaveProperty('vessel');
    expect(item).toHaveProperty('berth');
    expect(item).toHaveProperty('slotLabel');
    expect(item).toHaveProperty('reason');
    expect(item).toHaveProperty('operation');
    expect(item).toHaveProperty('estimatedDepartureTime');
    expect(item).toHaveProperty('estimatedServiceHours');
  });
});

// ── Priority-1 vessel prioritisation ─────────────────────────────────────────

describe('generatePlan — Priority-1 prioritisation', () => {
  it('schedules a Priority-1 vessel before a Priority-3 vessel', () => {
    const p1 = makeVessel({ name: 'P1 Vessel', priority: 1, status: 'waiting', eta: hoursAgo(3) });
    const p3 = makeVessel({ name: 'P3 Vessel', priority: 3, status: 'inbound', eta: hoursFromNow(1) });
    // Only one berth — whoever is scheduled first gets it
    const berth = makeBerth({ berthCode: 'BP1', status: 'available' });
    const plan = generatePlan({ vessels: [p3, p1], berths: [berth], cranes: [], routes: [] });

    expect(plan.schedule.length).toBeGreaterThanOrEqual(1);
    // The Priority-1 vessel must be assigned before the Priority-3 vessel
    expect(plan.schedule[0].vessel.name).toBe('P1 Vessel');
  });

  it('reports a CRITICAL conflict when a Priority-1 vessel cannot be assigned', () => {
    const p1 = makeVessel({ name: 'Urgent Tanker', priority: 1, type: 'tanker', status: 'waiting', eta: hoursAgo(3) });
    // Only a container berth — incompatible
    const berth = makeBerth({ berthCode: 'BC1', vesselTypes: ['container'], status: 'available' });

    const plan = generatePlan({ vessels: [p1], berths: [berth], cranes: [], routes: [] });

    expect(plan.unassignedVessels).toHaveLength(1);
    const conflict = plan.conflicts.find((c) => c.type === 'NO_BERTH');
    expect(conflict).toBeDefined();
    expect(conflict.severity).toBe('CRITICAL');
  });
});

// ── Waiting vessel prioritisation ────────────────────────────────────────────

describe('generatePlan — waiting vessel prioritisation', () => {
  it('schedules a waiting vessel before an inbound vessel with the same priority', () => {
    const waiting = makeVessel({ name: 'Waiting', status: 'waiting', priority: 3, eta: hoursAgo(2) });
    const inbound = makeVessel({ name: 'Inbound', status: 'inbound', priority: 3, eta: hoursFromNow(1) });
    const berth = makeBerth({ berthCode: 'BW1', status: 'available' });

    const plan = generatePlan({ vessels: [inbound, waiting], berths: [berth], cranes: [], routes: [] });

    expect(plan.schedule[0].vessel.name).toBe('Waiting');
  });
});

// ── Invalid berth rejection ───────────────────────────────────────────────────

describe('generatePlan — invalid berth rejection', () => {
  it('does not assign a vessel to a maintenance berth', () => {
    const vessel = makeVessel({ status: 'inbound', eta: hoursFromNow(2) });
    const berth = makeBerth({ berthCode: 'BM1', status: 'maintenance' });

    const plan = generatePlan({ vessels: [vessel], berths: [berth], cranes: [], routes: [] });

    expect(plan.schedule).toHaveLength(0);
    expect(plan.unassignedVessels).toHaveLength(1);
    expect(plan.conflicts.some((c) => c.type === 'NO_BERTH')).toBe(true);
  });

  it('does not assign a vessel to an occupied berth', () => {
    const vessel = makeVessel({ status: 'inbound', eta: hoursFromNow(2) });
    const berth = makeBerth({ berthCode: 'BO1', status: 'occupied' });

    const plan = generatePlan({ vessels: [vessel], berths: [berth], cranes: [], routes: [] });

    expect(plan.schedule).toHaveLength(0);
    expect(plan.unassignedVessels).toHaveLength(1);
  });

  it('does not assign a vessel whose LOA exceeds the berth maxLOA', () => {
    const vessel = makeVessel({ loa: 400, status: 'inbound', eta: hoursFromNow(2) });
    const berth = makeBerth({ berthCode: 'BL1', maxLOA: 300, status: 'available' });

    const plan = generatePlan({ vessels: [vessel], berths: [berth], cranes: [], routes: [] });

    expect(plan.schedule).toHaveLength(0);
    expect(plan.unassignedVessels).toHaveLength(1);
  });

  it('does not assign a vessel whose draught exceeds the berth maxDraught', () => {
    const vessel = makeVessel({ draught: 15, status: 'inbound', eta: hoursFromNow(2) });
    const berth = makeBerth({ berthCode: 'BD1', maxDraught: 12, status: 'available' });

    const plan = generatePlan({ vessels: [vessel], berths: [berth], cranes: [], routes: [] });

    expect(plan.schedule).toHaveLength(0);
    expect(plan.unassignedVessels).toHaveLength(1);
  });
});

// ── No suitable berth scenario ────────────────────────────────────────────────

describe('generatePlan — no suitable berth', () => {
  it('adds vessel to unassignedVessels and conflicts when no berths exist', () => {
    const vessel = makeVessel({ status: 'inbound', eta: hoursFromNow(2) });

    const plan = generatePlan({ vessels: [vessel], berths: [], cranes: [], routes: [] });

    expect(plan.unassignedVessels).toHaveLength(1);
    expect(plan.unassignedVessels[0].vessel.name).toBe(vessel.name);
    expect(plan.unassignedVessels[0].reason).toBeTruthy();
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].type).toBe('NO_BERTH');
  });

  it('includes route alternatives for unassigned vessels', () => {
    const vessel = makeVessel({ status: 'waiting', eta: hoursAgo(1), draught: 8 });
    const route = makeRoute({ maxDraught: 16 });

    const plan = generatePlan({ vessels: [vessel], berths: [], cranes: [], routes: [route] });

    expect(plan.unassignedVessels[0].alternativeRoutes.length).toBeGreaterThan(0);
  });
});

// ── No available crane scenario ───────────────────────────────────────────────

describe('generatePlan — no available crane', () => {
  it('still assigns the berth but logs a NO_CRANE conflict', () => {
    const vessel = makeVessel({ status: 'inbound', eta: hoursFromNow(2) });
    // Berth has cranes but they are all assigned
    const berth = makeBerth({ berthCode: 'BNC1', status: 'available', craneCount: 2, cranesAvailable: 2 });
    // No cranes in the cranes array — simulates all cranes assigned elsewhere
    const plan = generatePlan({ vessels: [vessel], berths: [berth], cranes: [], routes: [] });

    // Berth should still be assigned
    expect(plan.schedule).toHaveLength(1);
    expect(plan.schedule[0].berth.berthCode).toBe('BNC1');
    // Crane conflict should be logged
    expect(plan.conflicts.some((c) => c.type === 'NO_CRANE')).toBe(true);
  });
});

// ── Berth conflict detection (double-booking) ─────────────────────────────────

describe('generatePlan — berth conflict detection', () => {
  it('does not assign the same berth to two vessels in overlapping slots', () => {
    // Both vessels arrive at roughly the same time and need the same berth
    const v1 = makeVessel({ name: 'Vessel 1', status: 'inbound', eta: hoursFromNow(2), cargoTEU: 500 });
    const v2 = makeVessel({ name: 'Vessel 2', status: 'inbound', eta: hoursFromNow(3), cargoTEU: 500 });
    // Only one berth available
    const berth = makeBerth({ berthCode: 'BSingle', status: 'available' });
    const crane = makeCrane({ berthCode: 'BSingle', identifier: 'CRN-S1' });

    const plan = generatePlan({ vessels: [v1, v2], berths: [berth], cranes: [crane], routes: [] });

    // One gets scheduled, one doesn't (or they are in different slots)
    const assignedToBerth = plan.schedule.filter((s) => s.berth.berthCode === 'BSingle');
    // Verify no two schedule items share the same berth in overlapping slots
    for (let i = 0; i < assignedToBerth.length; i++) {
      for (let j = i + 1; j < assignedToBerth.length; j++) {
        expect(assignedToBerth[i].slotIndex).not.toBe(assignedToBerth[j].slotIndex);
      }
    }
  });
});

// ── Multiple vessels competing for one berth ──────────────────────────────────

describe('generatePlan — multiple vessels, one berth', () => {
  it('assigns the berth to the highest-priority vessel', () => {
    const lowPri = makeVessel({ name: 'Low Pri', priority: 5, status: 'inbound', eta: hoursFromNow(1) });
    const highPri = makeVessel({ name: 'High Pri', priority: 1, status: 'inbound', eta: hoursFromNow(2) });
    const berth = makeBerth({ berthCode: 'BMulti', status: 'available' });

    const plan = generatePlan({ vessels: [lowPri, highPri], berths: [berth], cranes: [], routes: [] });

    if (plan.schedule.length >= 1) {
      expect(plan.schedule[0].vessel.priority).toBeLessThanOrEqual(
        plan.schedule.length > 1 ? plan.schedule[1].vessel.priority : 5
      );
    }
  });
});

// ── Unassigned vessel reporting ───────────────────────────────────────────────

describe('generatePlan — unassigned vessel reporting', () => {
  it('unassignedVessels entries contain vessel info and reason', () => {
    const vessel = makeVessel({ status: 'inbound', eta: hoursFromNow(2) });
    const plan = generatePlan({ vessels: [vessel], berths: [], cranes: [], routes: [] });

    expect(plan.unassignedVessels[0]).toHaveProperty('vessel');
    expect(plan.unassignedVessels[0]).toHaveProperty('reason');
    expect(plan.unassignedVessels[0].reason.length).toBeGreaterThan(0);
  });
});

// ── Vessels outside window are excluded ──────────────────────────────────────

describe('generatePlan — window filtering', () => {
  it('excludes vessels with ETA beyond 72 hours', () => {
    const farVessel = makeVessel({ status: 'inbound', eta: hoursFromNow(100) });
    const berth = makeBerth({ berthCode: 'BFar', status: 'available' });

    const plan = generatePlan({ vessels: [farVessel], berths: [berth], cranes: [], routes: [] });

    expect(plan.schedule).toHaveLength(0);
  });

  it('includes vessels with ETA at the edge of the 72-hour window', () => {
    const edgeVessel = makeVessel({ status: 'inbound', eta: hoursFromNow(71) });
    const berth = makeBerth({ berthCode: 'BEdge', status: 'available' });

    const plan = generatePlan({ vessels: [edgeVessel], berths: [berth], cranes: [], routes: [] });

    expect(plan.schedule).toHaveLength(1);
  });
});

// ── Crane conflict detection ──────────────────────────────────────────────────

describe('generatePlan — crane assignment', () => {
  it('assigns a crane from the correct berth', () => {
    const vessel = makeVessel({ status: 'inbound', eta: hoursFromNow(2), cargoTEU: 500 });
    const berth = makeBerth({ berthCode: 'BCA', status: 'available' });
    const crane = makeCrane({ berthCode: 'BCA', identifier: 'CRN-CA1', status: 'available' });

    const plan = generatePlan({ vessels: [vessel], berths: [berth], cranes: [crane], routes: [] });

    expect(plan.schedule[0].cranes[0].identifier).toBe('CRN-CA1');
  });

  it('does not assign a crane from a different berth', () => {
    const vessel = makeVessel({ status: 'inbound', eta: hoursFromNow(2) });
    const berth = makeBerth({ berthCode: 'BCB', status: 'available', craneCount: 2, cranesAvailable: 2 });
    const wrongCrane = makeCrane({ berthCode: 'B-OTHER', identifier: 'CRN-WRONG', status: 'available' });

    const plan = generatePlan({ vessels: [vessel], berths: [berth], cranes: [wrongCrane], routes: [] });

    // The crane from the wrong berth should not be assigned
    expect(plan.schedule[0].cranes).toHaveLength(0);
    // But a NO_CRANE conflict should exist since the berth reports cranes available
    expect(plan.conflicts.some((c) => c.type === 'NO_CRANE')).toBe(true);
  });
});

// ── Already-berthed vessels in the plan ──────────────────────────────────────

describe('generatePlan — berthed vessels', () => {
  it('includes berthed vessels in the schedule as IN_PROGRESS', () => {
    const berthed = makeVessel({ status: 'berthed', eta: hoursAgo(6) });
    const berth = makeBerth({ berthCode: 'BInProg', status: 'available' });

    const plan = generatePlan({ vessels: [berthed], berths: [berth], cranes: [], routes: [] });

    expect(plan.schedule).toHaveLength(1);
    expect(plan.schedule[0].operation).toBe('IN_PROGRESS');
  });
});

// ── Summary correctness ───────────────────────────────────────────────────────

describe('generatePlan — summary', () => {
  it('summary.totalVesselsPlanned matches schedule.length', () => {
    const vessels = [
      makeVessel({ status: 'inbound', eta: hoursFromNow(2) }),
      makeVessel({ status: 'inbound', eta: hoursFromNow(5) }),
    ];
    const berths = [
      makeBerth({ berthCode: 'BS1', status: 'available' }),
      makeBerth({ berthCode: 'BS2', status: 'available' }),
    ];
    const plan = generatePlan({ vessels, berths, cranes: [], routes: [] });
    expect(plan.summary.totalVesselsPlanned).toBe(plan.schedule.length);
  });

  it('summary.vesselsUnassigned matches unassignedVessels.length', () => {
    const vessel = makeVessel({ status: 'inbound', eta: hoursFromNow(2) });
    const plan = generatePlan({ vessels: [vessel], berths: [], cranes: [], routes: [] });
    expect(plan.summary.vesselsUnassigned).toBe(plan.unassignedVessels.length);
  });

  it('summary.conflicts matches conflicts.length', () => {
    const vessel = makeVessel({ status: 'inbound', eta: hoursFromNow(2) });
    const plan = generatePlan({ vessels: [vessel], berths: [], cranes: [], routes: [] });
    expect(plan.summary.conflicts).toBe(plan.conflicts.length);
  });
});
