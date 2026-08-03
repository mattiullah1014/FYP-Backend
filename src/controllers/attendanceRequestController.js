import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import ManagerEmployeeAssignment from '../models/ManagerEmployeeAssignment.js';
import {
  AttendanceCorrection,
  WfhRequest,
} from '../models/AttendanceRequest.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import {
  notifyApproversOnSubmit,
  notifyRequesterOnDecision,
} from '../utils/approvalNotify.js';

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const dateOnly = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
};

const combineDateTime = (dateValue, timeStr) => {
  if (!timeStr || !String(timeStr).trim()) return null;
  const raw = String(timeStr).trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new ApiError(400, 'Time must be HH:mm (e.g. 09:05)');
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new ApiError(400, 'Invalid time');
  const d = startOfDay(dateValue);
  d.setHours(h, min, 0, 0);
  return d;
};

const resolveSelfMeta = async (user) => {
  const employee = await Employee.findOne({ user: user._id }).select(
    'empId name'
  );
  return {
    empId: employee?.empId || user.employeeId || '',
    employeeName: employee?.name || user.name || '',
  };
};

const resolveManagerId = async (userId) => {
  const primary = await ManagerEmployeeAssignment.findOne({
    employee: userId,
    relationshipType: 'primary',
  }).select('manager');
  if (primary?.manager) return primary.manager;

  const any = await ManagerEmployeeAssignment.findOne({
    employee: userId,
  }).select('manager');
  if (any?.manager) return any.manager;

  const user = await User.findById(userId).select('manager');
  return user?.manager || null;
};

const correctionDto = (doc) => {
  const r = doc?.toObject ? doc.toObject() : doc;
  const emp = r.employee;
  return {
    id: String(r._id),
    type: 'correction',
    date: dateOnly(r.date),
    requestedClockIn: r.requestedClockIn || '',
    requestedClockOut: r.requestedClockOut || '',
    reason: r.reason || '',
    status: r.status,
    empId: r.empId || (emp?.employeeId || ''),
    employeeName:
      r.employeeName || (emp && typeof emp === 'object' ? emp.name : '') || '',
    employeeId:
      emp && typeof emp === 'object' ? String(emp._id) : String(r.employee || ''),
    reviewNote: r.reviewNote || '',
    reviewedAt: r.reviewedAt || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
};

const wfhDto = (doc) => {
  const r = doc?.toObject ? doc.toObject() : doc;
  const emp = r.employee;
  return {
    id: String(r._id),
    type: 'wfh',
    date: dateOnly(r.date),
    reason: r.reason || '',
    status: r.status,
    empId: r.empId || (emp?.employeeId || ''),
    employeeName:
      r.employeeName || (emp && typeof emp === 'object' ? emp.name : '') || '',
    employeeId:
      emp && typeof emp === 'object' ? String(emp._id) : String(r.employee || ''),
    managerId: r.manager ? String(r.manager._id || r.manager) : null,
    managerNote: r.managerNote || '',
    reviewNote: r.reviewNote || '',
    reviewedAt: r.reviewedAt || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
};

const applyCorrectionToAttendance = async (correction, reviewerId) => {
  const day = startOfDay(correction.date);
  const clockIn = combineDateTime(day, correction.requestedClockIn);
  const clockOut = combineDateTime(day, correction.requestedClockOut);

  let record = await Attendance.findOne({
    employee: correction.employee,
    date: day,
  });

  if (!record) {
    record = new Attendance({
      employee: correction.employee,
      date: day,
      status: 'present',
    });
  }

  if (clockIn) record.clockIn = clockIn;
  if (clockOut) record.clockOut = clockOut;
  if (record.clockIn && record.clockOut) {
    record.workMinutes = Math.round(
      (new Date(record.clockOut) - new Date(record.clockIn)) / 60000
    );
  }
  if (!record.status || record.status === 'absent') record.status = 'present';
  record.adjustmentNote = `Correction approved: ${correction.reason}`;
  record.adjustedBy = reviewerId;
  await record.save();
  return record;
};

const applyWfhToAttendance = async (wfh, reviewerId) => {
  const day = startOfDay(wfh.date);
  let record = await Attendance.findOne({
    employee: wfh.employee,
    date: day,
  });
  if (!record) {
    record = new Attendance({
      employee: wfh.employee,
      date: day,
    });
  }
  record.status = 'wfh';
  record.adjustmentNote = `WFH approved: ${wfh.reason}`;
  record.adjustedBy = reviewerId;
  if (!record.clockIn) {
    const cin = startOfDay(day);
    cin.setHours(9, 0, 0, 0);
    record.clockIn = cin;
  }
  await record.save();
  return record;
};

/** POST /employee/attendance/corrections */
const createCorrection = asyncHandler(async (req, res) => {
  const dateRaw = req.body.date;
  if (!dateRaw) throw new ApiError(400, 'date is required (YYYY-MM-DD)');
  const day = startOfDay(dateRaw);
  if (Number.isNaN(day.getTime())) {
    throw new ApiError(400, 'date must be a valid date');
  }
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new ApiError(400, 'reason is required');

  const clockIn = req.body.requestedClockIn || req.body.clockIn || '';
  const clockOut = req.body.requestedClockOut || req.body.clockOut || '';
  if (clockIn) combineDateTime(day, clockIn);
  if (clockOut) combineDateTime(day, clockOut);

  const meta = await resolveSelfMeta(req.user);
  const doc = await AttendanceCorrection.create({
    employee: req.user._id,
    empId: meta.empId,
    employeeName: meta.employeeName,
    date: day,
    requestedClockIn: clockIn ? String(clockIn).trim() : '',
    requestedClockOut: clockOut ? String(clockOut).trim() : '',
    reason,
    status: 'pending',
  });

  await notifyApproversOnSubmit({
    employeeId: req.user._id,
    senderId: req.user._id,
    title: 'Attendance correction request',
    message: `${meta.employeeName || req.user.name} requested attendance correction for ${dateOnly(day)}. Reason: ${reason}`,
    includeManagers: true,
    includeHrAdmin: true,
  });

  return success(res, 201, 'Correction submitted', {
    correction: correctionDto(doc),
  });
});

/** GET /employee/attendance/corrections */
const listMyCorrections = asyncHandler(async (req, res) => {
  const filter = { employee: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const rows = await AttendanceCorrection.find(filter).sort({ createdAt: -1 });
  return success(res, 200, 'Corrections fetched', {
    corrections: rows.map(correctionDto),
  });
});

/** POST /employee/attendance/wfh */
const createWfh = asyncHandler(async (req, res) => {
  const dateRaw = req.body.date;
  if (!dateRaw) throw new ApiError(400, 'date is required (YYYY-MM-DD)');
  const day = startOfDay(dateRaw);
  if (Number.isNaN(day.getTime())) {
    throw new ApiError(400, 'date must be a valid date');
  }
  const reason = String(req.body.reason || '').trim();
  if (!reason) throw new ApiError(400, 'reason is required');

  const meta = await resolveSelfMeta(req.user);
  const managerId = req.body.managerId || (await resolveManagerId(req.user._id));

  const doc = await WfhRequest.create({
    employee: req.user._id,
    manager: managerId || undefined,
    empId: meta.empId,
    employeeName: meta.employeeName,
    date: day,
    reason,
    // Open for Manager OR HR — either can approve/reject
    status: 'pending',
  });

  await notifyApproversOnSubmit({
    employeeId: req.user._id,
    senderId: req.user._id,
    title: 'WFH request',
    message: `${meta.employeeName || req.user.name} requested WFH for ${dateOnly(day)}. Reason: ${reason}`,
    includeManagers: true,
    includeHrAdmin: true,
  });

  return success(res, 201, 'WFH request submitted', { wfh: wfhDto(doc) });
});

/** GET /employee/attendance/wfh */
const listMyWfh = asyncHandler(async (req, res) => {
  const filter = { employee: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const rows = await WfhRequest.find(filter).sort({ createdAt: -1 });
  return success(res, 200, 'WFH requests fetched', {
    wfh: rows.map(wfhDto),
    requests: rows.map(wfhDto),
  });
});

/** GET /hr/attendance/corrections */
const listCorrectionsHr = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const rows = await AttendanceCorrection.find(filter)
    .populate('employee', 'name email employeeId')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Corrections fetched', {
    corrections: rows.map(correctionDto),
  });
});

/** PATCH /hr/attendance/corrections/:id */
const reviewCorrectionHr = asyncHandler(async (req, res) => {
  const doc = await AttendanceCorrection.findById(req.params.id).populate(
    'employee',
    'name email'
  );
  if (!doc) throw new ApiError(404, 'Correction not found');
  if (doc.status !== 'pending') {
    throw new ApiError(400, 'Already reviewed');
  }

  const decision = String(
    req.body.decision || req.body.status || ''
  ).toLowerCase();
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ApiError(400, 'decision/status must be approved or rejected');
  }

  doc.status = decision;
  doc.reviewedBy = req.user._id;
  doc.reviewNote = String(req.body.remarks || req.body.note || '').trim();
  doc.reviewedAt = new Date();
  await doc.save();

  if (decision === 'approved') {
    await applyCorrectionToAttendance(doc, req.user._id);
  }

  const email = doc.employee?.email;
  if (email) {
    await notifyRequesterOnDecision({
      to: email,
      userId: doc.employee?._id || doc.employee,
      title: `Attendance correction ${decision}`,
      message: `Your attendance correction for ${dateOnly(doc.date)} was ${decision}.${
        doc.reviewNote ? ` Remarks: ${doc.reviewNote}` : ''
      }`,
      decision,
    }).catch(() => null);
  }

  return success(res, 200, `Correction ${decision}`, {
    correction: correctionDto(doc),
  });
});

const OPEN_WFH = ['pending', 'pending_manager', 'pending_hr'];

/** GET /hr/attendance/wfh — all open WFH (Manager or HR can act) */
const listWfhHr = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  } else {
    filter.status = { $in: OPEN_WFH };
  }
  const rows = await WfhRequest.find(filter)
    .populate('employee', 'name email employeeId')
    .sort({ createdAt: -1 });
  return success(res, 200, 'WFH requests fetched', {
    wfh: rows.map(wfhDto),
    requests: rows.map(wfhDto),
  });
});

/** PATCH /hr/attendance/wfh/:id — HR final approve/reject */
const reviewWfhHr = asyncHandler(async (req, res) => {
  const doc = await WfhRequest.findById(req.params.id).populate(
    'employee',
    'name email'
  );
  if (!doc) throw new ApiError(404, 'WFH request not found');
  if (!OPEN_WFH.includes(doc.status)) {
    throw new ApiError(400, 'Already reviewed');
  }

  const decision = String(
    req.body.decision || req.body.status || ''
  ).toLowerCase();
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ApiError(400, 'decision/status must be approved or rejected');
  }

  doc.status = decision;
  doc.reviewedBy = req.user._id;
  doc.reviewNote = String(req.body.remarks || req.body.note || '').trim();
  doc.reviewedAt = new Date();
  await doc.save();

  if (decision === 'approved') {
    await applyWfhToAttendance(doc, req.user._id);
  }

  const email = doc.employee?.email;
  if (email) {
    await notifyRequesterOnDecision({
      to: email,
      userId: doc.employee?._id || doc.employee,
      title: `WFH request ${decision}`,
      message: `Your WFH request for ${dateOnly(doc.date)} was ${decision} by HR.${
        doc.reviewNote ? ` Remarks: ${doc.reviewNote}` : ''
      }`,
      decision,
    }).catch(() => null);
  }

  return success(res, 200, `WFH ${decision}`, { wfh: wfhDto(doc) });
});

/** Manager list — open WFH for team */
const listWfhForManager = async (managerId) => {
  const rows = await WfhRequest.find({
    $or: [{ manager: managerId }, { manager: { $exists: false } }, { manager: null }],
    status: { $in: OPEN_WFH },
  })
    .populate('employee', 'name email employeeId')
    .sort({ createdAt: -1 });

  // Prefer rows assigned to this manager; also include unassigned team via assignment check outside
  return rows
    .filter((r) => !r.manager || String(r.manager) === String(managerId))
    .map(wfhDto);
};

/** Manager final approve/reject WFH (same power as HR) */
const reviewWfhManager = asyncHandler(async (req, res) => {
  const doc = await WfhRequest.findById(req.params.id).populate(
    'employee',
    'name email'
  );
  if (!doc) throw new ApiError(404, 'WFH request not found');
  if (!OPEN_WFH.includes(doc.status)) {
    throw new ApiError(400, 'Already reviewed');
  }
  if (doc.manager && String(doc.manager) !== String(req.user._id)) {
    throw new ApiError(403, 'Not assigned to you');
  }

  const decision = String(
    req.body.decision || req.body.status || ''
  ).toLowerCase();
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ApiError(400, 'status must be approved or rejected');
  }

  doc.managerReviewedBy = req.user._id;
  doc.managerNote = String(req.body.remarks || req.body.note || '').trim();
  doc.reviewedBy = req.user._id;
  doc.reviewNote = doc.managerNote;
  doc.status = decision;
  doc.reviewedAt = new Date();
  await doc.save();

  if (decision === 'approved') {
    await applyWfhToAttendance(doc, req.user._id);
  }

  const email = doc.employee?.email;
  if (email) {
    await notifyRequesterOnDecision({
      to: email,
      userId: doc.employee?._id || doc.employee,
      title: `WFH request ${decision}`,
      message: `Your WFH for ${dateOnly(doc.date)} was ${decision} by your manager.${
        doc.reviewNote ? ` Remarks: ${doc.reviewNote}` : ''
      }`,
      decision,
    }).catch(() => null);
  }

  return success(res, 200, `WFH ${decision}`, { wfh: wfhDto(doc) });
});

/** Manager list — pending corrections for team employee ids */
const listCorrectionsForManager = async (employeeIds = []) => {
  if (!employeeIds.length) return [];
  const rows = await AttendanceCorrection.find({
    employee: { $in: employeeIds },
    status: 'pending',
  })
    .populate('employee', 'name email employeeId')
    .sort({ createdAt: -1 });
  return rows.map(correctionDto);
};

/** Manager review correction (same as HR) */
const reviewCorrectionManager = asyncHandler(async (req, res) => {
  const doc = await AttendanceCorrection.findById(req.params.id).populate(
    'employee',
    'name email'
  );
  if (!doc) throw new ApiError(404, 'Correction not found');
  if (doc.status !== 'pending') throw new ApiError(400, 'Already reviewed');

  // Team check done by caller / manager middleware via assignment
  const decision = String(
    req.body.decision || req.body.status || ''
  ).toLowerCase();
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ApiError(400, 'status must be approved or rejected');
  }

  doc.status = decision;
  doc.reviewedBy = req.user._id;
  doc.reviewNote = String(req.body.remarks || req.body.note || '').trim();
  doc.reviewedAt = new Date();
  await doc.save();

  if (decision === 'approved') {
    await applyCorrectionToAttendance(doc, req.user._id);
  }

  const email = doc.employee?.email;
  if (email) {
    await notifyRequesterOnDecision({
      to: email,
      userId: doc.employee?._id || doc.employee,
      title: `Attendance correction ${decision}`,
      message: `Your attendance correction for ${dateOnly(doc.date)} was ${decision} by manager.${
        doc.reviewNote ? ` Remarks: ${doc.reviewNote}` : ''
      }`,
      decision,
    }).catch(() => null);
  }

  return success(res, 200, `Correction ${decision}`, {
    correction: correctionDto(doc),
  });
});

export {
  createCorrection,
  listMyCorrections,
  createWfh,
  listMyWfh,
  listCorrectionsHr,
  reviewCorrectionHr,
  listWfhHr,
  reviewWfhHr,
  listWfhForManager,
  reviewWfhManager,
  listCorrectionsForManager,
  reviewCorrectionManager,
  correctionDto,
  wfhDto,
};
