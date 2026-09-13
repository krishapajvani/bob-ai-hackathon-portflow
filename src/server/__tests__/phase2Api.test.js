/**
 * phase2Api.test.js
 *
 * Integration tests for the Phase 2 API endpoints.
 * Spins up the Express app without a real MongoDB connection.
 * Uses mongoose in-memory mocking via jest mocks so no real DB is needed.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');

// ── Mock mongoose models ──────────────────────────────────────────────────────
// We mock the Vessel, Berth and Route models so the API endpoints
// can be tested without a live database.

jest.mock('../models/Vessel');
jest.mock('../models/Berth');
jest.mock('../models/Route');

const Vessel = require('../models/Vessel');
const Berth = require('../models/Berth');
const Route = require('../models/Route');

// ── Shared fixture data ───────────────────────────────────────────────────────

function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}
function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

const FAKE_VESSEL_ID = new mongoose.Types.ObjectId().toString();
const FAKE_BERTH_ID = new mongoose.Types.ObjectId().toString();

const fakeVessel = {
  _id: FAKE_VESSEL_ID,
  name: 'Test Vessel',
  imoNumber: 'IMO9999001',
  type: 'container',
  loa: 200,
  beam: 30,
  draught: 10,
  eta: hoursAgo(1),
  status: 'waiting',
  priority: 2,
  notes: '',
};

const fakeBerth = {
  _id: FAKE_BERTH_ID,
  berthCode: 'B01',
  terminalZone: 'North',
  maxLOA: 300,
  maxDraught: 14,
  berthLength: 310,
  vesselTypes: ['container'],
  craneCount: 4,
  cranesAvailable: 4,
  status: 'available',
  occupiedUntil: null,
  currentVesselId: null,
};

const fakeRoute = {
  _id: new mongoose.Types.ObjectId().toString(),
  name: 'Main to North',
  fromNode: 'MAIN',
  toNode: 'NORTH',
  distanceNm: 5,
  avgTransitHours: 1,
  maxDraught: 16,
  hasHazard: false,
  isActive: true,
  suitableFor: ['container', 'bulk', 'tanker', 'roro', 'general'],
  destinationPort: { portCode: 'NORTH', portName: 'North Port', country: 'Local', typicalWaitHours: 1 },
};

// ── Helper: set up model mocks ────────────────────────────────────────────────

function setupMocks({ vessels = [fakeVessel], berths = [fakeBerth], routes = [fakeRoute] } = {}) {
  // Vessel.find returns an object with .lean() — simulate the Mongoose query chain
  Vessel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(vessels) });
  Vessel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(vessels[0] || null) });

  Berth.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(berths) });
  Berth.findById.mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(berths[0] || null),
  });

  Route.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(routes), sort: jest.fn().mockResolvedValue(routes) });
  Route.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(routes[0] || null) });
}

afterAll(async () => {
  await mongoose.connection.close();
});

// ── GET /api/congestion ───────────────────────────────────────────────────────

describe('GET /api/congestion', () => {
  beforeEach(() => setupMocks());

  it('returns 200 with a congestion assessment', async () => {
    const res = await request(app).get('/api/congestion');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('overallScore');
    expect(res.body.data).toHaveProperty('riskLevel');
    expect(res.body.data).toHaveProperty('factors');
    expect(res.body.data).toHaveProperty('recommendedActions');
  });

  it('riskLevel is one of LOW/MEDIUM/HIGH/CRITICAL', async () => {
    const res = await request(app).get('/api/congestion');
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(res.body.data.riskLevel);
  });
});

// ── GET /api/congestion/vessels/:id ──────────────────────────────────────────

describe('GET /api/congestion/vessels/:id', () => {
  beforeEach(() => setupMocks());

  it('returns 200 with vessel congestion context', async () => {
    const res = await request(app).get(`/api/congestion/vessels/${FAKE_VESSEL_ID}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('vessel');
    expect(res.body.data).toHaveProperty('vesselImpact');
    expect(res.body.data).toHaveProperty('portCongestion');
  });

  it('returns 400 for an invalid vessel ID', async () => {
    const res = await request(app).get('/api/congestion/vessels/not-a-valid-id');
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when vessel is not found', async () => {
    Vessel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const missingId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/congestion/vessels/${missingId}`);
    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/berths/recommend/:vesselId ──────────────────────────────────────

describe('GET /api/berths/recommend/:vesselId', () => {
  beforeEach(() => setupMocks());

  it('returns 200 with berth recommendations', async () => {
    const res = await request(app).get(`/api/berths/recommend/${FAKE_VESSEL_ID}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('recommendations');
    expect(res.body.data).toHaveProperty('ineligibleBerths');
    expect(res.body.data).toHaveProperty('topRecommendation');
  });

  it('returns 400 for an invalid vessel ID', async () => {
    const res = await request(app).get('/api/berths/recommend/bad-id');
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when the vessel is not found', async () => {
    Vessel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const missingId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/berths/recommend/${missingId}`);
    expect(res.statusCode).toBe(404);
  });

  it('returns no recommendations for a maintenance berth', async () => {
    setupMocks({ berths: [{ ...fakeBerth, status: 'maintenance' }] });
    const res = await request(app).get(`/api/berths/recommend/${FAKE_VESSEL_ID}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.recommendations).toHaveLength(0);
    expect(res.body.data.ineligibleBerths).toHaveLength(1);
  });
});

// ── GET /api/routes/recommend/:vesselId ──────────────────────────────────────

describe('GET /api/routes/recommend/:vesselId', () => {
  beforeEach(() => setupMocks());

  it('returns 200 with route recommendations', async () => {
    const res = await request(app).get(`/api/routes/recommend/${FAKE_VESSEL_ID}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('recommendations');
    expect(res.body.data).toHaveProperty('excludedRoutes');
  });

  it('returns 400 for an invalid vessel ID', async () => {
    const res = await request(app).get('/api/routes/recommend/bad-id');
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when the vessel is not found', async () => {
    Vessel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const missingId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/routes/recommend/${missingId}`);
    expect(res.statusCode).toBe(404);
  });

  it('excludes a route whose draught limit is below vessel draught', async () => {
    const shallowRoute = { ...fakeRoute, maxDraught: 5 }; // vessel draught is 10
    setupMocks({ routes: [shallowRoute] });
    const res = await request(app).get(`/api/routes/recommend/${FAKE_VESSEL_ID}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.recommendations).toHaveLength(0);
    expect(res.body.data.excludedRoutes).toHaveLength(1);
    expect(res.body.data.excludedRoutes[0].reason).toMatch(/draught/i);
  });
});
