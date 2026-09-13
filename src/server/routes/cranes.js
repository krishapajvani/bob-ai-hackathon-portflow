const express = require('express');
const Crane = require('../models/Crane');

const router = express.Router();

/**
 * GET /api/cranes
 * Returns all cranes. Optional filters:
 *   ?status=available   - filter by status
 *   ?berthCode=B01      - filter by berth
 */
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.berthCode) filter.berthCode = req.query.berthCode.toUpperCase();

    const cranes = await Crane.find(filter).sort({ identifier: 1 });
    res.json({ success: true, count: cranes.length, data: cranes });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cranes/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const crane = await Crane.findById(req.params.id).populate('assignedVesselId', 'name imoNumber');
    if (!crane) {
      return res.status(404).json({ success: false, message: 'Crane not found' });
    }
    res.json({ success: true, data: crane });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/cranes/:id
 * Updates crane status or assignment.
 */
router.put('/:id', async (req, res, next) => {
  try {
    const crane = await Crane.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!crane) {
      return res.status(404).json({ success: false, message: 'Crane not found' });
    }
    res.json({ success: true, data: crane });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
