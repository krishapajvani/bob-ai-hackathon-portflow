/**
 * routes/ai.js
 *
 * AI-enriched analysis endpoints.
 *
 *  GET /api/ai/analysis      - Port-wide AI analysis
 *  GET /api/ai/vessels/:id   - Vessel-specific AI analysis
 *
 * Each endpoint:
 *  1. Gathers data from the deterministic services (congestion, plan, etc.)
 *  2. Passes the structured context to aiService.analysePortSituation()
 *  3. Returns the AI-enriched response
 *
 * The deterministic services remain authoritative — the AI layer
 * only adds human-readable explanation.
 */

const express = require('express');
const mongoose = require('mongoose');

const Vessel = require('../models/Vessel');
const Berth = require('../models/Berth');
const Crane = require('../models/Crane');
const Route = require('../models/Route');

const { calculateCongestion } = require('../services/congestionEngine');
const { recommendBerths } = require('../services/berthOptimizer');
const { recommendRoutes } = require('../services/routeAdvisor');
const { generatePlan } = require('../services/operationsPlanner');
const { analysePortSituation } = require('../services/aiService');

const router = express.Router();

// ── GET /api/ai/analysis ──────────────────────────────────────────────────────
/**
 * Returns a full port-wide AI analysis.
 *
 * Collects the current congestion snapshot, the 72-hour operational plan,
 * and generic berth/route contexts, then asks the AI service to enrich them.
 */
router.get('/analysis', async (req, res, next) => {
  try {
    // Load all data in parallel
    const [vessels, berths, cranes, routes] = await Promise.all([
      Vessel.find({ status: { $ne: 'departed' } }).lean(),
      Berth.find({}).lean(),
      Crane.find({}).lean(),
      Route.find({ isActive: true }).lean(),
    ]);

    // Run deterministic services
    const congestion = calculateCongestion({ vessels, berths });
    const operationalPlan = generatePlan({ vessels, berths, cranes, routes });

    // Build the context for the AI service
    const context = {
      congestion,
      operationalPlan,
      // No specific vessel — omit berthRecommendations / routeRecommendations
    };

    const aiResult = await analysePortSituation(context);

    res.json({
      success: true,
      data: {
        // Always include the deterministic scores so the frontend
        // can display them alongside (or instead of) the AI narrative
        congestionScore: congestion.overallScore,
        congestionLevel: congestion.riskLevel,
        planSummary: operationalPlan.summary,
        // AI enrichment
        ai: aiResult,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/ai/vessels/:id ───────────────────────────────────────────────────
/**
 * Returns a vessel-specific AI analysis.
 *
 * Gathers berth and route recommendations for the specific vessel,
 * adds the port congestion snapshot, and asks the AI service for
 * a focused explanation of that vessel's situation.
 */
router.get('/vessels/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid vessel ID format' });
    }

    const [vessel, berths, routes] = await Promise.all([
      Vessel.findById(req.params.id).lean(),
      Berth.find({}).lean(),
      Route.find({ isActive: true }).lean(),
    ]);

    if (!vessel) {
      return res.status(404).json({ success: false, message: 'Vessel not found' });
    }

    // Run deterministic services for this vessel's context
    const vessels = await Vessel.find({ status: { $ne: 'departed' } }).lean();
    const congestion = calculateCongestion({ vessels, berths });
    const berthRecommendations = recommendBerths({ vessel, berths });
    const routeRecommendations = recommendRoutes({ vessel, routes });

    const context = {
      congestion,
      berthRecommendations,
      routeRecommendations,
      operationalPlan: null, // vessel-specific analysis omits the full plan
    };

    const aiResult = await analysePortSituation(context);

    res.json({
      success: true,
      data: {
        vessel: {
          id: vessel._id,
          name: vessel.name,
          imoNumber: vessel.imoNumber,
          type: vessel.type,
          status: vessel.status,
          priority: vessel.priority,
        },
        congestionScore: congestion.overallScore,
        congestionLevel: congestion.riskLevel,
        topBerthRecommendation: berthRecommendations.topRecommendation,
        topRouteRecommendation: routeRecommendations.topRecommendation,
        ai: aiResult,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
