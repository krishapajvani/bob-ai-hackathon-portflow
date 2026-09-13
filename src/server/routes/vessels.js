const express = require('express');
const Vessel = require('../models/Vessel');

const router = express.Router();

/**
 * GET /api/vessels
 * Returns all vessels. Supports optional query filters:
 *   ?status=waiting   - filter by status
 *   ?type=container   - filter by vessel type
 */
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;

    const vessels = await Vessel.find(filter).sort({ eta: 1 });
    res.json({ success: true, count: vessels.length, data: vessels });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/vessels/:id
 * Returns a single vessel by its MongoDB _id.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const vessel = await Vessel.findById(req.params.id).populate('assignedBerthId');
    if (!vessel) {
      return res.status(404).json({ success: false, message: 'Vessel not found' });
    }
    res.json({ success: true, data: vessel });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/vessels
 * Adds a new vessel arrival record.
 */
router.post('/', async (req, res, next) => {
  try {
    const vessel = await Vessel.create(req.body);
    res.status(201).json({ success: true, data: vessel });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/vessels/:id
 * Updates a vessel (status change, berth assignment, etc.).
 */
router.put('/:id', async (req, res, next) => {
  try {
    const vessel = await Vessel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!vessel) {
      return res.status(404).json({ success: false, message: 'Vessel not found' });
    }
    res.json({ success: true, data: vessel });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
