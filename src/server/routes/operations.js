/**
 * routes/operations.js
 *
 * REST endpoint for the 72-hour operational planner.
 *
 *  GET /api/operations/plan
 *
 * Loads the current snapshot from the database, calls generatePlan(),
 * and returns the full structured plan.
 */

const express = require('express');
const Vessel = require('../models/Vessel');
const Berth = require('../models/Berth');
const Crane = require('../models/Crane');
const Route = require('../models/Route');
const { generatePlan } = require('../services/operationsPlanner');

const router = express.Router();

/**
 * GET /api/operations/plan
 *
 * Returns a 72-hour operational plan for the port.
 *
 * Optional query parameters:
 *   (none for MVP — the plan always covers the full 72-hour window)
 */
router.get('/plan', async (req, res, next) => {
  try {
    // Load all data needed for the plan
    const [vessels, berths, cranes, routes] = await Promise.all([
      Vessel.find({ status: { $ne: 'departed' } }).lean(),
      Berth.find({}).lean(),
      Crane.find({}).lean(),
      Route.find({ isActive: true }).lean(),
    ]);

    const plan = generatePlan({ vessels, berths, cranes, routes });

    res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
