import mongoose from 'mongoose';

/**
 * Company-wide attendance policy (singleton via key).
 * HR sets arrival, departure, grace, half-day cutoff, weekends, etc.
 * Company holidays live in Holiday collection; weekendOffDays here.
 */
const attendanceRulesSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    workStart: { type: String, default: '09:00' },
    workEnd: { type: String, default: '18:00' },
    graceMinutes: { type: Number, default: 20, min: 0 },
    halfDayAfter: { type: String, default: '11:30' },
    overtimeGraceMinutes: { type: Number, default: 0, min: 0 },
    overtimeMinMinutes: { type: Number, default: 15, min: 0 },
    earlyLeaveGraceMinutes: { type: Number, default: 15, min: 0 },
    lateCountForDayDeduction: { type: Number, default: 3, min: 1 },
    workingDaysPerMonth: { type: Number, default: 26, min: 1 },
    defaultPaidLeaveDays: { type: Number, default: 12, min: 0 },
    perfectAttendanceBonusPercent: { type: Number, default: 5, min: 0 },
    attendanceBonusMinPresentPercent: { type: Number, default: 95, min: 0 },
    /**
     * JS getDay() numbers treated as weekly off.
     * Default Sat(6) + Sun(0).
     */
    weekendOffDays: {
      type: [Number],
      default: [0, 6],
    },
    /** If true, employees may clock in on weekend/holiday. */
    allowOffDayClockIn: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('AttendanceRules', attendanceRulesSchema);
