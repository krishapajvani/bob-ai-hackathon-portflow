import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

import Overview   from './pages/Overview';
import Vessels    from './pages/Vessels';
import Berths     from './pages/Berths';
import RoutesPage from './pages/Routes';
import Plan       from './pages/Plan';
import AiInsights from './pages/AiInsights';

// ── Navigation items ──────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/',          icon: '📊', label: 'Overview',      end: true  },
  { to: '/vessels',   icon: '🚢', label: 'Vessels',       end: false },
  { to: '/berths',    icon: '⚓', label: 'Berth Planner', end: false },
  { to: '/routes',    icon: '🗺️',  label: 'Route Advisor', end: false },
  { to: '/plan',      icon: '📅', label: '72-h Plan',     end: false },
  { to: '/ai',        icon: '🤖', label: 'AI Insights',   end: false },
];

// Page titles keyed by pathname prefix
const PAGE_TITLES = {
  '/':        'Overview',
  '/vessels': 'Vessels',
  '/berths':  'Berth Planner',
  '/routes':  'Route Advisor',
  '/plan':    '72-Hour Operational Plan',
  '/ai':      'AI Insights',
};

// ── Topbar (reads current route for title) ───────────────────────────────────
function Topbar() {
  const location = useLocation();
  const path  = location.pathname;
  const title = Object.entries(PAGE_TITLES)
    .filter(([k]) => path === '/' ? k === '/' : path.startsWith(k) && k !== '/')
    .map(([, v]) => v)[0] || PAGE_TITLES['/'];

  const now = new Date().toLocaleString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="pf-topbar">
      <h1 className="pf-topbar-title">{title}</h1>
      <span className="pf-topbar-meta">{now}</span>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar() {
  return (
    <aside className="pf-sidebar">
      {/* Brand */}
      <div className="pf-sidebar-brand">
        <span className="pf-sidebar-brand-icon">⚓</span>
        <div>
          <span className="pf-sidebar-brand-name">PortFlow AI</span>
          <span className="pf-sidebar-brand-sub">Port Operations</span>
        </div>
      </div>

      {/* Nav */}
      <ul className="pf-nav" role="navigation">
        {NAV_ITEMS.map(({ to, icon, label, end }) => (
          <li className="pf-nav-item" key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `pf-nav-link${isActive ? ' active' : ''}`
              }
            >
              <span className="pf-nav-icon">{icon}</span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="pf-sidebar-footer">
        IBM Bobathon 2026
      </div>
    </aside>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <div className="pf-shell">
        <Sidebar />
        <div className="pf-main">
          <Topbar />
          <main className="pf-content">
            <Routes>
              <Route path="/"        element={<Overview />}   />
              <Route path="/vessels" element={<Vessels />}    />
              <Route path="/berths"  element={<Berths />}     />
              <Route path="/routes"  element={<RoutesPage />} />
              <Route path="/plan"    element={<Plan />}       />
              <Route path="/ai"      element={<AiInsights />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
