import mongoose from 'mongoose';

const overtimeRequestSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    date: { type: Date, required: true },
    hours: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true },
    /** manual | auto_clock_out */
    source: {
      type: String,
      enum: ['manual', 'auto_clock_out'],
      default: 'manual',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewNote: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('OvertimeRequest', overtimeRequestSchema);
