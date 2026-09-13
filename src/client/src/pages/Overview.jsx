/**
 * Overview.jsx — Port Operations Dashboard
 *
 * Pulls live data from four backend endpoints in parallel:
 *   GET /api/congestion   — score, risk level, factors, actions
 *   GET /api/vessels      — all non-departed vessels for status counts
 *   GET /api/berths       — berth availability counts
 *   GET /api/cranes       — crane fleet utilisation
 *
 * No data is invented; every number comes from the backend.
 */

import { useEffect, useState, useCallback } from 'react';
import { congestionApi, vesselsApi, berthsApi, cranesApi } from '../api/portflowApi';
import StatusBadge from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

// ─── helpers ──────────────────────────────────────────────────────────────────

const LEVEL_COLOUR = {
  LOW:      '#16a34a',
  MEDIUM:   '#d97706',
  HIGH:     '#ea580c',
  CRITICAL: '#dc2626',
};

const LEVEL_BG = {
  LOW:      '#dcfce7',
  MEDIUM:   '#fff7ed',
  HIGH:     '#fff1e6',
  CRITICAL: '#fee2e2',
};

const FACTOR_LABELS = {
  berthOccupancy:   'Berth Occupancy',
  anchorQueue:      'Anchor Queue',
  craneUtilisation: 'Crane Utilisation',
  inboundPressure:  'Inbound Pressure',
  priorityStranded: 'Priority Vessel Alarm',
};

function fmt(n) { return n ?? '—'; }

function etaLabel(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const h = Math.round((d - Date.now()) / 3_600_000);
  if (Math.abs(h) < 1) return 'Now';
  if (h < 0) return `${Math.abs(h)}h ago`;
  return `+${h}h`;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function CongestionGauge({ data }) {
  const score = data?.overallScore ?? 0;
  const level = data?.riskLevel ?? 'LOW';
  const colour = LEVEL_COLOUR[level] || '#94a3b8';

  return (
    <div className="ov-gauge-card">
      <div className="ov-gauge-top">
        <div>
          <div className="ov-gauge-heading">Port Congestion Risk</div>
          <div className="ov-gauge-ts">
            {data?.calculatedAt
              ? `Updated ${new Date(data.calculatedAt).toLocaleTimeString()}`
              : 'Loading…'}
          </div>
        </div>
        <div className="ov-gauge-level-wrap">
          <span className="ov-gauge-level-pill" style={{ background: LEVEL_BG[level], color: colour }}>
            {level}
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="ov-gauge-bar-track">
        <div
          className="ov-gauge-bar-fill"
          style={{ width: `${score}%`, background: colour }}
        />
      </div>

      <div className="ov-gauge-footer">
        <span className="ov-gauge-score" style={{ color: colour }}>{score}</span>
        <span className="ov-gauge-max">/ 100</span>
        <span className="ov-gauge-hint">
          LOW ≤35 · MEDIUM 36–60 · HIGH 61–80 · CRITICAL ≥81
        </span>
      </div>
    </div>
  );
}

function MetricsRow({ vessels, berths, cranes, congestion }) {
  const waiting   = vessels.filter(v => v.status === 'waiting').length;
  const berthed   = vessels.filter(v => v.status === 'berthed').length;
  const inbound   = vessels.filter(v => v.status === 'inbound').length;
  const available = berths.filter(b => b.status === 'available').length;
  const occupied  = berths.filter(b => b.status === 'occupied').length;
  const maint     = berths.filter(b => b.status === 'maintenance').length;

  const totalCranes    = cranes.length;
  const freeCranes     = cranes.filter(c => c.status === 'available').length;
  const assignedCranes = cranes.filter(c => c.status === 'assigned').length;

  const metrics = [
    { label: 'Vessels Waiting',  value: waiting,  accent: waiting  > 3 ? '#ea580c' : '#57606a', icon: '⚓' },
    { label: 'Vessels Berthed',  value: berthed,  accent: '#2563eb', icon: '🏗' },
    { label: 'Vessels Inbound',  value: inbound,  accent: '#7c3aed', icon: '🚢' },
    { label: 'Berths Available', value: available, accent: '#16a34a', icon: '🟢' },
    { label: 'Berths Occupied',  value: occupied,  accent: '#0f6cbd', icon: '🔵' },
    { label: 'In Maintenance',   value: maint,     accent: maint > 0 ? '#d97706' : '#57606a', icon: '🔧' },
    { label: 'Cranes Free',      value: totalCranes > 0 ? `${freeCranes}/${totalCranes}` : '—',
      accent: '#16a34a', icon: '🏗' },
    { label: 'Cranes Assigned',  value: assignedCranes,  accent: assignedCranes > 0 ? '#d97706' : '#57606a', icon: '⚙️' },
  ];

  return (
    <div className="ov-metrics-grid">
      {metrics.map(m => (
        <div key={m.label} className="ov-metric-card" style={{ borderLeft: `4px solid ${m.accent}` }}>
          <div className="ov-metric-header">
            <span className="ov-metric-icon">{m.icon}</span>
            <span className="ov-metric-label">{m.label}</span>
          </div>
          <div className="ov-metric-value">{m.value}</div>
        </div>
      ))}
    </div>
  );
}

function FactorsTable({ factors, weights }) {
  if (!factors) return null;
  return (
    <div className="ov-panel">
      <div className="ov-panel-title">Congestion Factor Breakdown</div>
      <div className="pf-table-scroll">
        <table className="pf-table">
          <thead>
            <tr>
              <th>Factor</th>
              <th>Score</th>
              <th>Weight</th>
              <th>Contribution</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(factors).map(([key, f]) => {
              const colour = f.score >= 80 ? '#dc2626' : f.score >= 50 ? '#d97706' : '#16a34a';
              return (
                <tr key={key}>
                  <td><strong>{FACTOR_LABELS[key] || key}</strong></td>
                  <td>
                    <div className="ov-factor-score-wrap">
                      <div className="ov-factor-mini-bar">
                        <div style={{ width: `${f.score}%`, background: colour, height: '100%', borderRadius: 3 }} />
                      </div>
                      <span style={{ color: colour, fontWeight: 700 }}>{f.score}</span>
                    </div>
                  </td>
                  <td className="pf-muted-text">{Math.round(f.weight * 100)}%</td>
                  <td><strong>{f.contribution}</strong></td>
                  <td className="pf-muted-text" style={{ fontSize: 12 }}>{f.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertsPanel({ congestion, berths }) {
  const alerts = [];

  // Priority-1 stranded
  if (congestion?.factors?.priorityStranded?.score === 100) {
    alerts.push({ level: 'critical', msg: '🚨 Priority-1 vessel stranded at anchor — expedite berth assignment immediately' });
  }

  // HIGH / CRITICAL congestion
  if (congestion?.riskLevel === 'CRITICAL') {
    alerts.push({ level: 'critical', msg: `🔴 Port congestion is CRITICAL (score ${congestion.overallScore}/100)` });
  } else if (congestion?.riskLevel === 'HIGH') {
    alerts.push({ level: 'warning', msg: `🟠 Port congestion is HIGH (score ${congestion.overallScore}/100)` });
  }

  // Maintenance berths
  const maintBerths = berths.filter(b => b.status === 'maintenance');
  if (maintBerths.length > 0) {
    alerts.push({
      level: 'warning',
      msg: `🔧 ${maintBerths.length} berth${maintBerths.length > 1 ? 's' : ''} in maintenance: ${maintBerths.map(b => b.berthCode).join(', ')}`,
    });
  }

  // Anchor queue pressure
  const waitCount = congestion?.factors?.anchorQueue?.raw?.waitingCount ?? 0;
  if (waitCount >= 4) {
    alerts.push({ level: 'warning', msg: `⚓ ${waitCount} vessels waiting at anchor — queue pressure building` });
  }

  // Recommended actions from engine
  if (congestion?.recommendedActions?.length) {
    congestion.recommendedActions.forEach(action => {
      const isUrgent = action.startsWith('URGENT');
      alerts.push({ level: isUrgent ? 'critical' : 'info', msg: action });
    });
  }

  if (alerts.length === 0) {
    return (
      <div className="ov-panel">
        <div className="ov-panel-title">Alerts &amp; Recommended Actions</div>
        <div className="ov-alert ov-alert-ok">✅ Port is operating normally. No immediate action required.</div>
      </div>
    );
  }

  return (
    <div className="ov-panel">
      <div className="ov-panel-title">Alerts &amp; Recommended Actions</div>
      <div className="ov-alerts-list">
        {alerts.map((a, i) => (
          <div key={i} className={`ov-alert ov-alert-${a.level}`}>{a.msg}</div>
        ))}
      </div>
    </div>
  );
}

function VesselSnapshot({ vessels }) {
  // Show priority vessels and waiting vessels — most actionable
  const priority = vessels
    .filter(v => v.priority <= 2 || v.status === 'waiting')
    .sort((a, b) => a.priority - b.priority || new Date(a.eta) - new Date(b.eta))
    .slice(0, 10);

  if (priority.length === 0) {
    return (
      <div className="ov-panel">
        <div className="ov-panel-title">Vessel Snapshot</div>
        <div className="pf-empty-state">No active priority or waiting vessels</div>
      </div>
    );
  }

  return (
    <div className="ov-panel">
      <div className="ov-panel-title">
        Priority &amp; Waiting Vessels
        <span className="ov-panel-count">{priority.length}</span>
      </div>
      <div className="pf-table-scroll">
        <table className="pf-table">
          <thead>
            <tr>
              <th>Vessel</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Status</th>
              <th>ETA</th>
              <th>Cargo</th>
            </tr>
          </thead>
          <tbody>
            {priority.map(v => (
              <tr key={v._id}>
                <td>
                  <div className="pf-vessel-name-text">{v.name}</div>
                  <div className="pf-vessel-imo">{v.imoNumber}</div>
                </td>
                <td style={{ textTransform: 'capitalize' }}>{v.type}</td>
                <td>
                  <span className={`pf-priority pf-priority-${v.priority}`}>P{v.priority}</span>
                </td>
                <td><StatusBadge status={v.status} /></td>
                <td className="pf-muted-text">{etaLabel(v.eta)}</td>
                <td className="pf-muted-text" style={{ fontSize: 12 }}>
                  {v.cargoTEU > 0
                    ? `${v.cargoTEU.toLocaleString()} TEU`
                    : v.cargoTonnage > 0
                    ? `${v.cargoTonnage.toLocaleString()} t`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Overview() {
  const [congestion, setCongestion] = useState(null);
  const [vessels,    setVessels]    = useState([]);
  const [berths,     setBerths]     = useState([]);
  const [cranes,     setCranes]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cong, vess, berth, crane] = await Promise.all([
        congestionApi.get(),
        vesselsApi.list(),
        berthsApi.list(),
        cranesApi.list(),
      ]);
      setCongestion(cong);
      setVessels(vess);
      setBerths(berth);
      setCranes(crane);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState message="Loading port overview…" rows={6} />;
  if (error)   return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="pf-page">
      {/* Page actions */}
      <div className="ov-page-actions">
        <button className="pf-btn pf-btn-outline" onClick={load}>↻ Refresh</button>
      </div>

      {/* Congestion gauge — full width */}
      <CongestionGauge data={congestion} />

      {/* 8 metric cards */}
      <MetricsRow vessels={vessels} berths={berths} cranes={cranes} congestion={congestion} />

      {/* Two-column: alerts + factors */}
      <div className="ov-two-col">
        <AlertsPanel congestion={congestion} berths={berths} />
        <FactorsTable factors={congestion?.factors} weights={congestion?.weights} />
      </div>

      {/* Vessel snapshot */}
      <VesselSnapshot vessels={vessels} />
    </div>
  );
}
