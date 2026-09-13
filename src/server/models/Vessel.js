const mongoose = require('mongoose');

/**
 * Vessel — represents a ship that is inbound, waiting, berthed, or departing.
 *
 * Key fields used by the congestion engine and berth optimizer:
 *  - loa / beam / draught  : physical dimensions for berth compatibility checks
 *  - eta / etd             : time window used in the 72-hour plan
 *  - status                : drives the live dashboard counts
 *  - priority              : 1 = highest urgency (medical, perishables, etc.)
 */
const vesselSchema = new mongoose.Schema(
  {
    imoNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['container', 'bulk', 'tanker', 'roro', 'general'],
    },
    // Physical dimensions (metres)
    loa: { type: Number, required: true },   // Length Overall
    beam: { type: Number, required: true },  // Width
    draught: { type: Number, required: true }, // Depth below waterline

    // Cargo
    cargoTEU: { type: Number, default: 0 },  // Twenty-foot Equivalent Units (containers)
    cargoTonnage: { type: Number, default: 0 }, // Bulk / tanker tonnage (metric tonnes)

    // Schedule
    eta: { type: Date, required: true },
    etd: { type: Date },

    // Current state
    status: {
      type: String,
      required: true,
      enum: ['inbound', 'waiting', 'berthed', 'departing', 'departed'],
      default: 'inbound',
    },

    // Berth assignment (null when unassigned)
    assignedBerthId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Berth',
      default: null,
    },

    // 1 = highest priority (emergency / perishables), 5 = lowest
    priority: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },

    // Free-text notes for the operator
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vessel', vesselSchema);
