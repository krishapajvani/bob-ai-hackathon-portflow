/**
 * ErrorState.jsx
 *
 * Full-section error display with an optional retry callback.
 *
 * Props:
 *   message {string}    — human-readable error description
 *   onRetry {function}  — optional retry handler; shows a Retry button when provided
 */

import React from 'react';

function ErrorState({ message, onRetry }) {
  return (
    <div className="pf-error-state" role="alert">
      <div className="pf-error-icon">⚠</div>
      <p className="pf-error-message">
        {message || 'An unexpected error occurred. Check that the backend server is running.'}
      </p>
      {onRetry && (
        <button className="pf-btn pf-btn-outline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export default ErrorState;
