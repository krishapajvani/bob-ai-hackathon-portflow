const express = require('express');
const mongoose = require('mongoose');
const Route = require('../models/Route');
const Vessel = require('../models/Vessel');
const { recommendRoutes } = require('../services/routeAdvisor');

const router = express.Router();

/**
 * GET /api/routes
 * Returns all route definitions in the port neighbourhood graph.
 * Optional filters:
 *   ?isActive=true      - only active routes
 *   ?fromNode=MAIN      - routes from a specific node
 */
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }
    if (req.query.fromNode) filter.fromNode = req.query.fromNode.toUpperCase();

    const routes = await Route.find(filter).sort({ distanceNm: 1 });
    res.json({ success: true, count: routes.length, data: routes });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/routes/recommend/:vesselId ───────────────────────────────────────
/**
 * Returns ranked route recommendations for a specific vessel.
 * Only returns routes that are safe for the vessel's draught.
 *
 * IMPORTANT: declared before /:id so Express does not treat
 * "recommend" as a MongoDB ObjectId.
 */
router.get('/recommend/:vesselId', async (req, res, next) => {
  try {
    const { vesselId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(vesselId)) {
      return res.status(400).json({ success: false, message: 'Invalid vessel ID format' });
    }

    const [vessel, routes] = await Promise.all([
      Vessel.findById(vesselId).lean(),
      Route.find({ isActive: true }).lean(),
    ]);

    if (!vessel) {
      return res.status(404).json({ success: false, message: 'Vessel not found' });
    }

    const result = recommendRoutes({ vessel, routes });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/routes/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid route ID format' });
    }
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({ success: false, message: 'Route not found' });
    }
    res.json({ success: true, data: route });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
