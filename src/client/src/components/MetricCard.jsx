/**
 * MetricCard.jsx
 *
 * A dashboard summary card displaying a single metric.
 *
 * Props:
 *   label     {string}   — metric name, e.g. "Vessels Waiting"
 *   value     {string|number} — the headline figure
 *   sub       {string}   — optional sub-label under the value
 *   accent    {string}   — optional left-border colour (CSS colour)
 *   icon      {string}   — optional single emoji / character icon
 *   loading   {boolean}
 */

import React from 'react';

function MetricCard({ label, value, sub, accent, icon, loading = false }) {
  return (
    <div
      className="pf-metric-card"
      style={{ borderLeft: accent ? `4px solid ${accent}` : '4px solid #e5e7eb' }}
    >
      <div className="pf-metric-header">
        {icon && <span className="pf-metric-icon">{icon}</span>}
        <span className="pf-metric-label">{label}</span>
      </div>
      {loading ? (
        <div className="pf-metric-skeleton" />
      ) : (
        <>
          <div className="pf-metric-value">{value ?? '—'}</div>
          {sub && <div className="pf-metric-sub">{sub}</div>}
        </>
      )}
    </div>
  );
}

export default MetricCard;
