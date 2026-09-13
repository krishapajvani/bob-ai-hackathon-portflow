/**
 * StatusBadge.jsx
 *
 * Renders a small colour-coded pill label for operational statuses,
 * risk levels, and vessel states.
 *
 * Props:
 *   status  {string}  — e.g. "waiting", "berthed", "HIGH", "available"
 *   size    {string}  — "sm" (default) | "md"
 */

import React from 'react';

const STATUS_MAP = {
  // Vessel statuses
  inbound:   { bg: '#dbeafe', color: '#1e40af', label: 'Inbound' },
  waiting:   { bg: '#fef9c3', color: '#854d0e', label: 'Waiting' },
  berthed:   { bg: '#dcfce7', color: '#166534', label: 'Berthed' },
  departing: { bg: '#ede9fe', color: '#5b21b6', label: 'Departing' },
  departed:  { bg: '#f3f4f6', color: '#374151', label: 'Departed' },

  // Berth statuses
  available:   { bg: '#dcfce7', color: '#166534', label: 'Available' },
  occupied:    { bg: '#fee2e2', color: '#991b1b', label: 'Occupied' },
  maintenance: { bg: '#fef9c3', color: '#854d0e', label: 'Maintenance' },

  // Risk levels
  LOW:      { bg: '#dcfce7', color: '#166534', label: 'LOW' },
  MEDIUM:   { bg: '#fef9c3', color: '#854d0e', label: 'MEDIUM' },
  HIGH:     { bg: '#ffedd5', color: '#9a3412', label: 'HIGH' },
  CRITICAL: { bg: '#fee2e2', color: '#991b1b', label: 'CRITICAL' },

  // Crane statuses
  assigned: { bg: '#fef9c3', color: '#854d0e', label: 'Assigned' },

  // Generic
  active:   { bg: '#dcfce7', color: '#166534', label: 'Active' },
  inactive: { bg: '#f3f4f6', color: '#374151', label: 'Inactive' },
};

function StatusBadge({ status, size = 'sm' }) {
  const key = status ? String(status).toLowerCase() : '';
  const cfg = STATUS_MAP[key] || STATUS_MAP[status] || {
    bg: '#f3f4f6',
    color: '#374151',
    label: status || '—',
  };

  const fontSize = size === 'md' ? '12px' : '11px';
  const padding  = size === 'md' ? '3px 10px' : '2px 8px';

  return (
    <span
      style={{
        display: 'inline-block',
        background: cfg.bg,
        color: cfg.color,
        borderRadius: '4px',
        fontSize,
        fontWeight: 600,
        padding,
        letterSpacing: '0.3px',
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}

export default StatusBadge;
