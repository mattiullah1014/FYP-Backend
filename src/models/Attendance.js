import mongoose from 'mongoose';

const geoSchema = new mongoose.Schema(
  {
    lat: Number,
    lng: Number,
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: { type: Date, required: true, index: true },
    clockIn: Date,
    clockOut: Date,
    clockInLocation: geoSchema,
    clockOutLocation: geoSchema,
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'half-day', 'on-leave', 'wfh'],
      default: 'present',
    },
    lateMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    halfDayPending: { type: Boolean, default: false },
    halfDayRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HalfDayRequest',
    },
    overtimeRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OvertimeRequest',
    },
    lateReason: String,
    earlyLeaveReason: String,
    adjustmentNote: String,
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    workMinutes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

export default mongoose.model('Attendance', attendanceSchema);
