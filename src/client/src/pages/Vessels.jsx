/**
 * Vessels.jsx — Vessel List Page
 *
 * Filterable vessel table.  Click any row to open the VesselDrawer
 * which provides full details, berth recommendation, and route recommendation.
 */

import { useEffect, useState, useCallback } from 'react';
import { vesselsApi } from '../api/portflowApi';
import StatusBadge from '../components/StatusBadge';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import VesselDrawer from '../components/VesselDrawer';

const STATUS_OPTIONS = ['', 'inbound', 'waiting', 'berthed', 'departing'];
const TYPE_OPTIONS   = ['', 'container', 'bulk', 'tanker', 'roro', 'general'];

function etaLabel(date) {
  if (!date) return '—';
  const d = new Date(date);
  const h = Math.round((d - Date.now()) / 3_600_000);
  if (Math.abs(h) < 1) return 'Now';
  if (h < 0) return `${Math.abs(h)}h ago`;
  return `+${h}h`;
}

export default function Vessels() {
  const [vessels,      setVessels]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [selected,     setSelected]     = useState(null);   // vessel shown in drawer

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await vesselsApi.list({ status: statusFilter, type: typeFilter });
      setVessels(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="pf-page">
        {/* Header row */}
        <div className="pf-section-header">
          <div className="pf-section-header-left">
            <h1 className="pf-section-title">Vessels</h1>
            <p className="pf-section-subtitle">
              {loading ? 'Loading…' : `${vessels.length} vessel${vessels.length !== 1 ? 's' : ''} · click a row to open details`}
            </p>
          </div>
          <div className="pf-section-header-action">
            <button className="pf-btn pf-btn-outline" onClick={load}>↻ Refresh</button>
          </div>
        </div>

        {/* Filters */}
        <div className="pf-filter-bar">
          <select
            className="pf-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select
            className="pf-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            {TYPE_OPTIONS.filter(Boolean).map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>

        {error   && <ErrorState message={error} onRetry={load} />}
        {loading && <LoadingState message="Loading vessels…" />}

        {!loading && !error && vessels.length === 0 && (
          <div className="pf-empty-state">No vessels match the selected filters.</div>
        )}

        {!loading && !error && vessels.length > 0 && (
          <div className="pf-panel">
            <div className="pf-table-scroll">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Vessel</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>LOA (m)</th>
                    <th>Draught (m)</th>
                    <th>ETA</th>
                    <th>Cargo</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vessels.map(v => (
                    <tr
                      key={v._id}
                      className="vt-row"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelected(v)}
                    >
                      <td className="pf-vessel-name">
                        <span className="pf-vessel-name-text">{v.name}</span>
                        <span className="pf-vessel-imo">{v.imoNumber}</span>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{v.type}</td>
                      <td><StatusBadge status={v.status} /></td>
                      <td>
                        <span className={`pf-priority pf-priority-${v.priority}`}>P{v.priority}</span>
                      </td>
                      <td>{v.loa}</td>
                      <td>{v.draught}</td>
                      <td className="pf-muted-text">{etaLabel(v.eta)}</td>
                      <td className="pf-muted-text" style={{ fontSize: 12 }}>
                        {v.cargoTEU > 0
                          ? `${v.cargoTEU.toLocaleString()} TEU`
                          : v.cargoTonnage > 0
                          ? `${v.cargoTonnage.toLocaleString()} t`
                          : '—'}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button
                          className="pf-btn pf-btn-outline vt-action-btn"
                          title="Recommend berth"
                          onClick={() => setSelected(v)}
                        >
                          ⚓
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Vessel detail drawer */}
      <VesselDrawer vessel={selected} onClose={() => setSelected(null)} />
    </>
  );
}
