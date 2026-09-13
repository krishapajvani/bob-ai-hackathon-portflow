/**
 * RouteDrawer.jsx
 *
 * Slide-over detail drawer for a single route.
 * Shows all backend fields from the Route model.
 * Provides a clear path to vessel-specific route recommendations
 * via the existing VesselDrawer workflow (no duplicate algorithm).
 *
 * Props:
 *   route    {object|null}  — route document; null = closed
 *   onClose  {function}     — called to close the drawer
 */

import { useEffect } from 'react';
import StatusBadge from './StatusBadge';

// ── helpers ────────────────────────────────────────────────────────────────────

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

// ── main drawer ────────────────────────────────────────────────────────────────

export default function RouteDrawer({ route, onClose }) {
  // Close on Escape
  useEffect(() => {
    if (!route) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [route, onClose]);

  if (!route) return null;

  const hasDest = route.destinationPort?.portName;

  return (
    <>
      {/* Backdrop */}
      <div className="vd-backdrop" onClick={onClose} />

      {/* Drawer */}
      <div className="vd-drawer" role="dialog" aria-modal="true" aria-label={`Route: ${route.name}`}>
        {/* Header */}
        <div className="vd-header">
          <div>
            <div className="vd-vessel-name">{route.name}</div>
            <div className="vd-vessel-imo">
              {route.fromNode} → {route.toNode}
            </div>
          </div>
          <div className="vd-header-right">
            <StatusBadge status={route.isActive ? 'active' : 'inactive'} size="md" />
            <button className="vd-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="vd-body">

          {/* Hazard alert — show prominently at top if present */}
          {route.hasHazard && (
            <div className="rd-hazard-alert">
              ⚠ This route has known navigational hazards. Proceed with caution and verify
              conditions before advising transit.
            </div>
          )}

          {/* Route overview */}
          <SectionTitle>Route Overview</SectionTitle>
          <Row label="Route Name"   value={route.name} />
          <Row label="From"         value={route.fromNode} />
          <Row label="To"           value={route.toNode} />
          <Row label="Status"       value={<StatusBadge status={route.isActive ? 'active' : 'inactive'} />} />

          {/* Characteristics */}
          <SectionTitle>Characteristics</SectionTitle>
          <Row label="Distance"       value={`${route.distanceNm} nm`} />
          <Row label="Avg Transit"    value={`~${route.avgTransitHours} h`} />
          <Row label="Max Draught"    value={`${route.maxDraught} m`} />
          {route.minDraught > 0 && (
            <Row label="Min Draught"  value={`${route.minDraught} m`} />
          )}
          <Row label="Hazard"
            value={
              route.hasHazard
                ? <span className="rd-hazard-badge">⚠ Hazard present</span>
                : <span className="rd-clear-badge">✓ Clear</span>
            }
          />

          {/* Vessel compatibility */}
          <SectionTitle>Vessel Compatibility</SectionTitle>
          {route.suitableFor?.length > 0 ? (
            <div className="bd-type-chips">
              {route.suitableFor.map(t => (
                <span key={t} className="bd-type-chip">{t}</span>
              ))}
            </div>
          ) : (
            <p className="pf-muted-text" style={{ fontSize: 13 }}>All vessel types</p>
          )}

          {/* Destination port */}
          {hasDest && (
            <>
              <SectionTitle>Destination Port</SectionTitle>
              <Row label="Port Name"    value={route.destinationPort.portName} />
              <Row label="Port Code"    value={route.destinationPort.portCode} />
              {route.destinationPort.country && (
                <Row label="Country"    value={route.destinationPort.country} />
              )}
              <Row
                label="Typical Wait"
                value={`${route.destinationPort.typicalWaitHours ?? 2} h`}
              />
            </>
          )}

          {/* Recommendation note */}
          <SectionTitle>Vessel-Specific Recommendations</SectionTitle>
          <div className="rd-rec-note">
            <p>
              To get a scored recommendation for a specific vessel — including draught
              safety margins, hazard warnings, and ranked alternatives — open the
              vessel from the <strong>Vessels</strong> page and use the
              <strong> 🗺 Route</strong> tab in the vessel drawer.
            </p>
            <p style={{ marginTop: 8 }}>
              The route advisory engine evaluates every active route against the
              vessel's draught, type, and destination wait time automatically.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
