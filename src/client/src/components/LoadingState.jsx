/**
 * LoadingState.jsx
 *
 * Full-section loading indicator with an optional message.
 *
 * Props:
 *   message {string} — defaults to "Loading…"
 *   rows    {number} — number of skeleton rows to render (default 4)
 */

import React from 'react';

function LoadingState({ message = 'Loading…', rows = 4 }) {
  return (
    <div className="pf-loading-state" role="status" aria-live="polite">
      <div className="pf-loading-spinner" />
      <p className="pf-loading-message">{message}</p>
      <div className="pf-skeleton-rows">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="pf-skeleton-row"
            style={{ width: `${70 + (i % 3) * 10}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default LoadingState;
