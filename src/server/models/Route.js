const mongoose = require('mongoose');

/**
 * Route — represents a navigable route leg in the port neighbourhood graph.
 *
 * The route advisor uses this collection to suggest alternative
 * anchorages or nearby ports when the main berth is congested.
 *
 * For the MVP, these records are seeded with synthetic data;
 * a real deployment would integrate live nautical chart data.
 */
const routeSchema = new mongoose.Schema(
  {
    // Human-readable name for display in the UI
    name: { type: String, required: true, trim: true },

    // Origin and destination node identifiers (anchorage code or port code)
    fromNode: { type: String, required: true, uppercase: true, trim: true },
    toNode: { type: String, required: true, uppercase: true, trim: true },

    // Route characteristics
    distanceNm: { type: Number, required: true },       // Nautical miles
    avgTransitHours: { type: Number, required: true },  // Typical transit time

    // Safety / compatibility constraints
    minDraught: { type: Number, default: 0 },   // Minimum draught (metres) — shallow routes
    maxDraught: { type: Number, required: true }, // Maximum draught (metres) — deep-water limit
    hasHazard: { type: Boolean, default: false }, // e.g. sandbar, restricted zone

    // What type of vessels this route serves
    suitableFor: {
      type: [String],
      default: ['container', 'bulk', 'tanker', 'roro', 'general'],
    },

    // Nearby port details (relevant when the route leads to an alternative port)
    destinationPort: {
      portCode: { type: String, uppercase: true, trim: true },
      portName: { type: String, trim: true },
      country: { type: String, trim: true },
      // Estimated waiting time at destination under normal conditions (hours)
      typicalWaitHours: { type: Number, default: 2 },
    },

    // Whether this route is currently active / open
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Route', routeSchema);
