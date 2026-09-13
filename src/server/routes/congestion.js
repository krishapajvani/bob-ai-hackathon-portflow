/**
 * routes/congestion.js
 *
 * REST endpoints for the congestion engine.
 *
 *  GET /api/congestion              - Port-wide congestion assessment
 *  GET /api/congestion/vessels/:id  - Congestion impact for a single vessel
 */

const express = require('express');
const mongoose = require('mongoose');
const Vessel = require('../models/Vessel');
const Berth = require('../models/Berth');
const { calculateCongestion } = require('../services/congestionEngine');

const router = express.Router();

// ── GET /api/congestion ───────────────────────────────────────────────────────
/**
 * Returns the full port-wide congestion assessment.
 * Loads all non-departed vessels and all berths, then runs the engine.
 */
router.get('/', async (req, res, next) => {
  try {
    // Exclude departed vessels — they no longer affect port congestion
    const [vessels, berths] = await Promise.all([
      Vessel.find({ status: { $ne: 'departed' } }).lean(),
      Berth.find({}).lean(),
    ]);

    const result = calculateCongestion({ vessels, berths });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/congestion/vessels/:id ───────────────────────────────────────────
/**
 * Returns the congestion context for a specific vessel:
 * how this vessel contributes to or is affected by current congestion,
 * plus the full port assessment.
 */
router.get('/vessels/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid vessel ID format' });
    }

    const vessel = await Vessel.findById(req.params.id).lean();
    if (!vessel) {
      return res.status(404).json({ success: false, message: 'Vessel not found' });
    }

    const [allVessels, berths] = await Promise.all([
      Vessel.find({ status: { $ne: 'departed' } }).lean(),
      Berth.find({}).lean(),
    ]);

    const portCongestion = calculateCongestion({ vessels: allVessels, berths });

    // Determine this vessel's contribution / impact
    const isAffected = portCongestion.affectedVessels.some(
      (v) => String(v.id) === String(vessel._id)
    );

    const impact = {
      isAffected,
      vesselStatus: vessel.status,
      affectedBy: [],
    };

    if (vessel.status === 'waiting') {
      impact.affectedBy.push('Vessel is at anchor — contributing to anchor queue congestion factor');
    }
    if (vessel.status === 'inbound') {
      impact.affectedBy.push('Vessel ETA is within the inbound pressure window');
    }
    if (vessel.priority === 1 && vessel.status === 'waiting') {
      impact.affectedBy.push(
        'Priority-1 vessel waiting — triggering the stranded priority-vessel alarm factor'
      );
    }

    res.json({
      success: true,
      data: {
        vessel: {
          id: vessel._id,
          name: vessel.name,
          imoNumber: vessel.imoNumber,
          status: vessel.status,
          priority: vessel.priority,
        },
        vesselImpact: impact,
        portCongestion,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
