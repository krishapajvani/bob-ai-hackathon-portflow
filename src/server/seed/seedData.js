/**
 * seedData.js — Populates the MongoDB database with realistic
 * port-operation sample data for development and demonstration.
 *
 * Run with:  npm run seed   (from src/server/)
 *
 * WARNING: This script DROPS all existing data in the four collections
 * before inserting the seed data. Do NOT run against production.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Vessel = require('../models/Vessel');
const Berth = require('../models/Berth');
const Crane = require('../models/Crane');
const Route = require('../models/Route');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a Date offset from now by the given number of hours. */
function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

// ── Seed data ────────────────────────────────────────────────────────────────

const berths = [
  {
    berthCode: 'B01',
    terminalZone: 'North',
    maxLOA: 400,
    maxDraught: 16,
    berthLength: 420,
    vesselTypes: ['container'],
    status: 'occupied',
    craneCount: 4,
    cranesAvailable: 0,
    occupiedUntil: hoursFromNow(6),
  },
  {
    berthCode: 'B02',
    terminalZone: 'North',
    maxLOA: 350,
    maxDraught: 14,
    berthLength: 360,
    vesselTypes: ['container'],
    status: 'occupied',
    craneCount: 3,
    cranesAvailable: 1,
    occupiedUntil: hoursFromNow(3),
  },
  {
    berthCode: 'B03',
    terminalZone: 'North',
    maxLOA: 300,
    maxDraught: 12,
    berthLength: 310,
    vesselTypes: ['container', 'general'],
    status: 'available',
    craneCount: 2,
    cranesAvailable: 2,
    occupiedUntil: null,
  },
  {
    berthCode: 'B04',
    terminalZone: 'South',
    maxLOA: 320,
    maxDraught: 13,
    berthLength: 330,
    vesselTypes: ['bulk', 'general'],
    status: 'occupied',
    craneCount: 2,
    cranesAvailable: 0,
    occupiedUntil: hoursFromNow(8),
  },
  {
    berthCode: 'B05',
    terminalZone: 'South',
    maxLOA: 280,
    maxDraught: 11,
    berthLength: 290,
    vesselTypes: ['bulk'],
    status: 'available',
    craneCount: 2,
    cranesAvailable: 2,
    occupiedUntil: null,
  },
  {
    berthCode: 'B06',
    terminalZone: 'East',
    maxLOA: 250,
    maxDraught: 10,
    berthLength: 260,
    vesselTypes: ['tanker'],
    status: 'maintenance',
    craneCount: 1,
    cranesAvailable: 0,
    occupiedUntil: hoursFromNow(24),
  },
  {
    berthCode: 'B07',
    terminalZone: 'East',
    maxLOA: 200,
    maxDraught: 9,
    berthLength: 210,
    vesselTypes: ['tanker', 'general'],
    status: 'available',
    craneCount: 1,
    cranesAvailable: 1,
    occupiedUntil: null,
  },
  {
    berthCode: 'B08',
    terminalZone: 'West',
    maxLOA: 230,
    maxDraught: 8,
    berthLength: 240,
    vesselTypes: ['roro', 'general'],
    status: 'occupied',
    craneCount: 0,
    cranesAvailable: 0,
    occupiedUntil: hoursFromNow(4),
  },
];

const vessels = [
  // ── Currently berthed ────────────────────────────────────────────────────
  {
    imoNumber: 'IMO9876543',
    name: 'MSC Aurora',
    type: 'container',
    loa: 366,
    beam: 51,
    draught: 14.5,
    cargoTEU: 10000,
    eta: hoursFromNow(-8),
    etd: hoursFromNow(6),
    status: 'berthed',
    priority: 2,
    notes: 'Refrigerated cargo — expedite unloading',
  },
  {
    imoNumber: 'IMO9765432',
    name: 'CMA CGM Titan',
    type: 'container',
    loa: 400,
    beam: 59,
    draught: 16,
    cargoTEU: 23000,
    eta: hoursFromNow(-12),
    etd: hoursFromNow(3),
    status: 'berthed',
    priority: 3,
  },
  {
    imoNumber: 'IMO9654321',
    name: 'Bulk Carrier Pacific Star',
    type: 'bulk',
    loa: 290,
    beam: 45,
    draught: 12.8,
    cargoTonnage: 75000,
    eta: hoursFromNow(-5),
    etd: hoursFromNow(8),
    status: 'berthed',
    priority: 3,
  },
  {
    imoNumber: 'IMO9543210',
    name: 'RoRo Express Valencia',
    type: 'roro',
    loa: 210,
    beam: 28,
    draught: 7.5,
    cargoTonnage: 8000,
    eta: hoursFromNow(-2),
    etd: hoursFromNow(4),
    status: 'berthed',
    priority: 2,
  },
  // ── Waiting at anchor ────────────────────────────────────────────────────
  {
    imoNumber: 'IMO9432109',
    name: 'Ever Horizon',
    type: 'container',
    loa: 334,
    beam: 48,
    draught: 14,
    cargoTEU: 8500,
    eta: hoursFromNow(-3),
    etd: hoursFromNow(12),
    status: 'waiting',
    priority: 2,
    notes: 'Waiting for B01 or B02 to clear',
  },
  {
    imoNumber: 'IMO9321098',
    name: 'Maersk Resilience',
    type: 'container',
    loa: 295,
    beam: 42,
    draught: 11.5,
    cargoTEU: 6000,
    eta: hoursFromNow(-1),
    etd: hoursFromNow(18),
    status: 'waiting',
    priority: 3,
  },
  {
    imoNumber: 'IMO9210987',
    name: 'Nordic Bulker',
    type: 'bulk',
    loa: 260,
    beam: 40,
    draught: 10.2,
    cargoTonnage: 45000,
    eta: hoursFromNow(-2),
    etd: hoursFromNow(14),
    status: 'waiting',
    priority: 4,
  },
  {
    imoNumber: 'IMO9109876',
    name: 'Tanker Gulf Star',
    type: 'tanker',
    loa: 245,
    beam: 42,
    draught: 9.8,
    cargoTonnage: 80000,
    eta: hoursFromNow(-4),
    etd: hoursFromNow(10),
    status: 'waiting',
    priority: 1,
    notes: 'PRIORITY 1 — fuel supply for port operations',
  },
  // ── Inbound (ETA in future) ──────────────────────────────────────────────
  {
    imoNumber: 'IMO9098765',
    name: 'OOCL Singapore',
    type: 'container',
    loa: 323,
    beam: 46,
    draught: 13,
    cargoTEU: 7800,
    eta: hoursFromNow(4),
    etd: hoursFromNow(28),
    status: 'inbound',
    priority: 3,
  },
  {
    imoNumber: 'IMO8987654',
    name: 'Evergreen Atlas',
    type: 'container',
    loa: 400,
    beam: 59,
    draught: 15.5,
    cargoTEU: 20000,
    eta: hoursFromNow(7),
    etd: hoursFromNow(36),
    status: 'inbound',
    priority: 2,
  },
  {
    imoNumber: 'IMO8876543',
    name: 'Bulk Carrier Serena',
    type: 'bulk',
    loa: 275,
    beam: 43,
    draught: 11,
    cargoTonnage: 60000,
    eta: hoursFromNow(10),
    etd: hoursFromNow(42),
    status: 'inbound',
    priority: 4,
  },
  {
    imoNumber: 'IMO8765432',
    name: 'Tanker Adriatica',
    type: 'tanker',
    loa: 230,
    beam: 38,
    draught: 9,
    cargoTonnage: 55000,
    eta: hoursFromNow(14),
    etd: hoursFromNow(38),
    status: 'inbound',
    priority: 3,
  },
  {
    imoNumber: 'IMO8654321',
    name: 'CMA CGM Pearl',
    type: 'container',
    loa: 300,
    beam: 48,
    draught: 12,
    cargoTEU: 7000,
    eta: hoursFromNow(20),
    etd: hoursFromNow(48),
    status: 'inbound',
    priority: 3,
  },
  {
    imoNumber: 'IMO8543210',
    name: 'General Cargo Vega',
    type: 'general',
    loa: 185,
    beam: 28,
    draught: 7.2,
    cargoTonnage: 12000,
    eta: hoursFromNow(26),
    etd: hoursFromNow(54),
    status: 'inbound',
    priority: 5,
  },
];

const cranes = [
  // B01 cranes (4 total, all assigned — berth occupied)
  { identifier: 'CRN-B01-01', type: 'ship-to-shore', berthCode: 'B01', status: 'assigned', movesPerHour: 30 },
  { identifier: 'CRN-B01-02', type: 'ship-to-shore', berthCode: 'B01', status: 'assigned', movesPerHour: 30 },
  { identifier: 'CRN-B01-03', type: 'ship-to-shore', berthCode: 'B01', status: 'assigned', movesPerHour: 28 },
  { identifier: 'CRN-B01-04', type: 'ship-to-shore', berthCode: 'B01', status: 'assigned', movesPerHour: 28 },
  // B02 cranes (3 total, 2 assigned, 1 available)
  { identifier: 'CRN-B02-01', type: 'ship-to-shore', berthCode: 'B02', status: 'assigned', movesPerHour: 30 },
  { identifier: 'CRN-B02-02', type: 'ship-to-shore', berthCode: 'B02', status: 'assigned', movesPerHour: 30 },
  { identifier: 'CRN-B02-03', type: 'gantry', berthCode: 'B02', status: 'available', movesPerHour: 20 },
  // B03 cranes (2 total, both available)
  { identifier: 'CRN-B03-01', type: 'ship-to-shore', berthCode: 'B03', status: 'available', movesPerHour: 25 },
  { identifier: 'CRN-B03-02', type: 'ship-to-shore', berthCode: 'B03', status: 'available', movesPerHour: 25 },
  // B04 cranes (2 total, both assigned)
  { identifier: 'CRN-B04-01', type: 'mobile', berthCode: 'B04', status: 'assigned', movesPerHour: 18 },
  { identifier: 'CRN-B04-02', type: 'mobile', berthCode: 'B04', status: 'assigned', movesPerHour: 18 },
  // B05 cranes (2 total, both available)
  { identifier: 'CRN-B05-01', type: 'mobile', berthCode: 'B05', status: 'available', movesPerHour: 18 },
  { identifier: 'CRN-B05-02', type: 'mobile', berthCode: 'B05', status: 'available', movesPerHour: 18 },
  // B06 cranes (1 total, maintenance)
  { identifier: 'CRN-B06-01', type: 'reach-stacker', berthCode: 'B06', status: 'maintenance', movesPerHour: 12 },
  // B07 cranes (1 total, available)
  { identifier: 'CRN-B07-01', type: 'reach-stacker', berthCode: 'B07', status: 'available', movesPerHour: 12 },
];

const routes = [
  {
    name: 'Main Channel to North Terminal',
    fromNode: 'MAIN',
    toNode: 'NORTH',
    distanceNm: 2.5,
    avgTransitHours: 0.5,
    maxDraught: 16,
    suitableFor: ['container', 'bulk', 'tanker', 'roro', 'general'],
    isActive: true,
  },
  {
    name: 'Main Channel to South Terminal',
    fromNode: 'MAIN',
    toNode: 'SOUTH',
    distanceNm: 3.0,
    avgTransitHours: 0.6,
    maxDraught: 14,
    suitableFor: ['bulk', 'general'],
    isActive: true,
  },
  {
    name: 'Main Channel to East Terminal',
    fromNode: 'MAIN',
    toNode: 'EAST',
    distanceNm: 4.0,
    avgTransitHours: 0.8,
    maxDraught: 12,
    suitableFor: ['tanker', 'general'],
    isActive: true,
  },
  {
    name: 'Anchorage A1 — Container Holding',
    fromNode: 'MAIN',
    toNode: 'ANCHORAGE_A1',
    distanceNm: 5.0,
    avgTransitHours: 1.0,
    maxDraught: 18,
    suitableFor: ['container', 'bulk', 'tanker', 'roro', 'general'],
    destinationPort: {
      portCode: 'ANCH_A1',
      portName: 'North Anchorage Area A1',
      country: 'Local',
      typicalWaitHours: 0,
    },
    isActive: true,
  },
  {
    name: 'Diversion Route — Port Meridian (30 nm)',
    fromNode: 'MAIN',
    toNode: 'PORT_MERIDIAN',
    distanceNm: 30,
    avgTransitHours: 5.0,
    maxDraught: 15,
    suitableFor: ['container', 'bulk', 'general'],
    destinationPort: {
      portCode: 'PMER',
      portName: 'Port Meridian',
      country: 'Regional',
      typicalWaitHours: 3,
    },
    isActive: true,
  },
  {
    name: 'Diversion Route — Port Cassini (45 nm)',
    fromNode: 'MAIN',
    toNode: 'PORT_CASSINI',
    distanceNm: 45,
    avgTransitHours: 8.0,
    maxDraught: 14,
    suitableFor: ['bulk', 'tanker'],
    destinationPort: {
      portCode: 'PCAS',
      portName: 'Port Cassini',
      country: 'Regional',
      typicalWaitHours: 1,
    },
    isActive: true,
  },
  {
    name: 'Shallow Inner Channel (LOA ≤ 200 m)',
    fromNode: 'MAIN',
    toNode: 'INNER',
    distanceNm: 1.5,
    avgTransitHours: 0.3,
    minDraught: 0,
    maxDraught: 8,
    suitableFor: ['roro', 'general'],
    isActive: true,
  },
];

// ── Main seeding function ─────────────────────────────────────────────────────

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/portflow';

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected.');

  // Drop existing data
  console.log('Dropping existing collections...');
  await Promise.all([
    Vessel.deleteMany({}),
    Berth.deleteMany({}),
    Crane.deleteMany({}),
    Route.deleteMany({}),
  ]);

  // Insert berths first (vessels reference them)
  console.log('Seeding berths...');
  const insertedBerths = await Berth.insertMany(berths);
  console.log(`  ✓ ${insertedBerths.length} berths inserted`);

  // Build a berthCode → _id lookup
  const berthIdByCode = {};
  insertedBerths.forEach((b) => {
    berthIdByCode[b.berthCode] = b._id;
  });

  // Assign berthed vessels to their berths
  const vesselAssignments = {
    'IMO9876543': 'B02',   // MSC Aurora → B02
    'IMO9765432': 'B01',   // CMA CGM Titan → B01
    'IMO9654321': 'B04',   // Bulk Carrier Pacific Star → B04
    'IMO9543210': 'B08',   // RoRo Express Valencia → B08
  };

  const vesselDocs = vessels.map((v) => {
    const berthCode = vesselAssignments[v.imoNumber];
    return {
      ...v,
      assignedBerthId: berthCode ? berthIdByCode[berthCode] : null,
    };
  });

  console.log('Seeding vessels...');
  const insertedVessels = await Vessel.insertMany(vesselDocs);
  console.log(`  ✓ ${insertedVessels.length} vessels inserted`);

  // Build vessel _id lookup for crane assignment
  const vesselIdByImo = {};
  insertedVessels.forEach((v) => {
    vesselIdByImo[v.imoNumber] = v._id;
  });

  // Update berths with their current vessel
  const berthVesselMap = {
    'B01': 'IMO9765432',
    'B02': 'IMO9876543',
    'B04': 'IMO9654321',
    'B08': 'IMO9543210',
  };
  for (const [code, imo] of Object.entries(berthVesselMap)) {
    await Berth.findByIdAndUpdate(berthIdByCode[code], {
      currentVesselId: vesselIdByImo[imo],
    });
  }

  // Assign cranes to their berthed vessels
  const craneVesselMap = {
    'CRN-B01-01': 'IMO9765432',
    'CRN-B01-02': 'IMO9765432',
    'CRN-B01-03': 'IMO9765432',
    'CRN-B01-04': 'IMO9765432',
    'CRN-B02-01': 'IMO9876543',
    'CRN-B02-02': 'IMO9876543',
    'CRN-B04-01': 'IMO9654321',
    'CRN-B04-02': 'IMO9654321',
  };

  const craneDocs = cranes.map((c) => {
    const imo = craneVesselMap[c.identifier];
    return {
      ...c,
      assignedVesselId: imo ? vesselIdByImo[imo] : null,
      availableFrom: imo ? hoursFromNow(6) : null,
    };
  });

  console.log('Seeding cranes...');
  const insertedCranes = await Crane.insertMany(craneDocs);
  console.log(`  ✓ ${insertedCranes.length} cranes inserted`);

  console.log('Seeding routes...');
  const insertedRoutes = await Route.insertMany(routes);
  console.log(`  ✓ ${insertedRoutes.length} routes inserted`);

  console.log('\n✅ Seed complete.');
  console.log(`   Berths : ${insertedBerths.length}`);
  console.log(`   Vessels: ${insertedVessels.length}`);
  console.log(`   Cranes : ${insertedCranes.length}`);
  console.log(`   Routes : ${insertedRoutes.length}`);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
