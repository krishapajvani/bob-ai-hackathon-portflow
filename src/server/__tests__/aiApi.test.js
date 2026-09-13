/**
 * aiApi.test.js
 *
 * Integration tests for /api/ai/analysis and /api/ai/vessels/:id.
 * Mocks Mongoose models and the aiService — no real DB or API key needed.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');

// Mock DB models
jest.mock('../models/Vessel');
jest.mock('../models/Berth');
jest.mock('../models/Crane');
jest.mock('../models/Route');

// Mock the AI service so tests are fully isolated
jest.mock('../services/aiService');

const Vessel = require('../models/Vessel');
const Berth = require('../models/Berth');
const Crane = require('../models/Crane');
const Route = require('../models/Route');
const { analysePortSituation } = require('../services/aiService');

// ── Fixture data ──────────────────────────────────────────────────────────────

function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

const FAKE_VESSEL_ID = new mongoose.Types.ObjectId().toString();

const fakeVessel = {
  _id: FAKE_VESSEL_ID,
  name: 'MSC Aurora',
  imoNumber: 'IMO9999001',
  type: 'container',
  loa: 250,
  beam: 38,
  draught: 10,
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
};

const fakeRoute = {
  _id: new mongoose.Types.ObjectId().toString(),
  name: 'Main to Anchorage',
  fromNode: 'MAIN',
  toNode: 'ANCHORAGE_A1',
  distanceNm: 5,
  avgTransitHours: 1,
  maxDraught: 18,
  hasHazard: false,
  isActive: true,
  suitableFor: ['container', 'bulk', 'tanker', 'roro', 'general'],
  destinationPort: { portCode: 'ANCH_A1', portName: 'Anchorage', country: 'Local', typicalWaitHours: 0 },
};

const fakeFallbackResponse = {
  provider: 'deterministic-fallback',
  aiAvailable: false,
  fallbackReason: 'AI_PROVIDER is not set to "watsonx"',
  executiveSummary: 'Port is at HIGH risk.',
  keyRisks: ['4 vessels waiting at anchor.'],
  recommendedActions: ['Expedite berth clearance.'],
  operatorExplanation: 'Review the 72-hour operational plan.',
  priorityVessels: [],
  delayExplanation: [],
  planningInsights: [],
};

function setupMocks() {
  Vessel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([fakeVessel]) });
  Vessel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(fakeVessel) });
  Berth.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([fakeBerth]) });
  Crane.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([fakeCrane]) });
  Route.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([fakeRoute]) });
  analysePortSituation.mockResolvedValue(fakeFallbackResponse);
}

beforeEach(() => jest.clearAllMocks());

afterAll(async () => {
  await mongoose.connection.close();
});

// ── GET /api/ai/analysis ──────────────────────────────────────────────────────

describe('GET /api/ai/analysis', () => {
  beforeEach(() => setupMocks());

  it('returns 200 with success and required data fields', async () => {
    const res = await request(app).get('/api/ai/analysis');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('congestionScore');
    expect(res.body.data).toHaveProperty('congestionLevel');
    expect(res.body.data).toHaveProperty('planSummary');
    expect(res.body.data).toHaveProperty('ai');
  });

  it('always includes deterministic congestion score regardless of AI status', async () => {
    const res = await request(app).get('/api/ai/analysis');
    expect(typeof res.body.data.congestionScore).toBe('number');
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(res.body.data.congestionLevel);
  });

  it('returns the ai provider field', async () => {
    const res = await request(app).get('/api/ai/analysis');
    expect(res.body.data.ai).toHaveProperty('provider');
  });

  it('calls analysePortSituation exactly once', async () => {
    await request(app).get('/api/ai/analysis');
    expect(analysePortSituation).toHaveBeenCalledTimes(1);
  });

  it('returns fallback response when AI is unavailable', async () => {
    const res = await request(app).get('/api/ai/analysis');
    expect(res.body.data.ai.aiAvailable).toBe(false);
    expect(res.body.data.ai.provider).toBe('deterministic-fallback');
  });
});

// ── GET /api/ai/vessels/:id ───────────────────────────────────────────────────

describe('GET /api/ai/vessels/:id', () => {
  beforeEach(() => setupMocks());

  it('returns 200 with vessel context and AI analysis', async () => {
    const res = await request(app).get(`/api/ai/vessels/${FAKE_VESSEL_ID}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('vessel');
    expect(res.body.data).toHaveProperty('congestionScore');
    expect(res.body.data).toHaveProperty('ai');
  });

  it('returns vessel name in the response', async () => {
    const res = await request(app).get(`/api/ai/vessels/${FAKE_VESSEL_ID}`);
    expect(res.body.data.vessel.name).toBe('MSC Aurora');
  });

  it('returns 400 for an invalid vessel ID', async () => {
    const res = await request(app).get('/api/ai/vessels/not-valid');
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 when vessel is not found', async () => {
    Vessel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const missingId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/ai/vessels/${missingId}`);
    expect(res.statusCode).toBe(404);
  });

  it('includes topBerthRecommendation in the response', async () => {
    const res = await request(app).get(`/api/ai/vessels/${FAKE_VESSEL_ID}`);
    // topBerthRecommendation can be null (no compatible berth) or an object
    expect('topBerthRecommendation' in res.body.data).toBe(true);
  });
});
