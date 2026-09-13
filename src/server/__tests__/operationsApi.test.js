/**
 * operationsApi.test.js
 *
 * Integration tests for GET /api/operations/plan.
 * Mocks all Mongoose models — no real database required.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');

jest.mock('../models/Vessel');
jest.mock('../models/Berth');
jest.mock('../models/Crane');
jest.mock('../models/Route');

const Vessel = require('../models/Vessel');
const Berth = require('../models/Berth');
const Crane = require('../models/Crane');
const Route = require('../models/Route');

// ── Fixture helpers ───────────────────────────────────────────────────────────

function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}
function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

const fakeVessel = {
  _id: new mongoose.Types.ObjectId().toString(),
  name: 'MSC Aurora',
  imoNumber: 'IMO9999999',
  type: 'container',
  loa: 250,
  beam: 38,
  draught: 11,
  cargoTEU: 3000,
  cargoTonnage: 0,
  priority: 2,
  status: 'waiting',
  eta: hoursAgo(2),
  notes: '',
};

const fakeBerth = {
  _id: new mongoose.Types.ObjectId().toString(),
  berthCode: 'B01',
  terminalZone: 'North',
  maxLOA: 300,
  maxDraught: 14,
  berthLength: 310,
  vesselTypes: ['container'],
  craneCount: 2,
  cranesAvailable: 2,
  status: 'available',
  occupiedUntil: null,
  currentVesselId: null,
};

const fakeCrane = {
  _id: new mongoose.Types.ObjectId().toString(),
  identifier: 'CRN-B01-01',
  type: 'ship-to-shore',
  berthCode: 'B01',
  status: 'available',
  movesPerHour: 30,
  assignedVesselId: null,
};

const fakeRoute = {
  _id: new mongoose.Types.ObjectId().toString(),
  name: 'Main to Anchorage A1',
  fromNode: 'MAIN',
  toNode: 'ANCHORAGE_A1',
  distanceNm: 5,
  avgTransitHours: 1,
  maxDraught: 18,
  hasHazard: false,
  isActive: true,
  suitableFor: ['container', 'bulk', 'tanker', 'roro', 'general'],
  destinationPort: { portCode: 'ANCH_A1', portName: 'Anchorage A1', country: 'Local', typicalWaitHours: 0 },
};

function setupMocks({ vessels = [fakeVessel], berths = [fakeBerth], cranes = [fakeCrane], routes = [fakeRoute] } = {}) {
  Vessel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(vessels) });
  Berth.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(berths) });
  Crane.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(cranes) });
  Route.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(routes) });
}

afterAll(async () => {
  await mongoose.connection.close();
});

// ── GET /api/operations/plan ──────────────────────────────────────────────────

describe('GET /api/operations/plan', () => {
  beforeEach(() => setupMocks());

  it('returns 200 with a valid plan structure', async () => {
    const res = await request(app).get('/api/operations/plan');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('horizon', '72 hours');
    expect(res.body.data).toHaveProperty('generatedAt');
    expect(res.body.data).toHaveProperty('summary');
    expect(res.body.data).toHaveProperty('schedule');
    expect(res.body.data).toHaveProperty('unassignedVessels');
    expect(res.body.data).toHaveProperty('conflicts');
    expect(res.body.data).toHaveProperty('recommendations');
    expect(res.body.data).toHaveProperty('congestionSnapshot');
  });

  it('schedules the waiting vessel against the available berth', async () => {
    const res = await request(app).get('/api/operations/plan');
    expect(res.body.data.schedule.length).toBeGreaterThan(0);
    expect(res.body.data.schedule[0].vessel.name).toBe('MSC Aurora');
    expect(res.body.data.schedule[0].berth.berthCode).toBe('B01');
  });

  it('summary.totalVesselsPlanned matches schedule length', async () => {
    const res = await request(app).get('/api/operations/plan');
    expect(res.body.data.summary.totalVesselsPlanned).toBe(res.body.data.schedule.length);
  });

  it('congestionSnapshot has riskLevel and overallScore', async () => {
    const res = await request(app).get('/api/operations/plan');
    expect(res.body.data.congestionSnapshot).toHaveProperty('riskLevel');
    expect(res.body.data.congestionSnapshot).toHaveProperty('overallScore');
  });

  it('returns a plan with no vessels when the database is empty', async () => {
    setupMocks({ vessels: [], berths: [], cranes: [], routes: [] });
    const res = await request(app).get('/api/operations/plan');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.schedule).toHaveLength(0);
    expect(res.body.data.summary.totalVesselsPlanned).toBe(0);
  });

  it('returns conflicts when vessel cannot be assigned', async () => {
    // Berth type mismatch — container vessel, but only tanker berth
    setupMocks({
      berths: [{ ...fakeBerth, vesselTypes: ['tanker'] }],
    });
    const res = await request(app).get('/api/operations/plan');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.conflicts.length).toBeGreaterThan(0);
    expect(res.body.data.unassignedVessels.length).toBeGreaterThan(0);
  });

  it('schedule items contain a human-readable reason', async () => {
    const res = await request(app).get('/api/operations/plan');
    if (res.body.data.schedule.length > 0) {
      const item = res.body.data.schedule[0];
      expect(typeof item.reason).toBe('string');
      expect(item.reason.length).toBeGreaterThan(10);
    }
  });

  it('plan window is 72 hours from now', async () => {
    const res = await request(app).get('/api/operations/plan');
    const start = new Date(res.body.data.generatedAt);
    const end = new Date(res.body.data.planWindowEnd);
    const diffHours = (end - start) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(72, 0);
  });
});
