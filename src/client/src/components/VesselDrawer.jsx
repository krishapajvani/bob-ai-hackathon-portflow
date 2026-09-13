/**
 * VesselDrawer.jsx
 *
 * Slide-over drawer showing full vessel details plus:
 *   - Berth recommendation (GET /api/berths/recommend/:vesselId)
 *   - Route recommendation (GET /api/routes/recommend/:vesselId)
 *
 * Props:
 *   vessel    {object|null}  — vessel document; null = drawer closed
 *   onClose   {function}     — called to close the drawer
 */

import { useState, useEffect, useCallback } from 'react';
import { berthsApi, routesApi } from '../api/portflowApi';
import StatusBadge from './StatusBadge';

// ─── helpers ──────────────────────────────────────────────────────────────────

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

function ScoreBar({ score }) {
  const colour = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#ea580c';
  return (
    <div className="vd-score-bar-wrap">
      <div className="vd-score-bar-track">
        <div style={{ width: `${score}%`, background: colour, height: '100%', borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span className="vd-score-num" style={{ color: colour }}>{score}</span>
    </div>
  );
}

// ─── Berth recommendation panel ───────────────────────────────────────────────

function BerthRecommendation({ vesselId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [fetched, setFetched] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await berthsApi.recommend(vesselId);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [vesselId]);

  if (!fetched) {
    return (
      <div className="vd-rec-cta">
        <button className="pf-btn pf-btn-primary" onClick={fetch}>
          ⚓ Recommend Berth
        </button>
        <span className="vd-rec-hint">Run the berth optimisation engine for this vessel</span>
      </div>
    );
  }

  if (loading) return <div className="vd-rec-loading">Evaluating berths…</div>;
  if (error)   return <div className="vd-rec-error">⚠ {error}</div>;
  if (!data)   return null;

  const top = data.topRecommendation;
  const rest = data.recommendations?.slice(1) ?? [];

  return (
    <div className="vd-rec-result">
      {top ? (
        <>
          <div className="vd-rec-top-label">Top Recommendation</div>
          <div className="vd-rec-top-card">
            <div className="vd-rec-berth-name">
              {top.berthCode}
              <span className="vd-rec-zone">{top.terminalZone} Terminal</span>
            </div>
            <ScoreBar score={top.score} />
            <div className="vd-rec-reasons">
              {top.reasons?.map((r, i) => (
                <div key={i} className="vd-rec-reason">✓ {r}</div>
              ))}
            </div>
            {top.warnings?.length > 0 && (
              <div className="vd-rec-warnings">
                {top.warnings.map((w, i) => (
                  <div key={i} className="vd-rec-warning">⚠ {w}</div>
                ))}
              </div>
            )}
            <div className="vd-rec-specs">
              <span>Max LOA: {top.maxLOA}m</span>
              <span>Max Draught: {top.maxDraught}m</span>
              <span>Cranes: {top.cranesAvailable}/{top.craneCount}</span>
            </div>
          </div>

          {rest.length > 0 && (
            <>
              <div className="vd-rec-alt-label">Alternatives</div>
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Berth</th>
                    <th>Zone</th>
                    <th>Score</th>
                    <th>Cranes Free</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map(b => (
                    <tr key={b.id}>
                      <td><strong>{b.berthCode}</strong></td>
                      <td>{b.terminalZone}</td>
                      <td><ScoreBar score={b.score} /></td>
                      <td>{b.cranesAvailable}/{b.craneCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      ) : (
        <div className="vd-rec-none">
          No eligible berths found for this vessel.
          {data.ineligibleBerths?.length > 0 && (
            <div className="vd-rec-ineligible">
              {data.ineligibleBerths.length} berth{data.ineligibleBerths.length > 1 ? 's' : ''} excluded:
              {data.ineligibleBerths.map(b => (
                <div key={b.id} className="vd-rec-reason vd-rec-excluded">
                  {b.berthCode}: {b.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <button className="pf-btn pf-btn-outline vd-rec-retry" onClick={fetch}>↻ Re-run</button>
    </div>
  );
}

// ─── Route recommendation panel ───────────────────────────────────────────────

function RouteRecommendation({ vesselId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [fetched, setFetched] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await routesApi.recommend(vesselId);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [vesselId]);

  if (!fetched) {
    return (
      <div className="vd-rec-cta">
        <button className="pf-btn pf-btn-primary" onClick={fetch}>
          🗺 Recommend Route
        </button>
        <span className="vd-rec-hint">Run the route advisory engine for this vessel</span>
      </div>
    );
  }

  if (loading) return <div className="vd-rec-loading">Evaluating routes…</div>;
  if (error)   return <div className="vd-rec-error">⚠ {error}</div>;
  if (!data)   return null;

  const top  = data.topRecommendation;
  const rest = data.recommendations?.slice(1) ?? [];

  return (
    <div className="vd-rec-result">
      {top ? (
        <>
          <div className="vd-rec-top-label">Top Recommendation</div>
          <div className="vd-rec-top-card">
            <div className="vd-rec-berth-name">
              {top.name}
              <span className={`vd-suitability vd-suit-${top.suitabilityLabel?.toLowerCase().replace(' ', '-')}`}>
                {top.suitabilityLabel}
              </span>
            </div>
            <div className="vd-rec-route-nodes">
              {top.fromNode} → {top.toNode}
            </div>
            <ScoreBar score={top.score} />
            <div className="vd-rec-specs">
              <span>{top.distanceNm} nm</span>
              <span>~{top.avgTransitHours}h transit</span>
              <span>Max draught: {top.maxDraught}m</span>
              {top.hasHazard && <span className="vd-hazard">⚠ Hazard</span>}
              {top.destinationPort?.portName && (
                <span>{top.destinationPort.portName} ({top.destinationPort.portCode})</span>
              )}
            </div>
            <div className="vd-rec-reasons">
              {top.reasons?.map((r, i) => <div key={i} className="vd-rec-reason">✓ {r}</div>)}
            </div>
            {top.warnings?.length > 0 && (
              <div className="vd-rec-warnings">
                {top.warnings.map((w, i) => <div key={i} className="vd-rec-warning">⚠ {w}</div>)}
              </div>
            )}
          </div>

          {rest.length > 0 && (
            <>
              <div className="vd-rec-alt-label">Alternatives</div>
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Distance</th>
                    <th>Transit</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.name}</strong></td>
                      <td>{r.distanceNm} nm</td>
                      <td>~{r.avgTransitHours}h</td>
                      <td><ScoreBar score={r.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      ) : (
        <div className="vd-rec-none">No suitable routes found for this vessel.</div>
      )}
      <button className="pf-btn pf-btn-outline vd-rec-retry" onClick={fetch}>↻ Re-run</button>
    </div>
  );
}

// ─── tabs ─────────────────────────────────────────────────────────────────────

const TABS = ['Details', 'Berth', 'Route'];

// ─── main drawer ──────────────────────────────────────────────────────────────

export default function VesselDrawer({ vessel, onClose }) {
  const [tab, setTab] = useState('Details');

  // Reset tab when a different vessel opens
  useEffect(() => { setTab('Details'); }, [vessel?._id]);

  // Close on Escape key
  useEffect(() => {
    if (!vessel) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [vessel, onClose]);

  if (!vessel) return null;

  const etaDate = vessel.eta ? new Date(vessel.eta) : null;
  const etdDate = vessel.etd ? new Date(vessel.etd) : null;

  return (
    <>
      {/* Backdrop */}
      <div className="vd-backdrop" onClick={onClose} />

      {/* Drawer panel */}
      <div className="vd-drawer" role="dialog" aria-modal="true" aria-label={`Vessel: ${vessel.name}`}>
        {/* Header */}
        <div className="vd-header">
          <div>
            <div className="vd-vessel-name">{vessel.name}</div>
            <div className="vd-vessel-imo">IMO {vessel.imoNumber}</div>
          </div>
          <div className="vd-header-right">
            <StatusBadge status={vessel.status} size="md" />
            <button className="vd-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="vd-tabs">
          {TABS.map(t => (
            <button
              key={t}
              className={`vd-tab ${tab === t ? 'vd-tab-active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'Details' ? '📋 Details' : t === 'Berth' ? '⚓ Berth' : '🗺 Route'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="vd-body">
          {tab === 'Details' && (
            <>
              <SectionTitle>Identification</SectionTitle>
              <Row label="Name"       value={vessel.name} />
              <Row label="IMO Number" value={vessel.imoNumber} />
              <Row label="Type"       value={vessel.type ? vessel.type.charAt(0).toUpperCase() + vessel.type.slice(1) : '—'} />
              <Row label="Priority"
                value={
                  <span className={`pf-priority pf-priority-${vessel.priority}`}>
                    P{vessel.priority}
                  </span>
                }
              />
              <Row label="Status"     value={<StatusBadge status={vessel.status} />} />

              <SectionTitle>Physical Dimensions</SectionTitle>
              <Row label="LOA"     value={`${vessel.loa} m`} />
              <Row label="Beam"    value={`${vessel.beam} m`} />
              <Row label="Draught" value={`${vessel.draught} m`} />

              <SectionTitle>Schedule</SectionTitle>
              <Row label="ETA" value={etaDate ? etaDate.toLocaleString() : '—'} />
              <Row label="ETD" value={etdDate ? etdDate.toLocaleString() : '—'} />

              {(vessel.cargoTEU > 0 || vessel.cargoTonnage > 0) && (
                <>
                  <SectionTitle>Cargo</SectionTitle>
                  {vessel.cargoTEU > 0 && <Row label="TEU" value={vessel.cargoTEU.toLocaleString()} />}
                  {vessel.cargoTonnage > 0 && <Row label="Tonnage" value={`${vessel.cargoTonnage.toLocaleString()} t`} />}
                </>
              )}

              {vessel.notes && (
                <>
                  <SectionTitle>Notes</SectionTitle>
                  <div className="vd-notes">{vessel.notes}</div>
                </>
              )}
            </>
          )}

          {tab === 'Berth' && (
            <BerthRecommendation vesselId={vessel._id} />
          )}

          {tab === 'Route' && (
            <RouteRecommendation vesselId={vessel._id} />
          )}
        </div>
      </div>
    </>
  );
}
