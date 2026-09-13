/**
 * Berths.jsx — Berth Operations Page
 *
 * Live berth status grid with summary metrics and detail drawer.
 *
 * APIs used:
 *   GET /api/berths            — full berth list (populated currentVesselId)
 *   GET /api/berths?zone=X     — filtered by terminal zone
 *
 * Clicking a berth card opens BerthDrawer (detail panel).
 * If a vessel is assigned, the operator can jump to VesselDrawer from there.
 */

import { useEffect, useState, useCallback } from 'react';
import { berthsApi } from '../api/portflowApi';
import StatusBadge from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import BerthDrawer from '../components/BerthDrawer';
import VesselDrawer from '../components/VesselDrawer';

// ── constants ──────────────────────────────────────────────────────────────────

const ZONE_COLOUR = {
  North: '#2563eb',
  South: '#16a34a',
  East:  '#d97706',
  West:  '#7c3aed',
};

const ZONES = ['', 'North', 'South', 'East', 'West'];

const STATUS_BORDER = {
  available:   '#1a7f37',
  occupied:    '#0f6cbd',
  maintenance: '#9a6700',
};

// ── summary metrics ────────────────────────────────────────────────────────────

function BerthMetrics({ berths }) {
  const total = berths.length;
  const available   = berths.filter(b => b.status === 'available').length;
  const occupied    = berths.filter(b => b.status === 'occupied').length;
  const maintenance = berths.filter(b => b.status === 'maintenance').length;

  const totalCranes = berths.reduce((s, b) => s + (b.craneCount || 0), 0);
  const freeCranes  = berths.reduce((s, b) => s + (b.cranesAvailable || 0), 0);

  const metrics = [
    { label: 'Total Berths',    value: total,       accent: '#57606a' },
    { label: 'Available',       value: available,   accent: '#1a7f37' },
    { label: 'Occupied',        value: occupied,    accent: '#0f6cbd' },
    { label: 'Maintenance',     value: maintenance, accent: maintenance > 0 ? '#9a6700' : '#57606a' },
    { label: 'Total Cranes',    value: totalCranes, accent: '#57606a' },
    { label: 'Cranes Free',     value: freeCranes,  accent: freeCranes === 0 ? '#cf222e' : '#1a7f37' },
  ];

  return (
    <div className="ov-metrics-grid" style={{ marginBottom: 20 }}>
      {metrics.map(m => (
        <div key={m.label} className="ov-metric-card" style={{ borderLeft: `4px solid ${m.accent}` }}>
          <div className="ov-metric-header">
            <span className="ov-metric-label">{m.label}</span>
          </div>
          <div className="ov-metric-value">{m.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── individual berth card ──────────────────────────────────────────────────────

function BerthCard({ berth, onClick }) {
  const zoneColour   = ZONE_COLOUR[berth.terminalZone] || '#94a3b8';
  const borderColour = STATUS_BORDER[berth.status]     || '#e1e4e8';
  const freeAt = berth.occupiedUntil ? new Date(berth.occupiedUntil) : null;
  const craneTotal = berth.craneCount || 0;
  const craneFree  = berth.cranesAvailable || 0;

  return (
    <div
      className="bd-card"
      style={{ borderTop: `3px solid ${zoneColour}`, borderLeft: `3px solid ${borderColour}` }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      aria-label={`Berth ${berth.berthCode} — ${berth.status}`}
    >
      {/* Card header */}
      <div className="bd-card-header">
        <span className="bd-card-code">{berth.berthCode}</span>
        <StatusBadge status={berth.status} />
      </div>

      {/* Zone */}
      <div className="bd-card-zone" style={{ color: zoneColour }}>
        {berth.terminalZone} Terminal
      </div>

      {/* Physical specs */}
      <div className="bd-card-specs">
        <span>Max LOA <strong>{berth.maxLOA}m</strong></span>
        <span>Draught <strong>{berth.maxDraught}m</strong></span>
        <span>Quay <strong>{berth.berthLength}m</strong></span>
      </div>

      {/* Crane bar */}
      {craneTotal > 0 && (
        <div className="bd-card-cranes">
          <span className="bd-card-crane-label">Cranes</span>
          <div className="bd-crane-mini-track">
            {Array.from({ length: craneTotal }).map((_, i) => (
              <div
                key={i}
                className="bd-crane-dot"
                style={{ background: i < craneFree ? '#1a7f37' : '#cf222e' }}
                title={i < craneFree ? 'Free' : 'Assigned'}
              />
            ))}
          </div>
          <span className="bd-card-crane-count">{craneFree}/{craneTotal}</span>
        </div>
      )}

      {/* Vessel types accepted */}
      <div className="bd-card-types">
        {berth.vesselTypes?.map(t => (
          <span key={t} className="bd-type-chip bd-type-chip-sm">{t}</span>
        ))}
      </div>

      {/* Current vessel */}
      {berth.currentVesselId && (
        <div className="bd-card-vessel">
          🚢 {berth.currentVesselId.name || 'Occupied'}
        </div>
      )}

      {/* Free-at time */}
      {freeAt && berth.status !== 'available' && (
        <div className="bd-card-eta">
          {berth.status === 'maintenance' ? '🔧 Until' : '🕐 Free ~'}
          {freeAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' '}
          {freeAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </div>
      )}
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function Berths() {
  const [allBerths, setAllBerths] = useState([]);   // unfiltered full list (for metrics)
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [zone,      setZone]      = useState('');
  const [selected,  setSelected]  = useState(null); // BerthDrawer target
  const [vessel,    setVessel]    = useState(null);  // VesselDrawer target

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Always load all berths for accurate metrics; filter client-side for display
      const data = await berthsApi.list();
      setAllBerths(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Client-side zone filter — no extra network round-trip needed
  const displayed = zone
    ? allBerths.filter(b => b.terminalZone === zone)
    : allBerths;

  return (
    <>
      <div className="pf-page">
        {/* Page header */}
        <div className="pf-section-header">
          <div className="pf-section-header-left">
            <h1 className="pf-section-title">Berth Planner</h1>
            <p className="pf-section-subtitle">
              {loading
                ? 'Loading…'
                : `${allBerths.length} berths · click a card for details`}
            </p>
          </div>
          <div className="pf-section-header-action">
            <button className="pf-btn pf-btn-outline" onClick={load}>↻ Refresh</button>
          </div>
        </div>

        {error   && <ErrorState message={error} onRetry={load} />}
        {loading && <LoadingState message="Loading berths…" rows={8} />}

        {!loading && !error && (
          <>
            {/* Summary metrics — always from the full unfiltered list */}
            <BerthMetrics berths={allBerths} />

            {/* Zone filter chips */}
            <div className="pf-filter-bar">
              {ZONES.map(z => (
                <button
                  key={z || 'all'}
                  className={`pf-chip ${zone === z ? 'pf-chip-active' : ''}`}
                  onClick={() => setZone(z)}
                >
                  {z
                    ? <><span className="bd-zone-dot-sm" style={{ background: ZONE_COLOUR[z] }} />{z}</>
                    : 'All Zones'}
                </button>
              ))}
            </div>

            {/* Zone sub-header when filtered */}
            {zone && (
              <div className="bd-zone-banner" style={{ borderLeft: `4px solid ${ZONE_COLOUR[zone]}` }}>
                <strong>{zone} Terminal</strong>
                &nbsp;—&nbsp;
                {displayed.length} berth{displayed.length !== 1 ? 's' : ''}
                &nbsp;·&nbsp;
                {displayed.filter(b => b.status === 'available').length} available
              </div>
            )}

            {/* Empty state */}
            {displayed.length === 0 && (
              <div className="pf-empty-state">No berths found for the selected zone.</div>
            )}

            {/* Berth grid */}
            {displayed.length > 0 && (
              <div className="bd-grid">
                {displayed.map(b => (
                  <BerthCard
                    key={b._id}
                    berth={b}
                    onClick={() => setSelected(b)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Berth detail drawer — opens when a card is clicked */}
      <BerthDrawer
        berth={selected}
        onClose={() => setSelected(null)}
        onViewVessel={(v) => {
          setSelected(null);
          setVessel(v);
        }}
      />

      {/* Vessel drawer — opens when "View Vessel Details" is clicked inside BerthDrawer */}
      <VesselDrawer
        vessel={vessel}
        onClose={() => setVessel(null)}
      />
    </>
  );
}
