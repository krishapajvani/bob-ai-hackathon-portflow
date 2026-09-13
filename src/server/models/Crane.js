const mongoose = require('mongoose');

/**
 * Crane — a port crane resource that can be assigned to vessels at a berth.
 *
 * Cranes are tracked individually so the resource optimizer
 * can see exactly which cranes are free and which are committed.
 *
 * The Berth model stores aggregate counts (craneCount / cranesAvailable)
 * for fast congestion scoring; this model stores the detail.
 */
const craneSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      // e.g. "CRN-01", "CRN-02"
    },
    type: {
      type: String,
      required: true,
      enum: ['ship-to-shore', 'mobile', 'gantry', 'reach-stacker'],
    },
    berthCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      // Matches Berth.berthCode — kept as a string for simplicity
    },
    status: {
      type: String,
      required: true,
      enum: ['available', 'assigned', 'maintenance'],
      default: 'available',
    },
    // Which vessel this crane is currently serving (null if free)
    assignedVesselId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vessel',
      default: null,
    },
    // When this crane will be free again (null if currently available)
    availableFrom: { type: Date, default: null },

    // Lift rate in moves-per-hour (used for throughput estimation)
    movesPerHour: { type: Number, default: 25 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Crane', craneSchema);
