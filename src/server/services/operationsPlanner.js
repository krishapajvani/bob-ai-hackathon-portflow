/**
 * operationsPlanner.js
 *
 * Deterministic 72-hour operational planning service for PortFlow AI.
 *
 * ── Algorithm overview ────────────────────────────────────────────────────────
 *
 *  1. SNAPSHOT
 *     Load all active vessels (not departed), all berths, all cranes,
 *     all active routes, then take a congestion snapshot with the existing
 *     congestionEngine.
 *
 *  2. CANDIDATE VESSELS
 *     Select vessels whose ETA falls within now → now+72h, plus any vessel
 *     already waiting or berthed (they are already in port).
 *     Exclude vessels with status "departed".
 *
 *  3. PRIORITISATION
 *     Sort the candidate list by a composite priority key:
 *       a) operational urgency tier  (waiting > inbound > berthed)
 *       b) vessel.priority field     (1 = most urgent)
 *       c) ETA ascending             (earlier arrival first)
 *     This ensures Priority-1 vessels that are already waiting are
 *     always considered before later arrivals.
 *
 *  4. TIME-SLOT ALLOCATION
 *     The planner works in 6-hour slots over 72 hours (12 slots total).
 *     Each slot tracks:
 *       - which berths are committed during that slot
 *       - which cranes are committed during that slot
 *     A vessel "fills" a slot range based on its estimated service duration.
 *
 *  5. BERTH ASSIGNMENT
 *     For each candidate vessel (in priority order):
 *       - Call recommendBerths() with the current available-berth view
 *       - Take the top recommendation
 *       - If none available → vessel goes to unassignedVessels with reason
 *       - If assigned → mark berth as committed for those slots
 *
 *  6. CRANE ASSIGNMENT
 *     After berth assignment, allocate cranes for that berth/slot range:
 *       - Use cranes whose berthCode matches the assigned berth
 *       - Only take cranes not already committed in those slots
 *       - Number of cranes = min(needed, available)
 *       - If 0 cranes available → log a conflict (still assign the berth)
 *
 *  7. SERVICE DURATION ESTIMATE
 *     Container: cargoTEU / (cranes × movesPerHour)   — rounded up to 1h min
 *     Bulk/Tanker/RoRo/General: fixed defaults based on vessel type
 *     Min duration: 2 h   Max duration: 48 h (clamp)
 *
 *  8. CONFLICT DETECTION
 *     After the main loop, scan for:
 *       - Vessels with no berth recommendation at all
 *       - Vessels with a berth but no crane
 *       - Priority-1 vessels that could not be assigned
 *       - Overlapping berth/crane allocations (can happen with complex schedules)
 *
 *  9. ROUTE RECOMMENDATIONS
 *     For every unassigned vessel, call recommendRoutes() to suggest
 *     diversion options. Included in the output under each unassigned entry.
 *
 * ── Slot model ────────────────────────────────────────────────────────────────
 *
 *   Slot 0:  T+0  →  T+6h
 *   Slot 1:  T+6  →  T+12h
 *   ...
 *   Slot 11: T+66 →  T+72h
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   const { generatePlan } = require('./operationsPlanner');
 *   const plan = generatePlan({ vessels, berths, cranes, routes });
 */

const { calculateCongestion } = require('./congestionEngine');
const { recommendBerths } = require('./berthOptimizer');
const { recommendRoutes } = require('./routeAdvisor');

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_HORIZON_HOURS = 72;
const SLOT_SIZE_HOURS = 6;
const TOTAL_SLOTS = PLAN_HORIZON_HOURS / SLOT_SIZE_HOURS; // 12

// Default service durations per vessel type (hours) when cargo info is absent
const DEFAULT_SERVICE_HOURS = {
  container: 12,
  bulk: 18,
  tanker: 10,
  roro: 6,
  general: 8,
};

const MIN_SERVICE_HOURS = 2;
const MAX_SERVICE_HOURS = 48;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return slot index (0-based) for a given hour offset from plan start. */
function slotIndex(hourOffset) {
  return Math.floor(hourOffset / SLOT_SIZE_HOURS);
}

/** Hours from plan start (now) to a given Date. Negative = already past. */
function hoursFromStart(date, planStart) {
  return (new Date(date).getTime() - planStart.getTime()) / (1000 * 60 * 60);
}

/** Clamp a number to [min, max]. */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Estimate service duration (hours) for a vessel.
 * Uses cargo and crane data when available; falls back to type defaults.
 */
function estimateServiceHours(vessel, assignedCranes) {
  const craneCount = assignedCranes.length || 1;
  const avgMovesPerHour =
    assignedCranes.length > 0
      ? assignedCranes.reduce((s, c) => s + (c.movesPerHour || 25), 0) / craneCount
      : 25;

  if (vessel.type === 'container' && vessel.cargoTEU > 0) {
    const hours = vessel.cargoTEU / (craneCount * avgMovesPerHour);
    return clamp(Math.ceil(hours), MIN_SERVICE_HOURS, MAX_SERVICE_HOURS);
  }

  return clamp(
    DEFAULT_SERVICE_HOURS[vessel.type] || 8,
    MIN_SERVICE_HOURS,
    MAX_SERVICE_HOURS
  );
}

/**
 * Build the range of slots [startSlot, endSlot) a vessel will occupy.
 * If the vessel has already arrived (ETA in the past), it starts at slot 0.
 */
function vesselSlotRange(vessel, planStart, durationHours) {
  const etaOffset = hoursFromStart(vessel.eta, planStart);
  const startHour = Math.max(0, etaOffset); // clamp to plan window start
  const endHour = startHour + durationHours;
  const start = Math.min(slotIndex(startHour), TOTAL_SLOTS - 1);
  const end = Math.min(slotIndex(endHour), TOTAL_SLOTS); // exclusive
  return { startSlot: start, endSlot: Math.max(end, start + 1) };
}

/** Returns human-readable slot label, e.g. "T+0h → T+6h (Day 1)" */
function slotLabel(slotIdx, planStart) {
  const startH = slotIdx * SLOT_SIZE_HOURS;
  const endH = startH + SLOT_SIZE_HOURS;
  const day = Math.floor(startH / 24) + 1;
  const startDate = new Date(planStart.getTime() + startH * 3600 * 1000);
  const endDate = new Date(planStart.getTime() + endH * 3600 * 1000);
  return {
    slotIndex: slotIdx,
    day,
    label: `T+${startH}h → T+${endH}h (Day ${day})`,
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
  };
}

/**
 * Build a plain "virtual berth" object that looks like a real Berth document
 * but has modified availability so the optimizer sees it as occupied.
 */
function markBerthOccupied(berth) {
  return { ...berth, status: 'occupied', cranesAvailable: 0 };
}

/**
 * Compute an urgency tier for sorting (lower = more urgent):
 *   0 = waiting at anchor (already overdue)
 *   1 = inbound (en route)
 *   2 = berthed (already served — low replanning urgency)
 *   3 = any other
 */
function urgencyTier(vessel) {
  if (vessel.status === 'waiting') return 0;
  if (vessel.status === 'inbound') return 1;
  if (vessel.status === 'berthed') return 2;
  return 3;
}

/**
 * Build a human-readable reason sentence for a schedule item.
 */
function buildAssignmentReason(vessel, berthRec, cranes, slotInfo) {
  const craneText =
    cranes.length > 0
      ? `${cranes.length} crane(s) assigned (${cranes.map((c) => c.identifier).join(', ')})`
      : 'no cranes available at this berth';

  return (
    `${vessel.name} (${vessel.type}, priority ${vessel.priority}) assigned to ` +
    `berth ${berthRec.berthCode} (${berthRec.terminalZone} zone) — ` +
    `${craneText}. ` +
    `Planned window: ${slotInfo.label}.`
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * generatePlan
 *
 * @param {object} params
 * @param {Array}  params.vessels  - All active vessel documents (plain objects)
 * @param {Array}  params.berths   - All berth documents
 * @param {Array}  params.cranes   - All crane documents
 * @param {Array}  params.routes   - All active route documents
 *
 * @returns {object} Full 72-hour operational plan
 */
function generatePlan({ vessels = [], berths = [], cranes = [], routes = [] }) {
  const planStart = new Date();

  // ── Step 1: Congestion snapshot ─────────────────────────────────────────────
  const congestion = calculateCongestion({ vessels, berths });

  // ── Step 2: Select candidate vessels ────────────────────────────────────────
  // Include: waiting, berthed, inbound within 72 h
  // Exclude: departed
  const candidates = vessels.filter((v) => {
    if (v.status === 'departed') return false;
    if (v.status === 'waiting' || v.status === 'berthed') return true;
    // inbound / departing: only if ETA within the window
    const h = hoursFromStart(v.eta, planStart);
    return h <= PLAN_HORIZON_HOURS;
  });

  // ── Step 3: Prioritise ───────────────────────────────────────────────────────
  const sorted = [...candidates].sort((a, b) => {
    // a) urgency tier
    const tierDiff = urgencyTier(a) - urgencyTier(b);
    if (tierDiff !== 0) return tierDiff;
    // b) vessel priority (1 = highest → lowest number first)
    const priDiff = a.priority - b.priority;
    if (priDiff !== 0) return priDiff;
    // c) ETA ascending
    return new Date(a.eta) - new Date(b.eta);
  });

  // ── Step 4: Track slot-level resource commitments ────────────────────────────
  // Each slot holds a Set of committed berthCodes and craneIdentifiers
  const slotBerths = Array.from({ length: TOTAL_SLOTS }, () => new Set());
  const slotCranes = Array.from({ length: TOTAL_SLOTS }, () => new Set());

  // A mutable copy of berths so the planner can mark berths occupied
  // as it processes vessels (prevents double-assignment in the same slot)
  // Key: berthCode → current effective status per slot
  // We track per-slot occupancy via slotBerths; berthPool stays immutable.
  const berthPool = berths.map((b) => ({ ...b }));
  const cranePool = cranes.map((c) => ({ ...c }));

  const schedule = [];
  const unassignedVessels = [];
  const conflicts = [];

  // ── Step 5 & 6: Assign berths and cranes ─────────────────────────────────────
  for (const vessel of sorted) {
    // Build a berth view that excludes berths already committed
    // in the slots this vessel would occupy.
    // First, estimate duration without cranes (use type default) to compute slots.
    const roughDuration = DEFAULT_SERVICE_HOURS[vessel.type] || 8;
    const roughSlots = vesselSlotRange(vessel, planStart, roughDuration);

    // Available berths for this vessel in those slots
    const availableBerths = berthPool.filter((b) => {
      // Already occupied by the DB status
      if (b.status !== 'available') return false;
      // Committed in any overlapping slot by the planner
      for (let s = roughSlots.startSlot; s < roughSlots.endSlot; s++) {
        if (slotBerths[s] && slotBerths[s].has(b.berthCode)) return false;
      }
      return true;
    });

    // Run the berth optimizer
    const berthResult = recommendBerths({ vessel, berths: availableBerths });

    if (berthResult.recommendations.length === 0) {
      // No suitable berth — collect route alternatives and log
      const routeResult = recommendRoutes({ vessel, routes });

      const conflictMsg =
        `${vessel.name} (priority ${vessel.priority}, ${vessel.type}) ` +
        `cannot be assigned a berth in the current window. ` +
        (availableBerths.length === 0
          ? 'No berths are currently available.'
          : `No berth is compatible with this vessel (LOA ${vessel.loa}m, draught ${vessel.draught}m, type ${vessel.type}).`);

      conflicts.push({
        type: 'NO_BERTH',
        vesselId: vessel._id,
        vesselName: vessel.name,
        vesselPriority: vessel.priority,
        message: conflictMsg,
        severity: vessel.priority === 1 ? 'CRITICAL' : 'WARNING',
        action:
          vessel.priority === 1
            ? 'Immediate operator intervention required — Priority-1 vessel cannot be berthed.'
            : 'Review berth availability and vessel schedule for this arrival.',
      });

      unassignedVessels.push({
        vessel: {
          id: vessel._id,
          name: vessel.name,
          imoNumber: vessel.imoNumber,
          type: vessel.type,
          status: vessel.status,
          priority: vessel.priority,
          eta: vessel.eta,
          loa: vessel.loa,
          draught: vessel.draught,
        },
        reason: conflictMsg,
        alternativeRoutes: routeResult.recommendations.slice(0, 2),
      });

      continue;
    }

    // ── Berth assigned ──────────────────────────────────────────────────────
    const berthRec = berthResult.topRecommendation;

    // Find cranes at this berth that are available in the required slots
    const berthCranes = cranePool.filter(
      (c) => c.berthCode === berthRec.berthCode && c.status === 'available'
    );

    // Compute needed cranes (1 per 500 TEU for containers, 1 otherwise)
    const cranesNeeded =
      vessel.type === 'container' && vessel.cargoTEU > 0
        ? Math.max(1, Math.ceil(vessel.cargoTEU / 500))
        : 1;

    // Filter to cranes not already committed in those rough slots
    const freeCranes = berthCranes.filter((c) => {
      for (let s = roughSlots.startSlot; s < roughSlots.endSlot; s++) {
        if (slotCranes[s] && slotCranes[s].has(c.identifier)) return false;
      }
      return true;
    });

    const assignedCranes = freeCranes.slice(0, cranesNeeded);

    // Now compute the real duration with the actual cranes available
    const durationHours = estimateServiceHours(vessel, assignedCranes);
    const slotRange = vesselSlotRange(vessel, planStart, durationHours);
    const startSlotInfo = slotLabel(slotRange.startSlot, planStart);

    // ── Commit berth and cranes in the slot tracker ─────────────────────────
    for (let s = slotRange.startSlot; s < slotRange.endSlot; s++) {
      if (s < TOTAL_SLOTS) {
        slotBerths[s].add(berthRec.berthCode);
        for (const crane of assignedCranes) {
          slotCranes[s].add(crane.identifier);
        }
      }
    }

    // ── Crane conflict ──────────────────────────────────────────────────────
    if (assignedCranes.length === 0 && berthRec.craneCount > 0) {
      conflicts.push({
        type: 'NO_CRANE',
        vesselId: vessel._id,
        vesselName: vessel.name,
        berthCode: berthRec.berthCode,
        message:
          `${vessel.name} is assigned to berth ${berthRec.berthCode} but no cranes ` +
          `are available at that berth in the planned window. ` +
          `Operations will be delayed until a crane is free.`,
        severity: vessel.priority === 1 ? 'CRITICAL' : 'WARNING',
      });
    }

    const reason = buildAssignmentReason(vessel, berthRec, assignedCranes, startSlotInfo);

    // Build the ETD estimate
    const etaDate = new Date(vessel.eta);
    const serviceStartDate =
      vessel.status === 'waiting' || hoursFromStart(vessel.eta, planStart) < 0
        ? planStart
        : etaDate;
    const etdEstimate = new Date(serviceStartDate.getTime() + durationHours * 3600 * 1000);

    schedule.push({
      // Slot / time info
      slotIndex: slotRange.startSlot,
      slotLabel: startSlotInfo.label,
      slotStartTime: startSlotInfo.startTime,
      estimatedServiceStart: serviceStartDate.toISOString(),
      estimatedDepartureTime: etdEstimate.toISOString(),
      estimatedServiceHours: durationHours,

      // Vessel info
      vessel: {
        id: vessel._id,
        name: vessel.name,
        imoNumber: vessel.imoNumber,
        type: vessel.type,
        status: vessel.status,
        priority: vessel.priority,
        eta: vessel.eta,
        loa: vessel.loa,
        draught: vessel.draught,
        cargoTEU: vessel.cargoTEU || 0,
        cargoTonnage: vessel.cargoTonnage || 0,
      },

      // Assignment info
      berth: {
        id: berthRec.id,
        berthCode: berthRec.berthCode,
        terminalZone: berthRec.terminalZone,
        score: berthRec.score,
      },
      cranes: assignedCranes.map((c) => ({
        id: c._id,
        identifier: c.identifier,
        type: c.type,
        movesPerHour: c.movesPerHour,
      })),
      cranesAssigned: assignedCranes.length,
      craneWarning: assignedCranes.length === 0 && berthRec.craneCount > 0,

      // Operation
      operation: vessel.status === 'berthed' ? 'IN_PROGRESS' : 'PLANNED',
      operationLabel: vessel.status === 'berthed' ? 'In Progress' : 'Planned',
      priority: vessel.priority,

      // Explanation
      reason,
      berthReasons: berthRec.reasons,
      berthWarnings: berthRec.warnings,
    });
  }

  // ── Step 7: Build summary ────────────────────────────────────────────────────
  const summary = {
    totalVesselsPlanned: schedule.length,
    vesselsWaiting: vessels.filter((v) => v.status === 'waiting').length,
    vesselsBerthed: vessels.filter((v) => v.status === 'berthed').length,
    vesselsInbound: candidates.filter((v) => v.status === 'inbound').length,
    vesselsUnassigned: unassignedVessels.length,
    conflicts: conflicts.length,
    congestionLevel: congestion.riskLevel,
    congestionScore: congestion.congestionScore,
  };

  // ── Step 8: High-level operator recommendations ──────────────────────────────
  const recommendations = buildPlanRecommendations(
    schedule,
    unassignedVessels,
    conflicts,
    congestion,
    berths
  );

  return {
    horizon: `${PLAN_HORIZON_HOURS} hours`,
    slotSizeHours: SLOT_SIZE_HOURS,
    totalSlots: TOTAL_SLOTS,
    generatedAt: planStart.toISOString(),
    planWindowEnd: new Date(planStart.getTime() + PLAN_HORIZON_HOURS * 3600 * 1000).toISOString(),
    summary,
    schedule,
    unassignedVessels,
    conflicts,
    recommendations,
    congestionSnapshot: {
      riskLevel: congestion.riskLevel,
      overallScore: congestion.overallScore,
      factors: congestion.factors,
    },
  };
}

// ── Operator recommendations ──────────────────────────────────────────────────

function buildPlanRecommendations(schedule, unassigned, conflicts, congestion, berths) {
  const recs = [];

  const criticalConflicts = conflicts.filter((c) => c.severity === 'CRITICAL');
  if (criticalConflicts.length > 0) {
    recs.push(
      `URGENT: ${criticalConflicts.length} critical conflict(s) require immediate attention — ` +
        criticalConflicts.map((c) => c.vesselName || c.message.split(' ')[0]).join(', ') + '.'
    );
  }

  if (unassigned.length > 0) {
    recs.push(
      `${unassigned.length} vessel(s) could not be scheduled in the 72-hour window: ` +
        unassigned.map((u) => u.vessel.name).join(', ') +
        '. Consider activating diversion routes or expediting current berth clearances.'
    );
  }

  const noCranConflicts = conflicts.filter((c) => c.type === 'NO_CRANE');
  if (noCranConflicts.length > 0) {
    recs.push(
      `${noCranConflicts.length} vessel(s) are assigned berths but have no cranes available. ` +
        'Review crane maintenance schedule and reassign as soon as possible.'
    );
  }

  const maintenanceBerths = berths.filter((b) => b.status === 'maintenance');
  if (maintenanceBerths.length > 0) {
    recs.push(
      `${maintenanceBerths.length} berth(s) are in maintenance ` +
        `(${maintenanceBerths.map((b) => b.berthCode).join(', ')}). ` +
        'Restoring these berths would significantly increase throughput capacity.'
    );
  }

  const p1Scheduled = schedule.filter((s) => s.vessel.priority === 1);
  const p1Unassigned = unassigned.filter((u) => u.vessel.priority === 1);

  if (p1Scheduled.length > 0) {
    recs.push(
      `${p1Scheduled.length} Priority-1 vessel(s) have been assigned berths: ` +
        p1Scheduled.map((s) => `${s.vessel.name} → ${s.berth.berthCode}`).join(', ') + '.'
    );
  }

  if (p1Unassigned.length > 0) {
    recs.push(
      `CRITICAL: ${p1Unassigned.length} Priority-1 vessel(s) remain unscheduled — ` +
        p1Unassigned.map((u) => u.vessel.name).join(', ') +
        '. Immediate operator action required.'
    );
  }

  if (congestion.riskLevel === 'HIGH' || congestion.riskLevel === 'CRITICAL') {
    recs.push(
      `Port congestion is ${congestion.riskLevel} (score: ${congestion.overallScore}). ` +
        'Consider notifying inbound vessels of delays and activating diversion procedures.'
    );
  }

  if (recs.length === 0) {
    recs.push('Port operations are proceeding normally. No immediate action required.');
  }

  return recs;
}

module.exports = { generatePlan };
