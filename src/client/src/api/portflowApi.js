/**
 * portflowApi.js
 *
 * Centralised API client for the PortFlow AI backend.
 *
 * All fetch calls go through this module so that:
 *  - The base URL is configured in one place
 *  - Error handling is consistent across the app
 *  - Components never call fetch() directly
 *
 * The Vite dev-server proxy forwards /api/* to http://localhost:5000,
 * so BASE_URL is empty string in development (requests go to same origin).
 */

const BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Internal fetch wrapper.
 * - Throws a structured error for non-2xx responses.
 * - Returns the parsed JSON `data` field from { success, data } envelope,
 *   or the full body if the envelope is absent.
 */
async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const body = await res.json().catch(() => ({ message: res.statusText }));

  if (!res.ok) {
    const message = body?.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  // Unwrap the standard { success: true, data: ... } envelope when present
  return body?.data !== undefined ? body.data : body;
}

// ── Health ────────────────────────────────────────────────────────────────────

export const healthApi = {
  /** GET /api/health — server + DB status */
  get: () => apiFetch('/api/health').then(() => null).catch(() => null)
    .then(() => apiFetch('/api/health')),
};

// ── Vessels ───────────────────────────────────────────────────────────────────

export const vesselsApi = {
  /** GET /api/vessels?status=...&type=... */
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return apiFetch(`/api/vessels${qs ? `?${qs}` : ''}`);
  },

  /** GET /api/vessels/:id */
  get: (id) => apiFetch(`/api/vessels/${id}`),

  /** POST /api/vessels */
  create: (vessel) =>
    apiFetch('/api/vessels', { method: 'POST', body: JSON.stringify(vessel) }),

  /** PUT /api/vessels/:id */
  update: (id, updates) =>
    apiFetch(`/api/vessels/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
};

// ── Berths ────────────────────────────────────────────────────────────────────

export const berthsApi = {
  /** GET /api/berths?status=...&zone=... */
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return apiFetch(`/api/berths${qs ? `?${qs}` : ''}`);
  },

  /** GET /api/berths/recommend/:vesselId */
  recommend: (vesselId) => apiFetch(`/api/berths/recommend/${vesselId}`),
};

// ── Cranes ────────────────────────────────────────────────────────────────────

export const cranesApi = {
  /** GET /api/cranes?status=...&berthCode=... */
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return apiFetch(`/api/cranes${qs ? `?${qs}` : ''}`);
  },
};

// ── Routes ────────────────────────────────────────────────────────────────────

export const routesApi = {
  /** GET /api/routes?isActive=true */
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))
    ).toString();
    return apiFetch(`/api/routes${qs ? `?${qs}` : ''}`);
  },

  /** GET /api/routes/recommend/:vesselId */
  recommend: (vesselId) => apiFetch(`/api/routes/recommend/${vesselId}`),
};

// ── Congestion ────────────────────────────────────────────────────────────────

export const congestionApi = {
  /** GET /api/congestion — port-wide congestion score */
  get: () => apiFetch('/api/congestion'),

  /** GET /api/congestion/vessels/:id */
  forVessel: (vesselId) => apiFetch(`/api/congestion/vessels/${vesselId}`),
};

// ── Operations ────────────────────────────────────────────────────────────────

export const operationsApi = {
  /** GET /api/operations/plan — 72-hour plan */
  getPlan: () => apiFetch('/api/operations/plan'),
};

// ── AI ────────────────────────────────────────────────────────────────────────

export const aiApi = {
  /** GET /api/ai/analysis — port-wide AI analysis */
  getAnalysis: () => apiFetch('/api/ai/analysis'),

  /** GET /api/ai/vessels/:id — vessel-specific AI analysis */
  forVessel: (vesselId) => apiFetch(`/api/ai/vessels/${vesselId}`),
};
