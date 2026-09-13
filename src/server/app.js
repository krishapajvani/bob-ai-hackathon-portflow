const express = require('express');
const cors = require('cors');

const errorHandler = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health');
const vesselRoutes = require('./routes/vessels');
const berthRoutes = require('./routes/berths');
const craneRoutes = require('./routes/cranes');
const routeRoutes = require('./routes/routes');
const congestionRoutes = require('./routes/congestion');
const operationsRoutes = require('./routes/operations');
const aiRoutes = require('./routes/ai');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api', healthRoutes);
app.use('/api/vessels', vesselRoutes);
app.use('/api/berths', berthRoutes);
app.use('/api/cranes', craneRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/congestion', congestionRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/ai', aiRoutes);

// ── 404 catch-all ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
