import AttendanceRules from '../models/AttendanceRules.js';
import Attendance from '../models/Attendance.js';
import HalfDayRequest from '../models/HalfDayRequest.js';
import OvertimeRequest from '../models/OvertimeRequest.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import { LeaveRequest } from '../models/Leave.js';
import { Holiday } from '../models/Admin.js';
import { Message } from '../models/Communication.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES } from '../constants/roles.js';
import { notify } from '../services/notificationService.js';

const DEFAULTS = {
  workStart: '09:00',
  workEnd: '18:00',
  graceMinutes: 20,
  halfDayAfter: '11:30',
  overtimeGraceMinutes: 0,
  overtimeMinMinutes: 15,
  earlyLeaveGraceMinutes: 15,
  lateCountForDayDeduction: 3,
  workingDaysPerMonth: 26,
  defaultPaidLeaveDays: 12,
  perfectAttendanceBonusPercent: 5,
  attendanceBonusMinPresentPercent: 95,
  weekendOffDays: [0, 6],
  allowOffDayClockIn: false,
};

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (d = new Date()) => {
  const date = startOfDay(d);
  date.setHours(23, 59, 59, 999);
  return date;
};

const parseTimeToMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const dateToMinutes = (isoOrDate) => {
  const d = new Date(isoOrDate);
  return d.getHours() * 60 + d.getMinutes();
};

const holidayDto = (h) => {
  const row = h?.toObject ? h.toObject() : h;
  return {
    id: String(row._id),
    name: row.name,
    date: row.date ? String(row.date).slice(0, 10) : '',
    type: row.type || 'company',
  };
};

const listHolidaysNear = async (fromDate, toDate) => {
  const from = startOfDay(fromDate);
  const to = endOfDay(toDate);
  const rows = await Holiday.find({
    date: { $gte: from, $lte: to },
  }).sort({ date: 1 });
  return rows.map(holidayDto);
};

const findHolidayOn = async (day) => {
  const start = startOfDay(day);
  const end = endOfDay(day);
  return Holiday.findOne({ date: { $gte: start, $lte: end } });
};

/**
 * Resolve whether a date is weekly off or a company/public holiday.
 */
export const resolveDayOff = async (day, rules) => {
  const d = startOfDay(day);
  const weekday = d.getDay();
  const weekendOffDays = Array.isArray(rules.weekendOffDays)
    ? rules.weekendOffDays.map(Number)
    : DEFAULTS.weekendOffDays;

  if (weekendOffDays.includes(weekday)) {
    return {
      isOff: true,
      kind: 'weekend',
      status: 'weekend',
      label: `${DAY_NAMES[weekday]} (Weekly Off)`,
      holiday: null,
    };
  }

  const holiday = await findHolidayOn(d);
  if (holiday) {
    return {
      isOff: true,
      kind: 'holiday',
      status: 'holiday',
      label: holiday.name || 'Holiday',
      holiday: holidayDto(holiday),
    };
  }

  return {
    isOff: false,
    kind: null,
    status: null,
    label: null,
    holiday: null,
  };
};

export const getOrCreateRules = async () => {
  let doc = await AttendanceRules.findOne({ key: 'default' });
  if (!doc) {
    doc = await AttendanceRules.create({ key: 'default', ...DEFAULTS });
  }
  return doc;
};

const rulesDto = (doc) => {
  const r = doc?.toObject ? doc.toObject() : doc;
  const weekendOffDays = Array.isArray(r.weekendOffDays)
    ? r.weekendOffDays.map(Number)
    : [...DEFAULTS.weekendOffDays];
  return {
    workStart: r.workStart || DEFAULTS.workStart,
    workEnd: r.workEnd || DEFAULTS.workEnd,
    graceMinutes: r.graceMinutes ?? DEFAULTS.graceMinutes,
    halfDayAfter: r.halfDayAfter || DEFAULTS.halfDayAfter,
    overtimeGraceMinutes:
      r.overtimeGraceMinutes ?? DEFAULTS.overtimeGraceMinutes,
    overtimeMinMinutes: r.overtimeMinMinutes ?? DEFAULTS.overtimeMinMinutes,
    earlyLeaveGraceMinutes:
      r.earlyLeaveGraceMinutes ?? DEFAULTS.earlyLeaveGraceMinutes,
    lateCountForDayDeduction:
      r.lateCountForDayDeduction ?? DEFAULTS.lateCountForDayDeduction,
    workingDaysPerMonth: r.workingDaysPerMonth ?? DEFAULTS.workingDaysPerMonth,
    defaultPaidLeaveDays:
      r.defaultPaidLeaveDays ?? DEFAULTS.defaultPaidLeaveDays,
    perfectAttendanceBonusPercent:
      r.perfectAttendanceBonusPercent ??
      DEFAULTS.perfectAttendanceBonusPercent,
    attendanceBonusMinPresentPercent:
      r.attendanceBonusMinPresentPercent ??
      DEFAULTS.attendanceBonusMinPresentPercent,
    weekendOffDays,
    allowOffDayClockIn: Boolean(
      r.allowOffDayClockIn ?? DEFAULTS.allowOffDayClockIn
    ),
    updatedAt: r.updatedAt,
  };
};

/**
 * Evaluate clock-in against rules.
 * present: within workStart + grace
 * late: after grace, before halfDayAfter
 * half_day_request: at/after halfDayAfter
 */
export const evaluateClockIn = (now, rules) => {
  const start = parseTimeToMinutes(rules.workStart);
  const grace = Number(rules.graceMinutes) || 0;
  const halfCut = parseTimeToMinutes(rules.halfDayAfter || '11:30');
  const actual = dateToMinutes(now);
  const lateMinutes = Math.max(0, actual - start);

  if (actual <= start + grace) {
    return {
      status: 'present',
      lateMinutes: 0,
      needsHalfDayApproval: false,
      withinGrace: actual > start,
    };
  }
  if (actual >= halfCut) {
    return {
      status: 'late', // provisional until HR approves half-day
      lateMinutes,
      needsHalfDayApproval: true,
      withinGrace: false,
    };
  }
  return {
    status: 'late',
    lateMinutes,
    needsHalfDayApproval: false,
    withinGrace: false,
  };
};

export const evaluateClockOut = (now, rules) => {
  const end = parseTimeToMinutes(rules.workEnd);
  const otGrace = Number(rules.overtimeGraceMinutes) || 0;
  const minOt = Number(rules.overtimeMinMinutes) || 0;
  const actual = dateToMinutes(now);
  const overtimeMinutes = Math.max(0, actual - (end + otGrace));
  return {
    overtimeMinutes,
    needsOvertimeApproval: overtimeMinutes >= minOt && overtimeMinutes > 0,
    earlyMinutes: Math.max(0, end - actual),
  };
};

const attendanceDto = (doc, extras = {}) => {
  const a = doc?.toObject ? doc.toObject() : doc;
  return {
    id: String(a._id),
    date: a.date ? String(a.date).slice(0, 10) : '',
    clockIn: a.clockIn,
    clockOut: a.clockOut,
    status: a.status,
    lateMinutes: a.lateMinutes || 0,
    overtimeMinutes: a.overtimeMinutes || 0,
    halfDayPending: Boolean(a.halfDayPending),
    workMinutes: a.workMinutes || 0,
    hoursWorked: a.workMinutes ? +(a.workMinutes / 60).toFixed(2) : 0,
    ...extras,
  };
};

const notifyHr = async (subject, message, senderId) => {
  const hrs = await User.find({
    role: { $in: [ROLES.HR, ROLES.ADMIN] },
    isDeleted: { $ne: true },
  }).select('_id email');
  await Promise.all(
    hrs.map((u) =>
      Message.create({
        sender: senderId,
        recipient: u._id,
        title: subject,
        body: message,
        type: 'approval',
      }).catch(() => null)
    )
  );
  await Promise.all(
    hrs
      .filter((u) => u.email)
      .map((u) =>
        notify({
          to: u.email,
          channel: 'email',
          subject,
          message,
        }).catch(() => null)
      )
  );
};

/** GET /hr/attendance/rules | GET /employee/attendance/rules */
const getRules = asyncHandler(async (req, res) => {
  const doc = await getOrCreateRules();
  const rules = rulesDto(doc);
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const yearEnd = new Date(new Date().getFullYear() + 1, 11, 31);
  const holidays = await listHolidaysNear(yearStart, yearEnd);
  const dayOff = await resolveDayOff(new Date(), rules);
  return success(res, 200, 'Attendance rules fetched', {
    rules,
    holidays,
    dayOff,
  });
});

/** PATCH /hr/attendance/rules */
const updateRules = asyncHandler(async (req, res) => {
  const doc = await getOrCreateRules();
  const allowed = [
    'workStart',
    'workEnd',
    'graceMinutes',
    'halfDayAfter',
    'overtimeGraceMinutes',
    'overtimeMinMinutes',
    'earlyLeaveGraceMinutes',
    'lateCountForDayDeduction',
    'workingDaysPerMonth',
    'defaultPaidLeaveDays',
    'perfectAttendanceBonusPercent',
    'attendanceBonusMinPresentPercent',
    'allowOffDayClockIn',
  ];
  for (const key of allowed) {
    if (req.body[key] !== undefined && req.body[key] !== null && req.body[key] !== '') {
      const numericKeys = [
        'graceMinutes',
        'overtimeGraceMinutes',
        'overtimeMinMinutes',
        'earlyLeaveGraceMinutes',
        'lateCountForDayDeduction',
        'workingDaysPerMonth',
        'defaultPaidLeaveDays',
        'perfectAttendanceBonusPercent',
        'attendanceBonusMinPresentPercent',
      ];
      if (key === 'allowOffDayClockIn') {
        doc[key] =
          req.body[key] === true ||
          req.body[key] === 'true' ||
          req.body[key] === 1 ||
          req.body[key] === '1';
      } else {
        doc[key] = numericKeys.includes(key)
          ? Number(req.body[key])
          : req.body[key];
      }
    }
  }

  if (req.body.weekendOffDays !== undefined) {
    const raw = Array.isArray(req.body.weekendOffDays)
      ? req.body.weekendOffDays
      : String(req.body.weekendOffDays || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
    doc.weekendOffDays = [
      ...new Set(
        raw
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      ),
    ];
  }

  await doc.save();
  const rules = rulesDto(doc);
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const yearEnd = new Date(new Date().getFullYear() + 1, 11, 31);
  const holidays = await listHolidaysNear(yearStart, yearEnd);
  return success(res, 200, 'Attendance rules updated', {
    rules,
    holidays,
  });
});

/** POST /employee/attendance/clock-in */
const clockIn = asyncHandler(async (req, res) => {
  const today = startOfDay();
  let record = await Attendance.findOne({
    employee: req.user._id,
    date: today,
  });
  if (record?.clockIn) throw new ApiError(400, 'Already clocked in today');

  const rules = rulesDto(await getOrCreateRules());
  const dayOff = await resolveDayOff(today, rules);
  if (dayOff.isOff && !rules.allowOffDayClockIn) {
    throw new ApiError(
      400,
      `Today is off — ${dayOff.label}. Clock-in is not required.`
    );
  }

  const now = new Date();
  const evalIn = evaluateClockIn(now, rules);

  record = await Attendance.findOneAndUpdate(
    { employee: req.user._id, date: today },
    {
      employee: req.user._id,
      date: today,
      clockIn: now,
      clockInLocation: req.body.location,
      status: evalIn.status,
      lateMinutes: evalIn.lateMinutes,
      halfDayPending: evalIn.needsHalfDayApproval,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  let halfDayRequest = null;
  if (evalIn.needsHalfDayApproval) {
    const emp = await Employee.findOne({ user: req.user._id }).select(
      'empId name'
    );
    halfDayRequest = await HalfDayRequest.findOneAndUpdate(
      { employee: req.user._id, date: today },
      {
        employee: req.user._id,
        empId: emp?.empId || req.user.employeeId || '',
        employeeName: emp?.name || req.user.name || '',
        date: today,
        clockIn: now,
        lateMinutes: evalIn.lateMinutes,
        reason: `Auto: clock-in after ${rules.halfDayAfter} (half-day cutoff)`,
        status: 'pending',
        attendance: record._id,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    record.halfDayRequest = halfDayRequest._id;
    await record.save();

    await notifyHr(
      'Half-day approval needed',
      `${req.user.name} clocked in at ${now.toLocaleTimeString()} (after ${rules.halfDayAfter}). Pending half-day approval.`,
      req.user._id
    );
  }

  return success(res, 200, 'Clocked in', {
    attendance: attendanceDto(record),
    evaluation: evalIn,
    rules,
    halfDayRequest: halfDayRequest
      ? {
          id: String(halfDayRequest._id),
          status: halfDayRequest.status,
          lateMinutes: halfDayRequest.lateMinutes,
        }
      : null,
  });
});

/** POST /employee/attendance/clock-out */
const clockOut = asyncHandler(async (req, res) => {
  const today = startOfDay();
  const record = await Attendance.findOne({
    employee: req.user._id,
    date: today,
  });
  if (!record?.clockIn) throw new ApiError(400, 'Clock in first');
  if (record.clockOut) throw new ApiError(400, 'Already clocked out');

  const rules = rulesDto(await getOrCreateRules());
  const now = new Date();
  const evalOut = evaluateClockOut(now, rules);

  record.clockOut = now;
  record.clockOutLocation = req.body.location;
  if (req.body.earlyLeaveReason) {
    record.earlyLeaveReason = req.body.earlyLeaveReason;
  }
  record.workMinutes = Math.round((now - record.clockIn) / (1000 * 60));
  record.overtimeMinutes = evalOut.overtimeMinutes;

  let overtimeRequest = null;
  if (evalOut.needsOvertimeApproval) {
    const hours = Math.round((evalOut.overtimeMinutes / 60) * 100) / 100;
    overtimeRequest = await OvertimeRequest.create({
      employee: req.user._id,
      date: today,
      hours: Math.max(0.25, hours),
      reason: `Auto: clock-out after ${rules.workEnd} (+${evalOut.overtimeMinutes} min)`,
      source: 'auto_clock_out',
      status: 'pending',
    });
    record.overtimeRequest = overtimeRequest._id;

    await notifyHr(
      'Overtime approval needed',
      `${req.user.name} clocked out late — ${hours}h OT pending HR approval.`,
      req.user._id
    );
  }

  await record.save();

  return success(res, 200, 'Clocked out', {
    attendance: attendanceDto(record),
    evaluation: evalOut,
    rules,
    overtimeRequest: overtimeRequest
      ? {
          id: String(overtimeRequest._id),
          hours: overtimeRequest.hours,
          status: overtimeRequest.status,
        }
      : null,
    durationMs: now - record.clockIn,
  });
});

/** GET /employee/attendance — history + today */
const listMyAttendance = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const filter = { employee: req.user._id };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = startOfDay(from);
    if (to) filter.date.$lte = startOfDay(to);
  }
  const records = await Attendance.find(filter).sort({ date: -1 }).limit(90);
  const today = await Attendance.findOne({
    employee: req.user._id,
    date: startOfDay(),
  });
  const rules = rulesDto(await getOrCreateRules());
  const dayOff = await resolveDayOff(new Date(), rules);

  return success(res, 200, 'Attendance fetched', {
    records: records.map((r) => ({
      ...attendanceDto(r),
      status: normalizeStatus(r.status),
    })),
    today: today
      ? {
          ...attendanceDto(today),
          status: normalizeStatus(today.status),
        }
      : null,
    rules,
    dayOff,
    isClocked: Boolean(today?.clockIn && !today?.clockOut),
  });
});

/** GET /hr/attendance/half-day?status=pending */
const listHalfDayHr = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  else filter.status = 'pending';
  const rows = await HalfDayRequest.find(filter)
    .populate('employee', 'name email employeeId')
    .sort({ createdAt: -1 });
  const list = rows.map((d) => {
    const r = d.toObject();
    return {
      id: String(r._id),
      type: 'half_day',
      status: r.status,
      date: r.date ? String(r.date).slice(0, 10) : '',
      clockIn: r.clockIn,
      lateMinutes: r.lateMinutes,
      reason: r.reason,
      employeeName:
        r.employeeName || (r.employee?.name || ''),
      empId: r.empId || r.employee?.employeeId || '',
      createdAt: r.createdAt,
    };
  });
  return success(res, 200, 'Half-day requests fetched', {
    requests: list,
    halfDay: list,
  });
});

/** PATCH /hr/attendance/half-day/:id */
const reviewHalfDayHr = asyncHandler(async (req, res) => {
  const doc = await HalfDayRequest.findById(req.params.id).populate(
    'employee',
    'name email'
  );
  if (!doc) throw new ApiError(404, 'Half-day request not found');
  if (doc.status !== 'pending') throw new ApiError(400, 'Already reviewed');

  const decision = String(
    req.body.decision || req.body.status || ''
  ).toLowerCase();
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ApiError(400, 'decision must be approved or rejected');
  }

  doc.status = decision;
  doc.reviewedBy = req.user._id;
  doc.reviewNote = String(req.body.remarks || req.body.note || '').trim();
  doc.reviewedAt = new Date();
  await doc.save();

  if (doc.attendance) {
    const att = await Attendance.findById(doc.attendance);
    if (att) {
      att.halfDayPending = false;
      if (decision === 'approved') att.status = 'half-day';
      // rejected → keep late
      await att.save();
    }
  }

  if (doc.employee?.email) {
    await notify({
      to: doc.employee.email,
      channel: 'email',
      subject: `Half-day request ${decision}`,
      message: `Your half-day request for ${String(doc.date).slice(0, 10)} was ${decision}.`,
    }).catch(() => null);
  }

  return success(res, 200, `Half-day ${decision}`, {
    request: { id: String(doc._id), status: doc.status },
  });
});

/** GET /hr/attendance/overtime?status=pending */
const listOvertimeHr = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  else filter.status = 'pending';
  const rows = await OvertimeRequest.find(filter)
    .populate('employee', 'name email employeeId')
    .sort({ createdAt: -1 });
  const list = rows.map((d) => {
    const r = d.toObject();
    return {
      id: String(r._id),
      type: 'overtime',
      status: r.status,
      date: r.date ? String(r.date).slice(0, 10) : '',
      hours: r.hours,
      reason: r.reason,
      source: r.source || 'manual',
      employeeName: r.employee?.name || '',
      empId: r.employee?.employeeId || '',
      createdAt: r.createdAt,
    };
  });
  return success(res, 200, 'Overtime requests fetched', {
    overtime: list,
    requests: list,
  });
});

/** PATCH /hr/attendance/overtime/:id */
const reviewOvertimeHr = asyncHandler(async (req, res) => {
  const doc = await OvertimeRequest.findById(req.params.id).populate(
    'employee',
    'name email'
  );
  if (!doc) throw new ApiError(404, 'Overtime request not found');
  if (doc.status !== 'pending') throw new ApiError(400, 'Already reviewed');

  const decision = String(
    req.body.decision || req.body.status || ''
  ).toLowerCase();
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ApiError(400, 'decision must be approved or rejected');
  }

  doc.status = decision;
  doc.reviewedBy = req.user._id;
  doc.reviewNote = String(req.body.remarks || req.body.note || '').trim();
  await doc.save();

  if (doc.employee?.email) {
    await notify({
      to: doc.employee.email,
      channel: 'email',
      subject: `Overtime ${decision}`,
      message: `Your overtime (${doc.hours}h) was ${decision}.`,
    }).catch(() => null);
  }

  return success(res, 200, `Overtime ${decision}`, {
    overtime: { id: String(doc._id), status: doc.status, hours: doc.hours },
  });
});

const normalizeStatus = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'half-day' || s === 'half_day' || s === 'early_leave') return 'half_day';
  if (s === 'on-leave' || s === 'on_leave') return 'paid_leave';
  return s || 'absent';
};

/**
 * GET /hr/attendance — real employees + today's attendance (HR roster)
 */
const listHrRoster = asyncHandler(async (req, res) => {
  const day = startOfDay(req.query.date || new Date());
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);

  const empFilter = { status: { $nin: ['Deleted', 'Inactive'] } };
  if (req.query.department) {
    empFilter.department = new RegExp(String(req.query.department), 'i');
  }
  if (req.query.status) {
    empFilter.status = String(req.query.status);
  }
  if (req.query.search) {
    const q = String(req.query.search).trim();
    empFilter.$or = [
      { name: new RegExp(q, 'i') },
      { email: new RegExp(q, 'i') },
      { empId: new RegExp(q, 'i') },
      { designation: new RegExp(q, 'i') },
    ];
  }

  const employees = await Employee.find(empFilter)
    .sort({ name: 1 })
    .limit(500)
    .lean();

  const userIds = employees.map((e) => e.user).filter(Boolean);

  const [attendanceRows, leaves] = await Promise.all([
    Attendance.find({
      employee: { $in: userIds },
      date: day,
    }).lean(),
    LeaveRequest.find({
      employee: { $in: userIds },
      status: 'approved',
      startDate: { $lte: end },
      endDate: { $gte: day },
    }).lean(),
  ]);

  const attByUser = new Map(
    attendanceRows.map((a) => [String(a.employee), a])
  );
  const leaveByUser = new Map();
  leaves.forEach((l) => {
    leaveByUser.set(String(l.employee), l);
  });

  const rules = rulesDto(await getOrCreateRules());
  const dayOff = await resolveDayOff(day, rules);

  const roster = employees.map((e) => {
    const uid = String(e.user);
    const att = attByUser.get(uid);
    const leave = leaveByUser.get(uid);
    let attendanceStatus = 'absent';
    let leaveType = null;

    if (att?.clockIn) {
      attendanceStatus = normalizeStatus(att.status);
      if (att.halfDayPending && attendanceStatus !== 'half_day') {
        attendanceStatus = 'late';
      }
    } else if (leave) {
      const lt = String(leave.leaveType || '').toLowerCase();
      attendanceStatus =
        lt.includes('unpaid') || lt === 'unpaid' ? 'unpaid_leave' : 'paid_leave';
      leaveType = leave.leaveType;
    } else if (dayOff.isOff) {
      attendanceStatus = dayOff.status; // weekend | holiday
      leaveType = dayOff.label;
    }

    return {
      id: String(e._id),
      userId: uid,
      empId: e.empId,
      name: e.name,
      email: e.email,
      role: e.designation || e.role || 'Employee',
      designation: e.designation || '',
      dept: e.department || '',
      department: e.department || '',
      status: e.status || 'Active',
      initial: (e.name || '?')[0],
      attendanceStatus,
      leaveType,
      clockIn: att?.clockIn || null,
      clockOut: att?.clockOut || null,
      lateMinutes: att?.lateMinutes || 0,
      overtimeMinutes: att?.overtimeMinutes || 0,
      halfDayPending: Boolean(att?.halfDayPending),
      hoursWorked: att?.workMinutes ? +(att.workMinutes / 60).toFixed(2) : 0,
      workMinutes: att?.workMinutes || 0,
      isOnDuty: Boolean(att?.clockIn && !att?.clockOut),
      attendanceId: att?._id ? String(att._id) : null,
      dayOff: dayOff.isOff
        ? { kind: dayOff.kind, label: dayOff.label }
        : null,
    };
  });

  const counts = {
    present: 0,
    late: 0,
    absent: 0,
    half_day: 0,
    paid_leave: 0,
    unpaid_leave: 0,
    holiday: 0,
    weekend: 0,
    wfh: 0,
    came: 0,
    onLeave: 0,
    onDuty: 0,
    off: 0,
  };
  roster.forEach((r) => {
    if (counts[r.attendanceStatus] !== undefined) counts[r.attendanceStatus] += 1;
    if (
      r.attendanceStatus === 'present' ||
      r.attendanceStatus === 'late' ||
      r.attendanceStatus === 'half_day'
    ) {
      counts.came += 1;
    }
    if (
      r.attendanceStatus === 'paid_leave' ||
      r.attendanceStatus === 'unpaid_leave'
    ) {
      counts.onLeave += 1;
    }
    if (
      r.attendanceStatus === 'holiday' ||
      r.attendanceStatus === 'weekend'
    ) {
      counts.off += 1;
    }
    if (r.isOnDuty) counts.onDuty += 1;
  });

  return success(res, 200, 'HR attendance roster fetched', {
    date: day.toISOString().slice(0, 10),
    roster,
    employees: roster,
    counts,
    rules,
    dayOff,
    total: roster.length,
  });
});

/**
 * GET /hr/attendance/employee/:id — history for one employee
 * :id = empId OR Employee Mongo _id OR User _id
 */
const listHrEmployeeAttendance = asyncHandler(async (req, res) => {
  const rawId = String(req.params.id || '').trim();
  let emp = await Employee.findOne({ empId: rawId });
  if (!emp && /^[a-f\d]{24}$/i.test(rawId)) {
    emp = await Employee.findById(rawId);
  }
  if (!emp && /^[a-f\d]{24}$/i.test(rawId)) {
    emp = await Employee.findOne({ user: rawId });
  }
  if (!emp) throw new ApiError(404, 'Employee not found');

  const filter = { employee: emp.user };
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = startOfDay(req.query.from);
    if (req.query.to) filter.date.$lte = startOfDay(req.query.to);
  }

  const records = await Attendance.find(filter).sort({ date: -1 }).limit(180);
  const today = await Attendance.findOne({
    employee: emp.user,
    date: startOfDay(),
  });

  return success(res, 200, 'Employee attendance fetched', {
    employee: {
      id: String(emp._id),
      userId: String(emp.user),
      empId: emp.empId,
      name: emp.name,
      email: emp.email,
      role: emp.designation || emp.role || 'Employee',
      dept: emp.department || '',
      department: emp.department || '',
      initial: (emp.name || '?')[0],
    },
    records: records.map((r) => ({
      ...attendanceDto(r),
      status: normalizeStatus(r.status),
      employeeId: emp.empId,
    })),
    today: today
      ? {
          ...attendanceDto(today),
          status: normalizeStatus(today.status),
          attendanceStatus: normalizeStatus(today.status),
          isOnDuty: Boolean(today.clockIn && !today.clockOut),
        }
      : null,
  });
});

/** GET /hr/attendance/holidays */
const listHolidaysHr = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const from = new Date(year, 0, 1);
  const to = new Date(year, 11, 31);
  const holidays = await listHolidaysNear(from, to);
  return success(res, 200, 'Holidays fetched', { holidays });
});

/** POST /hr/attendance/holidays — { name, date, type? } */
const createHolidayHr = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const dateRaw = req.body.date;
  if (!name) throw new ApiError(400, 'Holiday name is required');
  if (!dateRaw) throw new ApiError(400, 'Holiday date is required');

  const date = startOfDay(dateRaw);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'Invalid holiday date');
  }

  const existing = await findHolidayOn(date);
  if (existing) {
    throw new ApiError(400, `Holiday already exists on ${date.toISOString().slice(0, 10)}`);
  }

  const holiday = await Holiday.create({
    name,
    date,
    type: ['public', 'company'].includes(req.body.type)
      ? req.body.type
      : 'company',
  });

  return success(res, 201, 'Holiday created', {
    holiday: holidayDto(holiday),
  });
});

/** DELETE /hr/attendance/holidays/:id */
const deleteHolidayHr = asyncHandler(async (req, res) => {
  const holiday = await Holiday.findByIdAndDelete(req.params.id);
  if (!holiday) throw new ApiError(404, 'Holiday not found');
  return success(res, 200, 'Holiday deleted', {
    holiday: holidayDto(holiday),
  });
});

export {
  getRules,
  updateRules,
  clockIn,
  clockOut,
  listMyAttendance,
  listHalfDayHr,
  reviewHalfDayHr,
  listOvertimeHr,
  reviewOvertimeHr,
  listHrRoster,
  listHrEmployeeAttendance,
  listHolidaysHr,
  createHolidayHr,
  deleteHolidayHr,
  rulesDto,
  DEFAULTS,
};
