/**
 * Routes.jsx — Route Advisor Page
 *
 * Displays all port neighbourhood routes with summary metrics
 * and a detail drawer. Active/inactive filter included.
 *
 * APIs used:
 *   GET /api/routes            — all routes
 *   GET /api/routes?isActive=true/false — filtered
 *
 * Clicking a row opens RouteDrawer (detail panel).
 * The RouteDrawer explains how to use VesselDrawer for vessel-specific
 * recommendations — no duplicate recommendation logic is built here.
 */

import { useEffect, useState, useCallback } from 'react';
import { routesApi } from '../api/portflowApi';
import StatusBadge from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import RouteDrawer from '../components/RouteDrawer';

// ── summary metrics ────────────────────────────────────────────────────────────

function RouteMetrics({ routes }) {
  const total    = routes.length;
  const active   = routes.filter(r => r.isActive).length;
  const inactive = routes.filter(r => !r.isActive).length;
  const hazard   = routes.filter(r => r.hasHazard).length;
  const minDist  = total > 0 ? Math.min(...routes.map(r => r.distanceNm)) : 0;
  const maxDist  = total > 0 ? Math.max(...routes.map(r => r.distanceNm)) : 0;

  const metrics = [
    { label: 'Total Routes',    value: total,    accent: '#57606a' },
    { label: 'Active',          value: active,   accent: '#1a7f37' },
    { label: 'Inactive',        value: inactive, accent: inactive > 0 ? '#9a6700' : '#57606a' },
    { label: 'Hazard Routes',   value: hazard,   accent: hazard   > 0 ? '#cf222e' : '#57606a' },
    { label: 'Shortest (nm)',   value: total > 0 ? minDist : '—', accent: '#2563eb' },
    { label: 'Longest (nm)',    value: total > 0 ? maxDist : '—', accent: '#7c3aed' },
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

// ── filter options ─────────────────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { value: '',     label: 'All Routes'  },
  { value: 'true', label: 'Active Only' },
  { value: 'false', label: 'Inactive'  },
];

// ── main page ──────────────────────────────────────────────────────────────────

export default function Routes() {
  const [allRoutes,   setAllRoutes]   = useState([]);  // full list for metrics
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [activeFilter, setActiveFilter] = useState('');  // '' | 'true' | 'false'
  const [selected,    setSelected]    = useState(null);  // RouteDrawer target

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load all routes for metrics; filter client-side for display
      const data = await routesApi.list();
      setAllRoutes(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Client-side filter
  const displayed = allRoutes.filter(r => {
    if (activeFilter === 'true')  return r.isActive === true;
    if (activeFilter === 'false') return r.isActive === false;
    return true;
  });

  return (
    <>
      <div className="pf-page">
        {/* Page header */}
        <div className="pf-section-header">
          <div className="pf-section-header-left">
            <h1 className="pf-section-title">Route Advisor</h1>
            <p className="pf-section-subtitle">
              {loading
                ? 'Loading…'
                : `${allRoutes.length} routes in the port neighbourhood graph · click a row for details`}
            </p>
          </div>
          <div className="pf-section-header-action">
            <button className="pf-btn pf-btn-outline" onClick={load}>↻ Refresh</button>
          </div>
        </div>

        {error   && <ErrorState message={error} onRetry={load} />}
        {loading && <LoadingState message="Loading routes…" rows={7} />}

        {!loading && !error && (
          <>
            {/* Summary metrics — always from full unfiltered list */}
            <RouteMetrics routes={allRoutes} />

            {/* Active/inactive filter */}
            <div className="pf-filter-bar">
              {FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`pf-chip ${activeFilter === opt.value ? 'pf-chip-active' : ''}`}
                  onClick={() => setActiveFilter(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
              {activeFilter !== '' && (
                <span className="rd-filter-count">
                  {displayed.length} of {allRoutes.length} routes
                </span>
              )}
            </div>

            {/* Empty state */}
            {displayed.length === 0 && (
              <div className="pf-empty-state">
                No routes match the selected filter.
              </div>
            )}

            {/* Routes table */}
            {displayed.length > 0 && (
              <div className="pf-panel">
                <div className="pf-table-scroll">
                  <table className="pf-table">
                    <thead>
                      <tr>
                        <th>Route</th>
                        <th>From → To</th>
                        <th>Distance</th>
                        <th>Transit</th>
                        <th>Max Draught</th>
                        <th>Vessel Types</th>
                        <th>Hazard</th>
                        <th>Destination Port</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map(r => (
                        <tr
                          key={r._id}
                          className={`vt-row ${!r.isActive ? 'rd-row-inactive' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelected(r)}
                        >
                          <td>
                            <div className="rd-route-name">{r.name}</div>
                          </td>
                          <td>
                            <span className="pf-node">{r.fromNode}</span>
                            <span className="pf-arrow"> → </span>
                            <span className="pf-node">{r.toNode}</span>
                          </td>
                          <td className="pf-muted-text">{r.distanceNm} nm</td>
                          <td className="pf-muted-text">~{r.avgTransitHours}h</td>
                          <td className="pf-muted-text">{r.maxDraught}m</td>
                          <td>
                            <div className="rd-type-chips">
                              {r.suitableFor?.map(t => (
                                <span key={t} className="bd-type-chip bd-type-chip-sm">{t}</span>
                              ))}
                            </div>
                          </td>
                          <td>
                            {r.hasHazard
                              ? <span className="pf-hazard-flag">⚠ Hazard</span>
                              : <span className="pf-clear">✓ Clear</span>}
                          </td>
                          <td className="pf-muted-text" style={{ fontSize: 12 }}>
                            {r.destinationPort?.portName
                              ? `${r.destinationPort.portName} (${r.destinationPort.portCode})`
                              : '—'}
                          </td>
                          <td>
                            <StatusBadge status={r.isActive ? 'active' : 'inactive'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Vessel recommendation hint */}
            <div className="rd-hint-panel">
              <strong>🗺 Vessel-specific route recommendations</strong> — open any vessel from
              the <strong>Vessels</strong> page and use the Route tab to run the route advisory
              engine against that vessel's draught, type, and destination constraints.
            </div>
          </>
        )}
      </div>

      {/* Route detail drawer */}
      <RouteDrawer
        route={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
