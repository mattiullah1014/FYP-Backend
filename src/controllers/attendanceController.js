import Attendance from '../models/Attendance.js';
import { Shift, Holiday } from '../models/Admin.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const clockIn = asyncHandler(async (req, res) => {
  const today = startOfDay();
  let record = await Attendance.findOne({ employee: req.user._id, date: today });
  if (record?.clockIn) throw new ApiError(400, 'Already clocked in today');

  record = await Attendance.findOneAndUpdate(
    { employee: req.user._id, date: today },
    {
      employee: req.user._id,
      date: today,
      clockIn: new Date(),
      clockInLocation: req.body.location,
      status: 'present',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return success(res, 200, 'Clocked in', { attendance: record });
});

const clockOut = asyncHandler(async (req, res) => {
  const today = startOfDay();
  const record = await Attendance.findOne({ employee: req.user._id, date: today });
  if (!record?.clockIn) throw new ApiError(400, 'Clock in first');
  if (record.clockOut) throw new ApiError(400, 'Already clocked out');

  record.clockOut = new Date();
  record.clockOutLocation = req.body.location;
  if (req.body.earlyLeaveReason) record.earlyLeaveReason = req.body.earlyLeaveReason;
  record.workMinutes = Math.round(
    (record.clockOut - record.clockIn) / (1000 * 60)
  );
  await record.save();

  return success(res, 200, 'Clocked out', { attendance: record });
});

const submitLateReason = asyncHandler(async (req, res) => {
  const today = startOfDay(req.body.date || new Date());
  const record = await Attendance.findOne({ employee: req.user._id, date: today });
  if (!record) throw new ApiError(404, 'Attendance record not found');
  record.lateReason = req.body.reason;
  record.status = 'late';
  await record.save();
  return success(res, 200, 'Late reason submitted', { attendance: record });
});

const myAttendance = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = { employee: req.user._id };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = startOfDay(from);
    if (to) filter.date.$lte = startOfDay(to);
  }
  const records = await Attendance.find(filter).sort({ date: -1 });
  return success(res, 200, 'Attendance fetched', { records });
});

const teamAttendance = asyncHandler(async (req, res) => {
  let employeeIds;
  if (req.user.role === ROLES.MANAGER) {
    const team = await User.find({ manager: req.user._id, isDeleted: false }).select('_id');
    employeeIds = team.map((t) => t._id);
  } else {
    employeeIds = req.query.employeeId ? [req.query.employeeId] : undefined;
  }

  const filter = {};
  if (employeeIds) filter.employee = { $in: employeeIds };
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = startOfDay(req.query.from);
    if (req.query.to) filter.date.$lte = startOfDay(req.query.to);
  }

  const records = await Attendance.find(filter)
    .populate('employee', 'name email employeeId')
    .sort({ date: -1 });
  return success(res, 200, 'Team attendance fetched', { records });
});

const adjustAttendance = asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id).populate('employee');
  if (!record) throw new ApiError(404, 'Record not found');

  if (req.user.role === ROLES.MANAGER) {
    if (String(record.employee.manager) !== String(req.user._id)) {
      throw new ApiError(403, 'Not your team member');
    }
  }

  ['clockIn', 'clockOut', 'status', 'adjustmentNote', 'lateReason'].forEach((k) => {
    if (req.body[k] !== undefined) record[k] = req.body[k];
  });
  record.adjustedBy = req.user._id;
  if (record.clockIn && record.clockOut) {
    record.workMinutes = Math.round((new Date(record.clockOut) - new Date(record.clockIn)) / 60000);
  }
  await record.save();
  return success(res, 200, 'Attendance adjusted', { attendance: record });
});

const listShifts = asyncHandler(async (req, res) => {
  const shifts = await Shift.find({ isActive: true });
  return success(res, 200, 'Shifts fetched', { shifts });
});

const upsertShift = asyncHandler(async (req, res) => {
  let shift;
  if (req.params.id) {
    shift = await Shift.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!shift) throw new ApiError(404, 'Shift not found');
  } else {
    shift = await Shift.create(req.body);
  }
  return success(res, req.params.id ? 200 : 201, 'Shift saved', { shift });
});

const listHolidays = asyncHandler(async (req, res) => {
  const holidays = await Holiday.find().sort({ date: 1 });
  return success(res, 200, 'Holidays fetched', { holidays });
});

const createHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.create(req.body);
  return success(res, 201, 'Holiday created', { holiday });
});

export { clockIn,
  clockOut,
  submitLateReason,
  myAttendance,
  teamAttendance,
  adjustAttendance,
  listShifts,
  upsertShift,
  listHolidays,
  createHoliday, };
