const mongoose = require('mongoose');

/**
 * Berth — a physical docking location at the port.
 *
 * The berth optimizer uses maxLOA, maxDraught and vesselTypes
 * to find compatible berths for incoming vessels.
 * cranesAvailable drives crane allocation logic.
 */
const berthSchema = new mongoose.Schema(
  {
    berthCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    terminalZone: {
      type: String,
      required: true,
      enum: ['North', 'South', 'East', 'West'],
    },
    // Physical constraints
    maxLOA: { type: Number, required: true },     // Max vessel length (metres)
    maxDraught: { type: Number, required: true },  // Max vessel draught (metres)
    berthLength: { type: Number, required: true }, // Quay face length (metres)

    // Which vessel types this berth can accept
    vesselTypes: {
      type: [String],
      required: true,
      enum: ['container', 'bulk', 'tanker', 'roro', 'general'],
    },

    // Current operational status
    status: {
      type: String,
      required: true,
      enum: ['available', 'occupied', 'maintenance'],
      default: 'available',
    },

    // Crane capacity at this berth
    craneCount: { type: Number, default: 0 },       // Total cranes installed
    cranesAvailable: { type: Number, default: 0 },  // Cranes currently free

    // When this berth will next become available (null if currently available)
    occupiedUntil: { type: Date, default: null },

    // The vessel currently berthed here (null if empty)
    currentVesselId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vessel',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Berth', berthSchema);
