import mongoose from 'mongoose';

const leavePolicySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    leaveType: {
      type: String,
      required: true,
      enum: ['annual', 'sick', 'casual', 'unpaid', 'maternity', 'paternity', 'other'],
    },
    daysPerYear: { type: Number, required: true, min: 0 },
    carryForward: { type: Boolean, default: false },
    description: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const leaveBalanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    leaveType: { type: String, required: true },
    year: { type: Number, required: true },
    allocated: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
  },
  { timestamps: true }
);

leaveBalanceSchema.index({ employee: 1, leaveType: 1, year: 1 }, { unique: true });

const leaveRequestSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Reviewing manager for this request (multi-manager support) */
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    leaveType: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: { type: Number, required: true },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    managerStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    hrStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'not-required'],
      default: 'not-required',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNote: String,
  },
  { timestamps: true }
);

export const LeavePolicy = mongoose.model('LeavePolicy', leavePolicySchema);
export const LeaveBalance = mongoose.model('LeaveBalance', leaveBalanceSchema);
export const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);
