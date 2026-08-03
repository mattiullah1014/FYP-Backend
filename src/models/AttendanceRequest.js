import mongoose from 'mongoose';

/** Attendance time correction — Employee → HR */
const attendanceCorrectionSchema = new mongoose.Schema(
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
    requestedClockIn: String, // "HH:mm"
    requestedClockOut: String,
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String, default: '' },
    reviewedAt: Date,
  },
  { timestamps: true }
);

attendanceCorrectionSchema.index({ employee: 1, createdAt: -1 });

export const AttendanceCorrection = mongoose.model(
  'AttendanceCorrection',
  attendanceCorrectionSchema
);

/** Work From Home — Employee → Manager → HR */
const wfhRequestSchema = new mongoose.Schema(
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
    empId: String,
    employeeName: { type: String, default: '' },
    date: { type: Date, required: true, index: true },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      // pending = open for Manager OR HR; legacy pending_manager / pending_hr still accepted
      enum: ['pending', 'pending_manager', 'pending_hr', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    managerReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    managerNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String, default: '' },
    reviewedAt: Date,
  },
  { timestamps: true }
);

wfhRequestSchema.index({ employee: 1, createdAt: -1 });
wfhRequestSchema.index({ manager: 1, status: 1 });

export const WfhRequest = mongoose.model('WfhRequest', wfhRequestSchema);
