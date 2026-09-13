/**
 * BerthDrawer.jsx
 *
 * Slide-over detail drawer for a single berth.
 * Shows all backend fields from the Berth model.
 * If a vessel is currently assigned, it displays vessel identity
 * and provides a "View Vessel" callback to open the VesselDrawer.
 *
 * Props:
 *   berth        {object|null}   — berth document; null = closed
 *   onClose      {function}      — called to close this drawer
 *   onViewVessel {function}      — called with the currentVesselId object when
 *                                  the operator wants to open the vessel drawer
 */

import { useEffect } from 'react';
import StatusBadge from './StatusBadge';

// ── helpers ────────────────────────────────────────────────────────────────────

const ZONE_COLOUR = {
  North: '#2563eb',
  South: '#16a34a',
  East:  '#d97706',
  West:  '#7c3aed',
};

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="vd-row">
      <span className="vd-row-label">{label}</span>
      <span className="vd-row-value">{value}</span>
    </div>
  );
}

function SectionTitle({ children }) {
  return <div className="vd-section-title">{children}</div>;
}

function CraneBar({ available, total }) {
  if (total === 0) return <span className="pf-muted-text">No cranes at this berth</span>;
  const pct     = Math.round((available / total) * 100);
  const colour  = available === 0 ? '#cf222e' : available === total ? '#1a7f37' : '#d97706';
  return (
    <div className="bd-crane-bar-wrap">
      <div className="bd-crane-bar-track">
        <div style={{ width: `${pct}%`, background: colour, height: '100%', borderRadius: 3 }} />
      </div>
      <span className="bd-crane-label" style={{ color: colour }}>
        {available}/{total} free
      </span>
    </div>
  );
}

// ── main drawer ────────────────────────────────────────────────────────────────

export default function BerthDrawer({ berth, onClose, onViewVessel }) {
  // Close on Escape
  useEffect(() => {
    if (!berth) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [berth, onClose]);

  if (!berth) return null;

  const zoneColour  = ZONE_COLOUR[berth.terminalZone] || '#94a3b8';
  const vessel      = berth.currentVesselId; // populated object or null
  const freeAt      = berth.occupiedUntil ? new Date(berth.occupiedUntil) : null;

  return (
    <>
      {/* Backdrop */}
      <div className="vd-backdrop" onClick={onClose} />

      {/* Drawer */}
      <div className="vd-drawer" role="dialog" aria-modal="true" aria-label={`Berth ${berth.berthCode}`}>
        {/* Header */}
        <div className="vd-header">
          <div>
            <div className="vd-vessel-name">
              <span
                className="bd-zone-dot"
                style={{ background: zoneColour }}
                title={`${berth.terminalZone} Terminal`}
              />
              Berth {berth.berthCode}
            </div>
            <div className="vd-vessel-imo">{berth.terminalZone} Terminal</div>
          </div>
          <div className="vd-header-right">
            <StatusBadge status={berth.status} size="md" />
            <button className="vd-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="vd-body">
          {/* Physical specs */}
          <SectionTitle>Physical Specifications</SectionTitle>
          <Row label="Berth Code"    value={berth.berthCode} />
          <Row label="Berth Length"  value={`${berth.berthLength} m`} />
          <Row label="Max LOA"       value={`${berth.maxLOA} m`} />
          <Row label="Max Draught"   value={`${berth.maxDraught} m`} />
          <Row label="Terminal Zone" value={berth.terminalZone} />

          {/* Vessel type compatibility */}
          <SectionTitle>Vessel Compatibility</SectionTitle>
          <div className="bd-type-chips">
            {berth.vesselTypes?.map(t => (
              <span key={t} className="bd-type-chip">{t}</span>
            ))}
          </div>

          {/* Crane status */}
          <SectionTitle>Crane Status</SectionTitle>
          <CraneBar available={berth.cranesAvailable} total={berth.craneCount} />

          {/* Occupancy */}
          <SectionTitle>Occupancy</SectionTitle>
          <Row label="Status" value={<StatusBadge status={berth.status} />} />

          {berth.status === 'occupied' && freeAt && (
            <Row
              label="Expected Free"
              value={freeAt.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            />
          )}

          {berth.status === 'maintenance' && freeAt && (
            <Row
              label="Maintenance Until"
              value={freeAt.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            />
          )}

          {/* Current vessel */}
          {vessel && (
            <>
              <SectionTitle>Current Vessel</SectionTitle>
              <div className="bd-vessel-card">
                <div className="bd-vessel-card-name">{vessel.name || 'Assigned vessel'}</div>
                {vessel.imoNumber && (
                  <div className="bd-vessel-card-imo">IMO {vessel.imoNumber}</div>
                )}
                {vessel.status && (
                  <div className="bd-vessel-card-status">
                    <StatusBadge status={vessel.status} />
                  </div>
                )}
                {onViewVessel && (
                  <button
                    className="pf-btn pf-btn-outline bd-view-vessel-btn"
                    onClick={() => onViewVessel(vessel)}
                  >
                    📋 View Vessel Details
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
