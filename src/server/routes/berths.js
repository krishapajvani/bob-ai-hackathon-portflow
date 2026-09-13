const express = require('express');
const mongoose = require('mongoose');
const Berth = require('../models/Berth');
const Vessel = require('../models/Vessel');
const { recommendBerths } = require('../services/berthOptimizer');

const router = express.Router();

/**
 * GET /api/berths
 * Returns all berths with their current status.
 */
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.zone) filter.terminalZone = req.query.zone;

    const berths = await Berth.find(filter)
      .populate('currentVesselId', 'name imoNumber status')
      .sort({ berthCode: 1 });

    res.json({ success: true, count: berths.length, data: berths });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/berths/recommend/:vesselId ──────────────────────────────────────
/**
 * Returns ranked berth recommendations for a specific vessel.
 * Evaluates all berths against the vessel's physical specs and constraints.
 *
 * IMPORTANT: this route MUST be declared before /:id — otherwise Express
 * would interpret the literal word "recommend" as a MongoDB ObjectId.
 */
router.get('/recommend/:vesselId', async (req, res, next) => {
  try {
    const { vesselId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(vesselId)) {
      return res.status(400).json({ success: false, message: 'Invalid vessel ID format' });
    }

    const [vessel, berths] = await Promise.all([
      Vessel.findById(vesselId).lean(),
      Berth.find({}).lean(),
    ]);

    if (!vessel) {
      return res.status(404).json({ success: false, message: 'Vessel not found' });
    }

    const result = recommendBerths({ vessel, berths });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/berths/:id
 * Returns a single berth by its MongoDB _id.
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid berth ID format' });
    }
    const berth = await Berth.findById(req.params.id).populate('currentVesselId');
    if (!berth) {
      return res.status(404).json({ success: false, message: 'Berth not found' });
    }
    res.json({ success: true, data: berth });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/berths/:id
 * Updates a berth (status, crane availability, etc.).
 */
router.put('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid berth ID format' });
    }
    const berth = await Berth.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!berth) {
      return res.status(404).json({ success: false, message: 'Berth not found' });
    }
    res.json({ success: true, data: berth });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
