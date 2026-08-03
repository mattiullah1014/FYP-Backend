import mongoose from 'mongoose';

/** Auto-created when employee clocks in after halfDayAfter cutoff */
const halfDayRequestSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    empId: String,
    employeeName: { type: String, default: '' },
    date: { type: Date, required: true, index: true },
    clockIn: { type: Date, required: true },
    lateMinutes: { type: Number, default: 0 },
    reason: { type: String, default: 'Auto: clock-in after half-day cutoff' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String, default: '' },
    reviewedAt: Date,
  },
  { timestamps: true }
);

halfDayRequestSchema.index({ employee: 1, date: 1 }, { unique: true });

export default mongoose.model('HalfDayRequest', halfDayRequestSchema);
