import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    assetTag: { type: String, unique: true, required: true },
    category: {
      type: String,
      enum: ['laptop', 'phone', 'monitor', 'furniture', 'other'],
      default: 'other',
    },
    status: {
      type: String,
      enum: ['available', 'assigned', 'maintenance', 'retired'],
      default: 'available',
    },
    purchaseDate: Date,
    value: Number,
    notes: String,
  },
  { timestamps: true }
);

const assetAssignmentSchema = new mongoose.Schema(
  {
    asset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date, default: Date.now },
    returnedAt: Date,
    returnRequested: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['assigned', 'return-requested', 'returned'],
      default: 'assigned',
    },
    notes: String,
  },
  { timestamps: true }
);

export const Asset = mongoose.model('Asset', assetSchema);
export const AssetAssignment = mongoose.model(
  'AssetAssignment',
  assetAssignmentSchema
);
