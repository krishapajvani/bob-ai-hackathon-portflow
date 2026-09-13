/**
 * Plan.jsx — 72-Hour Port Operations Planning Control Center
 *
 * API: GET /api/operations/plan
 *
 * Response shape (from operationsPlanner.js):
 * {
 *   horizon, slotSizeHours, totalSlots,
 *   generatedAt, planWindowEnd,
 *   summary: {
 *     totalVesselsPlanned, vesselsWaiting, vesselsBerthed,
 *     vesselsInbound, vesselsUnassigned, conflicts,
 *     congestionLevel, congestionScore  ← note: this is undefined in engine,
 *                                          use congestionSnapshot.overallScore
 *   },
 *   schedule: [{
 *     slotIndex, slotLabel, slotStartTime,
 *     estimatedServiceStart, estimatedDepartureTime, estimatedServiceHours,
 *     vessel: { id, name, imoNumber, type, status, priority, eta, loa, draught, cargoTEU, cargoTonnage },
 *     berth:  { id, berthCode, terminalZone, score },
 *     cranes: [{ id, identifier, type, movesPerHour }],
 *     cranesAssigned, craneWarning,
 *     operation, operationLabel, priority,
 *     reason, berthReasons, berthWarnings
 *   }],
 *   unassignedVessels: [{
 *     vessel: { id, name, imoNumber, type, status, priority, eta, loa, draught },
 *     reason,
 *     alternativeRoutes: [{ id, name, fromNode, toNode, distanceNm, ... }]
 *   }],
 *   conflicts: [{
 *     type, vesselId, vesselName, vesselPriority?,
 *     berthCode?, message, severity, action?
 *   }],
 *   recommendations: [string],
 *   congestionSnapshot: { riskLevel, overallScore, factors }
 * }
 */

import { useEffect, useState, useCallback } from 'react';
import { operationsApi } from '../api/portflowApi';
import StatusBadge from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import VesselDrawer from '../components/VesselDrawer';

// ─── colour helpers ────────────────────────────────────────────────────────────

const PRIORITY_COLOUR = {
  1: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', label: 'P1 CRITICAL' },
  2: { bg: '#ffedd5', border: '#f97316', text: '#9a3412', label: 'P2 HIGH'     },
  3: { bg: '#fef9c3', border: '#eab308', text: '#854d0e', label: 'P3 MEDIUM'   },
  4: { bg: '#dcfce7', border: '#22c55e', text: '#166534', label: 'P4 NORMAL'   },
  5: { bg: '#f1f5f9', border: '#94a3b8', text: '#475569', label: 'P5 LOW'      },
};

const ZONE_COLOUR = {
  North: '#2563eb', South: '#16a34a', East: '#d97706', West: '#7c3aed',
};

const LEVEL_COLOUR  = { LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#ea580c', CRITICAL: '#dc2626' };
const LEVEL_BG      = { LOW: '#dcfce7', MEDIUM: '#fff7ed', HIGH: '#fff1e6', CRITICAL: '#fee2e2' };

const TYPE_ICON = {
  container: '📦', bulk: '⚓', tanker: '🛢', roro: '🚗', general: '📋',
};

// ─── tiny helpers ──────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function pColour(p) { return PRIORITY_COLOUR[p] || PRIORITY_COLOUR[5]; }

// ─── Plan summary metrics ──────────────────────────────────────────────────────

function PlanSummary({ plan }) {
  const s    = plan.summary;
  const cong = plan.congestionSnapshot;
  const level  = cong?.riskLevel  || s.congestionLevel || '—';
  const score  = cong?.overallScore ?? '—';

  const metrics = [
    { label: 'Vessels Planned',  value: s.totalVesselsPlanned, accent: '#2563eb' },
    { label: 'Waiting',          value: s.vesselsWaiting,      accent: s.vesselsWaiting > 2 ? '#ea580c' : '#57606a' },
    { label: 'Berthed',          value: s.vesselsBerthed,      accent: '#0f6cbd' },
    { label: 'Inbound',          value: s.vesselsInbound,      accent: '#7c3aed' },
    { label: 'Unassigned',       value: s.vesselsUnassigned,   accent: s.vesselsUnassigned > 0 ? '#dc2626' : '#1a7f37' },
    { label: 'Conflicts',        value: s.conflicts,           accent: s.conflicts > 0 ? '#dc2626' : '#1a7f37' },
    { label: 'Congestion Score', value: score === '—' ? '—' : `${score}`,
      accent: LEVEL_COLOUR[level] || '#57606a' },
    { label: 'Congestion Level', value: level,
      accent: LEVEL_COLOUR[level] || '#57606a' },
  ];

  return (
    <div className="pl-metrics-grid">
      {metrics.map(m => (
        <div key={m.label} className="pl-metric-card" style={{ borderLeft: `4px solid ${m.accent}` }}>
          <div className="pl-metric-label">{m.label}</div>
          <div className="pl-metric-value" style={{ color: m.accent }}>{m.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Congestion context strip ──────────────────────────────────────────────────

function CongestionStrip({ snap }) {
  if (!snap) return null;
  const level  = snap.riskLevel   || 'LOW';
  const score  = snap.overallScore ?? 0;
  const colour = LEVEL_COLOUR[level] || '#57606a';

  const FACTOR_SHORT = {
    berthOccupancy:   'Berth Occ',
    anchorQueue:      'Anchor Q',
    craneUtilisation: 'Crane Util',
    inboundPressure:  'Inbound',
    priorityStranded: 'P1 Alert',
  };

  return (
    <div className="pl-cong-strip">
      <div className="pl-cong-strip-left">
        <span className="pl-cong-label">Congestion</span>
        <span className="pl-cong-pill" style={{ background: LEVEL_BG[level], color: colour }}>
          {level}
        </span>
        <span className="pl-cong-score" style={{ color: colour }}>{score}<span className="pl-cong-max">/100</span></span>
      </div>

      {snap.factors && (
        <div className="pl-cong-factors">
          {Object.entries(snap.factors).map(([key, f]) => {
            const fc = f.score >= 75 ? '#dc2626' : f.score >= 45 ? '#d97706' : '#16a34a';
            return (
              <div key={key} className="pl-cong-factor">
                <span className="pl-cong-factor-name">{FACTOR_SHORT[key] || key}</span>
                <div className="pl-cong-factor-bar">
                  <div style={{ width: `${f.score}%`, background: fc, height: '100%', borderRadius: 2 }} />
                </div>
                <span className="pl-cong-factor-score" style={{ color: fc }}>{f.score}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Plan metadata ─────────────────────────────────────────────────────────────

function PlanMeta({ plan }) {
  return (
    <div className="pl-meta-bar">
      <span>🕐 Generated: <strong>{fmtDateTime(plan.generatedAt)}</strong></span>
      <span>⏱ Horizon: <strong>{plan.horizon}</strong></span>
      <span>📅 Window end: <strong>{fmtDateShort(plan.planWindowEnd)}</strong></span>
      <span>🗂 Slots: <strong>{plan.totalSlots} × {plan.slotSizeHours}h</strong></span>
    </div>
  );
}

// ─── Gantt-style 72-hour timeline ─────────────────────────────────────────────

// Build a 72-hour grid with 6-hour columns (12 slots).
// Each schedule item is placed into the column that matches its slotIndex.
// Items in the same slot are stacked vertically.

const SLOT_LABELS_SHORT = [
  'T+0', 'T+6', 'T+12', 'T+18',   // Day 1
  'T+24','T+30','T+36','T+42',    // Day 2
  'T+48','T+54','T+60','T+66',    // Day 3
];

const DAY_SLOTS = [
  { day: 'Day 1', slots: [0, 1, 2, 3] },
  { day: 'Day 2', slots: [4, 5, 6, 7] },
  { day: 'Day 3', slots: [8, 9, 10, 11] },
];

function TimelineBlock({ item, onSelect }) {
  const pc = pColour(item.vessel.priority);
  const zone = item.berth?.terminalZone;
  const zc = ZONE_COLOUR[zone] || '#94a3b8';

  return (
    <div
      className={`pl-tl-block ${item.craneWarning ? 'pl-tl-block-warn' : ''} ${item.operation === 'IN_PROGRESS' ? 'pl-tl-block-live' : ''}`}
      style={{ borderLeft: `3px solid ${pc.border}`, background: pc.bg }}
      onClick={() => onSelect(item)}
      title={`${item.vessel.name} → ${item.berth?.berthCode} | ${fmtTime(item.estimatedServiceStart)} – ${fmtTime(item.estimatedDepartureTime)}`}
    >
      <div className="pl-tl-block-header">
        <span className="pl-tl-pri" style={{ background: pc.border, color: '#fff' }}>P{item.vessel.priority}</span>
        {item.operation === 'IN_PROGRESS' && <span className="pl-tl-live">LIVE</span>}
        {item.craneWarning && <span className="pl-tl-warn">⚠</span>}
      </div>
      <div className="pl-tl-name">{item.vessel.name}</div>
      <div className="pl-tl-sub">
        <span style={{ color: zc }}>■</span>
        {item.berth?.berthCode}
        <span className="pl-tl-sep">·</span>
        {TYPE_ICON[item.vessel.type] || '🚢'} {item.vessel.type}
      </div>
      <div className="pl-tl-times">
        {fmtTime(item.estimatedServiceStart)} – {fmtTime(item.estimatedDepartureTime)}
        <span className="pl-tl-dur">{item.estimatedServiceHours}h</span>
      </div>
      {item.cranesAssigned > 0 && (
        <div className="pl-tl-cranes">🏗 {item.cranesAssigned} crane{item.cranesAssigned > 1 ? 's' : ''}</div>
      )}
    </div>
  );
}

function Timeline({ schedule, onSelect }) {
  // Group items by slotIndex (0-11)
  const bySlot = {};
  for (const item of schedule) {
    const s = item.slotIndex ?? 0;
    (bySlot[s] = bySlot[s] || []).push(item);
  }

  return (
    <div className="pl-timeline-wrap">
      <div className="pl-tl-outer">
        {/* Day headers */}
        <div className="pl-tl-day-headers">
          {DAY_SLOTS.map(({ day }) => (
            <div key={day} className="pl-tl-day-header">{day}</div>
          ))}
        </div>

        {/* Slot column headers */}
        <div className="pl-tl-slot-headers">
          {SLOT_LABELS_SHORT.map((lbl, i) => (
            <div key={i} className="pl-tl-slot-header">
              <span>{lbl}</span>
            </div>
          ))}
        </div>

        {/* Content: 12 columns */}
        <div className="pl-tl-grid">
          {Array.from({ length: 12 }, (_, slotIdx) => (
            <div
              key={slotIdx}
              className={`pl-tl-col ${slotIdx % 4 === 0 ? 'pl-tl-col-day-start' : ''}`}
            >
              {(bySlot[slotIdx] || []).map((item, i) => (
                <TimelineBlock key={i} item={item} onSelect={onSelect} />
              ))}
              {(bySlot[slotIdx] || []).length === 0 && (
                <div className="pl-tl-empty-col" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Priority vessels panel ────────────────────────────────────────────────────

function PriorityPanel({ schedule, unassigned, onSelect }) {
  const p1Sched  = schedule.filter(i => i.vessel.priority === 1);
  const p2Sched  = schedule.filter(i => i.vessel.priority === 2);
  const p1Unassn = unassigned.filter(u => u.vessel.priority === 1);

  if (p1Sched.length === 0 && p2Sched.length === 0 && p1Unassn.length === 0) return null;

  return (
    <div className="pl-panel">
      <div className="pl-panel-title">
        🚨 Priority Operations
        {p1Unassn.length > 0 && (
          <span className="pl-panel-alert-badge">
            {p1Unassn.length} P1 UNASSIGNED
          </span>
        )}
      </div>

      {p1Unassn.length > 0 && (
        <div className="pl-priority-alert">
          🚨 <strong>CRITICAL:</strong> {p1Unassn.length} Priority-1 vessel{p1Unassn.length > 1 ? 's' : ''} could
          not be assigned a berth — <strong>immediate operator action required</strong>.
          {p1Unassn.map(u => (
            <span key={u.vessel.id} className="pl-priority-alert-name"> {u.vessel.name}</span>
          ))}
        </div>
      )}

      {[...p1Sched, ...p2Sched].map((item, i) => {
        const pc = pColour(item.vessel.priority);
        return (
          <div
            key={i}
            className="pl-priority-row"
            style={{ borderLeft: `4px solid ${pc.border}` }}
            onClick={() => onSelect(item)}
          >
            <span className="pl-priority-badge" style={{ background: pc.border, color: '#fff' }}>
              {pc.label}
            </span>
            <div className="pl-priority-vessel">
              <strong>{item.vessel.name}</strong>
              <span className="pf-muted-text" style={{ fontSize: 12 }}> · {item.vessel.imoNumber}</span>
            </div>
            <div className="pl-priority-detail">
              <StatusBadge status={item.vessel.status} />
              <span>{item.berth?.berthCode} ({item.berth?.terminalZone})</span>
              <span>{fmtTime(item.estimatedServiceStart)} – {fmtTime(item.estimatedDepartureTime)}</span>
              <span>{item.estimatedServiceHours}h</span>
              {item.craneWarning && <span className="pl-crane-warn-tag">⚠ No cranes</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Conflicts panel ───────────────────────────────────────────────────────────

function ConflictsPanel({ conflicts }) {
  if (conflicts.length === 0) {
    return (
      <div className="pl-panel">
        <div className="pl-panel-title">Scheduling Conflicts</div>
        <div className="pl-ok-state">✅ No scheduling conflicts detected</div>
      </div>
    );
  }

  return (
    <div className="pl-panel pl-panel-conflict">
      <div className="pl-panel-title">
        ⚠ Scheduling Conflicts
        <span className="pl-conflict-count">{conflicts.length}</span>
      </div>
      <div className="pl-conflict-list">
        {conflicts.map((c, i) => {
          const isCritical = c.severity === 'CRITICAL';
          return (
            <div key={i} className={`pl-conflict-item ${isCritical ? 'pl-conflict-critical' : 'pl-conflict-warning'}`}>
              <div className="pl-conflict-header">
                <span className={`pl-conflict-severity ${isCritical ? 'pl-sev-critical' : 'pl-sev-warning'}`}>
                  {c.severity}
                </span>
                <span className="pl-conflict-type">{c.type.replace(/_/g, ' ')}</span>
                {c.vesselName && (
                  <span className="pl-conflict-vessel">{c.vesselName}</span>
                )}
                {c.vesselPriority && (
                  <span className={`pf-priority pf-priority-${c.vesselPriority}`}>
                    P{c.vesselPriority}
                  </span>
                )}
                {c.berthCode && (
                  <span className="pl-conflict-berth">Berth {c.berthCode}</span>
                )}
              </div>
              <div className="pl-conflict-msg">{c.message}</div>
              {c.action && (
                <div className="pl-conflict-action">→ {c.action}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Unassigned vessels panel ──────────────────────────────────────────────────

function UnassignedPanel({ unassigned }) {
  if (unassigned.length === 0) {
    return (
      <div className="pl-panel">
        <div className="pl-panel-title">Unassigned Vessels</div>
        <div className="pl-ok-state">✅ All vessels have been assigned berths</div>
      </div>
    );
  }

  return (
    <div className="pl-panel pl-panel-warn">
      <div className="pl-panel-title">
        Unassigned Vessels
        <span className="pl-conflict-count">{unassigned.length}</span>
      </div>
      <div className="pf-table-scroll">
        <table className="pf-table">
          <thead>
            <tr>
              <th>Vessel</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Status</th>
              <th>LOA / Draught</th>
              <th>ETA</th>
              <th>Reason</th>
              <th>Alt Routes</th>
            </tr>
          </thead>
          <tbody>
            {unassigned.map((u, i) => {
              const v = u.vessel;
              return (
                <tr key={i} className={v.priority === 1 ? 'pl-row-critical' : ''}>
                  <td>
                    <div className="pf-vessel-name-text">{v.name}</div>
                    <div className="pf-vessel-imo">{v.imoNumber}</div>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{v.type}</td>
                  <td>
                    <span className={`pf-priority pf-priority-${v.priority}`}>P{v.priority}</span>
                  </td>
                  <td><StatusBadge status={v.status} /></td>
                  <td className="pf-muted-text" style={{ fontSize: 12 }}>
                    {v.loa}m / {v.draught}m
                  </td>
                  <td className="pf-muted-text" style={{ fontSize: 12 }}>
                    {fmtDateShort(v.eta)}
                  </td>
                  <td className="pl-unassign-reason">{u.reason}</td>
                  <td>
                    {u.alternativeRoutes?.length > 0 ? (
                      <div className="pl-alt-routes">
                        {u.alternativeRoutes.map((r, ri) => (
                          <div key={ri} className="pl-alt-route">
                            <strong>{r.name}</strong>
                            <span className="pf-muted-text"> {r.distanceNm}nm ~{r.avgTransitHours}h</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="pf-muted-text">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Recommendations panel ─────────────────────────────────────────────────────

function RecommendationsPanel({ recommendations }) {
  if (!recommendations?.length) return null;
  return (
    <div className="pl-panel">
      <div className="pl-panel-title">Operator Recommendations</div>
      <div className="pl-rec-list">
        {recommendations.map((r, i) => {
          const isUrgent = r.startsWith('URGENT') || r.startsWith('CRITICAL');
          return (
            <div key={i} className={`pl-rec-item ${isUrgent ? 'pl-rec-urgent' : 'pl-rec-normal'}`}>
              {isUrgent ? '🚨 ' : '→ '}{r}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Schedule detail panel (below timeline) ────────────────────────────────────

function SchedulePanel({ schedule, onSelect }) {
  if (schedule.length === 0) {
    return (
      <div className="pl-panel">
        <div className="pl-panel-title">Vessel Schedule</div>
        <div className="pl-ok-state pf-muted-text">No vessels scheduled in this window</div>
      </div>
    );
  }

  // Group by day
  const byDay = schedule.reduce((acc, item) => {
    const day = item.slotLabel?.match(/Day (\d+)/)?.[1] || '1';
    (acc[day] = acc[day] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="pl-panel">
      <div className="pl-panel-title">Full Vessel Schedule</div>
      <div className="pf-table-scroll">
        <table className="pf-table">
          <thead>
            <tr>
              <th>Pri</th>
              <th>Vessel</th>
              <th>Type</th>
              <th>Status</th>
              <th>Berth</th>
              <th>Slot</th>
              <th>Start</th>
              <th>ETD</th>
              <th>Dur</th>
              <th>Cranes</th>
              <th>Op</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byDay).sort(([a], [b]) => +a - +b).map(([day, items]) => (
              <>
                <tr key={`day-${day}`} className="pl-day-divider">
                  <td colSpan={11}>Day {day}</td>
                </tr>
                {items.map((item, i) => (
                  <tr
                    key={i}
                    className={`vt-row ${item.craneWarning ? 'pf-row-warn' : ''} ${item.vessel.priority === 1 ? 'pl-row-critical' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelect(item)}
                  >
                    <td>
                      <span className={`pf-priority pf-priority-${item.vessel.priority}`}>
                        P{item.vessel.priority}
                      </span>
                    </td>
                    <td>
                      <div className="pf-vessel-name-text">{item.vessel.name}</div>
                      <div className="pf-vessel-imo">{item.vessel.imoNumber}</div>
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{item.vessel.type}</td>
                    <td><StatusBadge status={item.vessel.status} /></td>
                    <td>
                      <span className="pf-berth-code">{item.berth?.berthCode}</span>
                      <span className="pf-muted-text" style={{ fontSize: 11 }}> {item.berth?.terminalZone}</span>
                    </td>
                    <td className="pf-muted-text" style={{ fontSize: 11 }}>{item.slotLabel}</td>
                    <td className="pf-muted-text">{fmtTime(item.estimatedServiceStart)}</td>
                    <td className="pf-muted-text">{fmtTime(item.estimatedDepartureTime)}</td>
                    <td className="pf-muted-text">{item.estimatedServiceHours}h</td>
                    <td>
                      {item.cranesAssigned > 0
                        ? <span className="pl-crane-count">🏗 {item.cranesAssigned}</span>
                        : item.craneWarning
                        ? <span className="pl-crane-warn-tag">⚠ None</span>
                        : <span className="pf-muted-text">—</span>}
                    </td>
                    <td>
                      <StatusBadge status={item.operation === 'IN_PROGRESS' ? 'berthed' : 'inbound'} />
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Plan() {
  const [plan,         setPlan]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [drawerVessel, setDrawerVessel] = useState(null);   // VesselDrawer target

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await operationsApi.getPlan();
      setPlan(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Handle a timeline block or table row click.
  // If the vessel has an _id we can open the full VesselDrawer.
  // Otherwise show a lightweight in-page detail.
  function handleItemSelect(item) {
    if (item?.vessel?.id) {
      // Build a minimal vessel object that VesselDrawer can use.
      // VesselDrawer only needs _id; it calls the API for berth/route recommendations.
      setDrawerVessel({ _id: item.vessel.id, ...item.vessel });
    }
    // If vessel.id is absent, there is nothing to open (defensive guard only).
  }

  return (
    <>
      <div className="pf-page">
        {/* ── Page header ──────────────────────────────────────── */}
        <div className="pf-section-header">
          <div className="pf-section-header-left">
            <h1 className="pf-section-title">72-Hour Operational Plan</h1>
            <p className="pf-section-subtitle">
              {plan
                ? `Generated ${fmtDateTime(plan.generatedAt)} · ${plan.horizon}`
                : 'Port operations planning control center'}
            </p>
          </div>
          <div className="pf-section-header-action">
            <button
                className="pf-btn pf-btn-primary"
                onClick={load}
                disabled={loading}
              >
                {loading ? '⏳ Loading…' : '↻ Refresh Plan'}
              </button>
          </div>
        </div>

        {/* ── States ───────────────────────────────────────────── */}
        {error   && <ErrorState message={error} onRetry={load} />}
        {loading && <LoadingState message="Generating 72-hour operational plan…" rows={6} />}

        {/* ── Loaded ───────────────────────────────────────────── */}
        {!loading && !error && plan && (
          <>
            {/* Plan metadata bar */}
            <PlanMeta plan={plan} />

            {/* Summary metrics */}
            <PlanSummary plan={plan} />

            {/* Congestion context */}
            <CongestionStrip snap={plan.congestionSnapshot} />

            {/* Recommendations */}
            <RecommendationsPanel recommendations={plan.recommendations} />

            {/* Priority vessels */}
            <PriorityPanel
              schedule={plan.schedule}
              unassigned={plan.unassignedVessels}
              onSelect={handleItemSelect}
            />

            {/* ── 72-hour timeline ─────────────────────────────── */}
            <div className="pl-panel pl-panel-timeline">
              <div className="pl-panel-title">
                72-Hour Gantt Timeline
                <span className="pl-timeline-hint">
                  Click a block to open vessel details
                </span>
              </div>
              {plan.schedule.length > 0 ? (
                <Timeline schedule={plan.schedule} onSelect={handleItemSelect} />
              ) : (
                <div className="pl-ok-state pf-muted-text">No vessels scheduled</div>
              )}
            </div>

            {/* ── Conflicts ────────────────────────────────────── */}
            <ConflictsPanel conflicts={plan.conflicts} />

            {/* ── Full schedule table ──────────────────────────── */}
            <SchedulePanel schedule={plan.schedule} onSelect={handleItemSelect} />

            {/* ── Unassigned vessels ───────────────────────────── */}
            <UnassignedPanel unassigned={plan.unassignedVessels} />
          </>
        )}

        {/* Empty plan */}
        {!loading && !error && !plan && (
          <div className="pf-empty-state">
            <strong>No operational plan available.</strong>
            <br />
            <span style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
              Use the Refresh Plan button to generate the 72-hour operational schedule.
            </span>
          </div>
        )}
      </div>

      {/* Vessel drawer — opened by clicking timeline blocks or schedule rows */}
      <VesselDrawer
        vessel={drawerVessel}
        onClose={() => setDrawerVessel(null)}
      />
    </>
  );
}
