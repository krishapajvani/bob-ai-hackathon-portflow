import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

// ── Page placeholders ─────────────────────────────────────────────────────────
// These will be replaced with full implementations in Phase 5.
// They are stubs so the router works and the app can be navigated from day one.

function Dashboard() {
  return (
    <div className="container py-4">
      <h2>Dashboard</h2>
      <p className="text-muted">Port overview — congestion score, live vessel status.</p>
      <HealthCheck />
    </div>
  );
}

function Vessels() {
  return (
    <div className="container py-4">
      <h2>Vessels</h2>
      <p className="text-muted">Inbound, waiting, and berthed vessel list.</p>
    </div>
  );
}

function BerthPlanner() {
  return (
    <div className="container py-4">
      <h2>Berth Planner</h2>
      <p className="text-muted">Berth availability grid and AI optimisation.</p>
    </div>
  );
}

function RoutesPage() {
  return (
    <div className="container py-4">
      <h2>Alternative Routes</h2>
      <p className="text-muted">Route recommendations for waiting vessels.</p>
    </div>
  );
}

function OperationalPlan() {
  return (
    <div className="container py-4">
      <h2>72-Hour Operational Plan</h2>
      <p className="text-muted">AI-generated port operations plan.</p>
    </div>
  );
}

// ── Health check widget (visible on Dashboard) ────────────────────────────────
function HealthCheck() {
  const [status, setStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  React.useEffect(() => {
    fetch(`${apiUrl}/api/health`)
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiUrl]);

  if (loading) return <p className="text-muted">Checking backend status…</p>;
  if (error)
    return (
      <div className="alert alert-danger">
        <strong>Backend unreachable:</strong> {error}
        <br />
        <small>Make sure the server is running on {apiUrl}</small>
      </div>
    );

  return (
    <div className={`alert ${status.success ? 'alert-success' : 'alert-warning'}`}>
      <strong>Backend status:</strong> {status.status} &nbsp;|&nbsp;
      <strong>Database:</strong> {status.database} &nbsp;|&nbsp;
      <small className="text-muted">{status.timestamp}</small>
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar() {
  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
      <div className="container">
        <span className="navbar-brand fw-bold">⚓ PortFlow AI</span>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
        >
          <span className="navbar-toggler-icon" />
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto">
            {[
              { to: '/', label: 'Dashboard' },
              { to: '/vessels', label: 'Vessels' },
              { to: '/berths', label: 'Berth Planner' },
              { to: '/routes', label: 'Routes' },
              { to: '/plan', label: '72-h Plan' },
            ].map(({ to, label }) => (
              <li className="nav-item" key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' active fw-semibold' : ''}`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/vessels" element={<Vessels />} />
        <Route path="/berths" element={<BerthPlanner />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/plan" element={<OperationalPlan />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
