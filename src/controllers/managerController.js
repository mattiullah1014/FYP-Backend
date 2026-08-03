import User from '../models/User.js';
import ManagerEmployeeAssignment from '../models/ManagerEmployeeAssignment.js';
import Task from '../models/Task.js';
import OvertimeRequest from '../models/OvertimeRequest.js';
import Attendance from '../models/Attendance.js';
import { LeaveRequest } from '../models/Leave.js';
import ExpenseClaim from '../models/Expense.js';
import { PerformanceReview } from '../models/Performance.js';
import { Announcement, Message } from '../models/Communication.js';
import { WfhRequest } from '../models/AttendanceRequest.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES } from '../constants/roles.js';
import { assertTeamMember } from '../middleware/managerAuth.js';
import { notify } from '../services/notificationService.js';
import {
  notifyApproversOnSubmit,
  notifyRequesterOnDecision,
  notifyHrAdmin,
} from '../utils/approvalNotify.js';
import {
  getOrCreateProfileCompletion,
  profileCompletionSummary,
  syncProfileCompletionFromUser,
} from '../utils/profileCompletion.js';
import {
  listWfhForManager,
  reviewWfhManager,
  listCorrectionsForManager,
  reviewCorrectionManager,
} from './attendanceRequestController.js';
import {
  buildFullEmployeeDto,
  loadManagersForUser,
  resolveEmployee,
  toHrEmployeeDto,
} from '../utils/hrEmployeeHelpers.js';

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

const teamEmployeeIds = async (managerId, { orgWide = false } = {}) => {
  if (orgWide) {
    const users = await User.find({
      role: { $in: [ROLES.EMPLOYEE, ROLES.MANAGER] },
      isDeleted: false,
    }).select('_id');
    return users.map((u) => u._id);
  }
  const links = await ManagerEmployeeAssignment.find({ manager: managerId }).select(
    'employee'
  );
  return links.map((l) => l.employee);
};

/**
 * Live today attendance snapshot for a manager's team (Attendance + Leave + WFH).
 */
const teamAttendanceSnapshot = async (
  managerId,
  forDate = new Date(),
  { orgWide = false } = {}
) => {
  const ids = await teamEmployeeIds(managerId, { orgWide });
  const teamSize = ids.length;
  const day = startOfDay(forDate);
  const end = endOfDay(forDate);
  const dateStr = day.toISOString().slice(0, 10);

  const empty = {
    date: dateStr,
    teamSize,
    present: 0,
    late: 0,
    halfDay: 0,
    wfh: 0,
    onLeave: 0,
    absent: 0,
    presentToday: 0,
    clockedIn: 0,
    stillOnDuty: 0,
  };

  if (!teamSize) return empty;

  const [attendanceRows, leaves, wfhRows] = await Promise.all([
    Attendance.find({ employee: { $in: ids }, date: day }).lean(),
    LeaveRequest.find({
      employee: { $in: ids },
      status: 'approved',
      startDate: { $lte: end },
      endDate: { $gte: day },
    })
      .select('employee')
      .lean(),
    WfhRequest.find({
      employee: { $in: ids },
      status: 'approved',
      date: { $gte: day, $lte: end },
    })
      .select('employee')
      .lean(),
  ]);

  const attByUser = new Map(
    attendanceRows.map((a) => [String(a.employee), a]),
  );
  const leaveSet = new Set(leaves.map((l) => String(l.employee)));
  const wfhSet = new Set(wfhRows.map((w) => String(w.employee)));

  let present = 0;
  let late = 0;
  let halfDay = 0;
  let wfh = 0;
  let onLeave = 0;
  let absent = 0;
  let clockedIn = 0;
  let stillOnDuty = 0;

  for (const id of ids) {
    const uid = String(id);
    const att = attByUser.get(uid);
    const status = String(att?.status || '').toLowerCase();

    if (att?.clockIn) {
      clockedIn += 1;
      if (!att.clockOut) stillOnDuty += 1;

      if (status === 'half-day' || att.halfDayPending) {
        halfDay += 1;
      } else if (status === 'late') {
        late += 1;
      } else if (status === 'wfh') {
        wfh += 1;
      } else if (status === 'on-leave') {
        onLeave += 1;
      } else {
        present += 1;
      }
    } else if (leaveSet.has(uid)) {
      onLeave += 1;
    } else if (wfhSet.has(uid)) {
      wfh += 1;
    } else {
      absent += 1;
    }
  }

  return {
    date: dateStr,
    teamSize,
    present,
    late,
    halfDay,
    wfh,
    onLeave,
    absent,
    // Working / accounted today (not absent / not on leave)
    presentToday: present + late + halfDay + wfh,
    clockedIn,
    stillOnDuty,
  };
};

const countPendingApprovals = async (managerId, { orgWide = false } = {}) => {
  if (orgWide) {
    const [pendingLeave, pendingOt, pendingExp, pendingWfh] = await Promise.all([
      LeaveRequest.countDocuments({ status: 'pending' }),
      OvertimeRequest.countDocuments({ status: 'pending' }),
      ExpenseClaim.countDocuments({ status: 'pending' }),
      WfhRequest.countDocuments({
        status: { $in: ['pending', 'pending_manager', 'pending_hr'] },
      }),
    ]);
    return pendingLeave + pendingOt + pendingExp + pendingWfh;
  }
  const [pendingLeave, pendingOt, pendingExp, pendingWfh] = await Promise.all([
    LeaveRequest.countDocuments({ manager: managerId, status: 'pending' }),
    OvertimeRequest.countDocuments({ manager: managerId, status: 'pending' }),
    ExpenseClaim.countDocuments({ manager: managerId, status: 'pending' }),
    WfhRequest.countDocuments({
      manager: managerId,
      status: { $in: ['pending', 'pending_manager', 'pending_hr'] },
    }),
  ]);
  return pendingLeave + pendingOt + pendingExp + pendingWfh;
};

const isOrgWideAdmin = (req) =>
  Boolean(req.isAdminManagerBypass || req.user?.role === ROLES.ADMIN);

// --- Team ---
const getTeam = asyncHandler(async (req, res) => {
  const links = await ManagerEmployeeAssignment.find({ manager: req.user._id })
    .populate(
      'employee',
      'name email phone designation department employeeId isActive avatar avatarUrl photo'
    )
    .sort({ relationshipType: 1, createdAt: -1 });

  const team = links.map((l) => ({
    assignmentId: l._id,
    relationshipType: l.relationshipType,
    employee: l.employee,
  }));

  return success(res, 200, 'Team fetched', { team, teamSize: team.length });
});

/** GET /manager/team/:employeeId — full profile for a team member (read-only) */
const getTeamMember = asyncHandler(async (req, res) => {
  const employeeId = req.params.employeeId;
  await assertTeamMember(req.user._id, employeeId, {
    isAdmin: req.isAdminManagerBypass,
  });

  const employee = await resolveEmployee(employeeId);
  if (employee) {
    const dto = await buildFullEmployeeDto(employee);
    return success(res, 200, 'Team member fetched', { employee: dto });
  }

  // Fallback when Employee HR record is missing but User exists on team
  const user = await User.findOne({
    _id: employeeId,
    role: ROLES.EMPLOYEE,
    isDeleted: false,
  })
    .populate('department', 'name code')
    .populate('branch', 'name code')
    .populate('manager', 'name email employeeId');

  if (!user) throw new ApiError(404, 'Employee not found');

  const managers = await loadManagersForUser(user._id);
  const dto = toHrEmployeeDto(
    {
      _id: user._id,
      name: user.name,
      empId: user.employeeId,
      email: user.email,
      phone: user.phone,
      designation: user.designation,
      department: user.department?.name || user.department,
      branch: user.branch?.name || user.branch,
      joinedAt: user.dateOfJoining,
      salary: user.salary ?? null,
      address: user.address,
      emergencyContact: Array.isArray(user.emergencyContacts)
        ? user.emergencyContacts[0]
        : undefined,
      bank: user.bank,
      documents: user.documents || [],
      assets: [],
      status: user.isActive === false ? 'Inactive' : 'Active',
      user: user._id,
      role: 'Employee',
    },
    { user, managers },
  );

  return success(res, 200, 'Team member fetched', { employee: dto });
});

const addTeamMember = asyncHandler(async (req, res) => {
  const employeeId = req.body.employeeId;
  const relationshipType = req.body.relationshipType || 'secondary';

  if (!['primary', 'secondary'].includes(relationshipType)) {
    throw new ApiError(400, 'relationshipType must be primary or secondary');
  }

  const employee = await User.findOne({
    _id: employeeId,
    role: ROLES.EMPLOYEE,
    isDeleted: false,
  });
  if (!employee) throw new ApiError(404, 'Employee not found');

  if (relationshipType === 'primary') {
    await ManagerEmployeeAssignment.updateMany(
      { employee: employeeId, relationshipType: 'primary' },
      { relationshipType: 'secondary' }
    );
  }

  const link = await ManagerEmployeeAssignment.findOneAndUpdate(
    { manager: req.user._id, employee: employeeId },
    { relationshipType },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate('employee', 'name email designation employeeId');

  if (relationshipType === 'primary') {
    employee.manager = req.user._id;
    await employee.save();
  }

  return success(res, 201, 'Employee added to team', { assignment: link });
});

const removeTeamMember = asyncHandler(async (req, res) => {
  const removed = await ManagerEmployeeAssignment.findOneAndDelete({
    manager: req.user._id,
    employee: req.params.employeeId,
  });
  if (!removed) throw new ApiError(404, 'Assignment not found');

  const emp = await User.findById(req.params.employeeId);
  if (emp && String(emp.manager) === String(req.user._id)) {
    const nextPrimary = await ManagerEmployeeAssignment.findOne({
      employee: emp._id,
      relationshipType: 'primary',
    });
    emp.manager = nextPrimary?.manager || undefined;
    await emp.save();
  }

  return success(res, 200, 'Employee removed from team');
});

const availableEmployees = asyncHandler(async (req, res) => {
  const onTeam = await teamEmployeeIds(req.user._id);
  const employees = await User.find({
    role: ROLES.EMPLOYEE,
    isDeleted: false,
    isActive: true,
    _id: { $nin: onTeam },
  })
    .select('name email designation department employeeId')
    .sort({ name: 1 });

  return success(res, 200, 'Available employees fetched', { employees });
});

// --- Tasks ---
const listTasks = asyncHandler(async (req, res) => {
  const filter = { manager: req.user._id, isDeleted: false };
  if (req.query.status) filter.status = req.query.status;

  const tasks = await Task.find(filter)
    .populate('assignee', 'name email employeeId')
    .sort({ deadline: 1, createdAt: -1 });

  return success(res, 200, 'Tasks fetched', { tasks });
});

const createTask = asyncHandler(async (req, res) => {
  const assigneeId = req.body.assigneeId || req.body.assignee;
  await assertTeamMember(req.user._id, assigneeId, {
    isAdmin: req.isAdminManagerBypass,
  });

  const task = await Task.create({
    title: req.body.title,
    description: req.body.description,
    assignee: assigneeId,
    manager: req.user._id,
    deadline: req.body.deadline,
    priority: req.body.priority || 'medium',
    status: 'pending',
  });

  await Message.create({
    sender: req.user._id,
    recipient: assigneeId,
    title: 'New task assigned',
    body: `Task: ${task.title}`,
    type: 'task',
  });

  return success(res, 201, 'Task created', { task });
});

const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findOne({
    _id: req.params.id,
    manager: req.user._id,
    isDeleted: false,
  });
  if (!task) throw new ApiError(404, 'Task not found');

  ['title', 'description', 'deadline', 'priority', 'status'].forEach((k) => {
    if (req.body[k] !== undefined) task[k] = req.body[k];
  });
  if (req.body.assigneeId) {
    await assertTeamMember(req.user._id, req.body.assigneeId, {
      isAdmin: req.isAdminManagerBypass,
    });
    task.assignee = req.body.assigneeId;
  }
  await task.save();
  return success(res, 200, 'Task updated', { task });
});

const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, manager: req.user._id },
    { isDeleted: true },
    { new: true }
  );
  if (!task) throw new ApiError(404, 'Task not found');
  return success(res, 200, 'Task deleted');
});

// --- Approvals ---
const listApprovals = asyncHandler(async (req, res) => {
  const type = req.query.type; // leave|wfh|correction
  const status = req.query.status || 'pending';
  const managerId = req.user._id;
  const teamIds = await teamEmployeeIds(managerId);
  const result = { leave: [], wfh: [], correction: [] };

  if (!type || type === 'leave') {
    result.leave = await LeaveRequest.find({
      $or: [
        { manager: managerId },
        { employee: { $in: teamIds } },
      ],
      status: status === 'pending' ? 'pending' : status,
    })
      .populate('employee', 'name email employeeId')
      .sort({ createdAt: -1 });
  }
  if (!type || type === 'wfh') {
    result.wfh = await listWfhForManager(managerId);
    // Also include team WFH with no manager set
    if (teamIds.length) {
      const { WfhRequest } = await import('../models/AttendanceRequest.js');
      const extra = await WfhRequest.find({
        employee: { $in: teamIds },
        status: { $in: ['pending', 'pending_manager', 'pending_hr'] },
      })
        .populate('employee', 'name email employeeId')
        .sort({ createdAt: -1 });
      const seen = new Set(result.wfh.map((w) => w.id));
      for (const row of extra) {
        const dto = {
          id: String(row._id),
          type: 'wfh',
          date: row.date ? String(row.date).slice(0, 10) : '',
          reason: row.reason || '',
          status: row.status,
          empId: row.empId || row.employee?.employeeId || '',
          employeeName: row.employeeName || row.employee?.name || '',
          employeeId: String(row.employee?._id || row.employee || ''),
        };
        if (!seen.has(dto.id)) {
          seen.add(dto.id);
          result.wfh.push(dto);
        }
      }
    }
  }
  if (!type || type === 'correction') {
    result.correction = await listCorrectionsForManager(teamIds);
  }

  return success(res, 200, 'Approvals fetched', { approvals: result });
});

const reviewApproval = asyncHandler(async (req, res) => {
  const { type, id } = req.params;
  const status = req.body.status;
  if (!['approved', 'rejected'].includes(status)) {
    throw new ApiError(400, 'status must be approved or rejected');
  }

  if (type === 'leave') {
    const leave = await LeaveRequest.findById(id).populate('employee');
    if (!leave) throw new ApiError(404, 'Leave request not found');
    if (leave.status !== 'pending') throw new ApiError(400, 'Already reviewed');

    const teamIds = await teamEmployeeIds(req.user._id);
    const empId = String(leave.employee?._id || leave.employee);
    const allowed =
      String(leave.manager || '') === String(req.user._id) ||
      teamIds.some((t) => String(t) === empId);
    if (!allowed) throw new ApiError(403, 'Not your team member');

    leave.managerStatus = status;
    leave.status = status;
    leave.hrStatus = 'not-required';
    leave.reviewedBy = req.user._id;
    leave.reviewNote = req.body.note || '';
    await leave.save();

    await Message.create({
      sender: req.user._id,
      recipient: leave.employee._id || leave.employee,
      title: `leave ${status}`,
      body: req.body.note || `Your leave request was ${status}`,
      type: 'approval',
    }).catch(() => null);

    await notifyRequesterOnDecision({
      to: leave.employee?.email,
      userId: leave.employee?._id || leave.employee,
      title: `Leave request ${status}`,
      message: `Your leave request was ${status}.${
        req.body.note ? ` Remarks: ${req.body.note}` : ''
      }`,
      decision: status,
    }).catch(() => null);

    return success(res, 200, `leave ${status}`, { item: leave });
  }

  if (type === 'wfh') {
    req.params.id = id;
    req.body.decision = status;
    req.body.remarks = req.body.note;
    return reviewWfhManager(req, res);
  }

  if (type === 'correction') {
    const teamIds = await teamEmployeeIds(req.user._id);
    const { AttendanceCorrection } = await import(
      '../models/AttendanceRequest.js'
    );
    const doc = await AttendanceCorrection.findById(id);
    if (!doc) throw new ApiError(404, 'Correction not found');
    if (!teamIds.some((t) => String(t) === String(doc.employee))) {
      throw new ApiError(403, 'Not your team member');
    }
    req.params.id = id;
    req.body.decision = status;
    req.body.remarks = req.body.note;
    return reviewCorrectionManager(req, res);
  }

  throw new ApiError(
    400,
    'type must be leave, wfh, or correction (Manager Approval Center)',
  );
});

// --- Performance ---
const listReviews = asyncHandler(async (req, res) => {
  const reviews = await PerformanceReview.find({
    $or: [{ manager: req.user._id }, { reviewer: req.user._id }],
  })
    .populate('employee', 'name email employeeId')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Reviews fetched', { reviews });
});

const createReview = asyncHandler(async (req, res) => {
  const employeeId = req.body.employeeId || req.body.employee;
  await assertTeamMember(req.user._id, employeeId, {
    isAdmin: req.isAdminManagerBypass,
  });

  const period = String(req.body.period || '').trim();
  if (!period) throw new ApiError(400, 'period is required');

  const rating = Number(req.body.rating);
  if (!rating || rating < 1 || rating > 5) {
    throw new ApiError(400, 'rating must be between 1 and 5');
  }

  const feedback = String(req.body.feedback || req.body.managerComments || '').trim();
  if (feedback.length < 10) {
    throw new ApiError(400, 'feedback must be at least 10 characters');
  }

  const review = await PerformanceReview.create({
    employee: employeeId,
    manager: req.user._id,
    reviewer: req.user._id,
    period,
    rating,
    feedback,
    managerComments: feedback,
    kpis: Array.isArray(req.body.kpis) ? req.body.kpis : [],
    // Manager done → waiting for HR/Admin final review
    status: 'pending_hr',
  });

  const populated = await PerformanceReview.findById(review._id)
    .populate('employee', 'name email employeeId')
    .populate('manager', 'name email');

  const empEmail = populated?.employee?.email;
  if (empEmail) {
    await notify({
      to: empEmail,
      userId: populated?.employee?._id,
      channel: 'email',
      subject: `Performance review — ${period}`,
      message: `New performance review for ${period}: ${rating}/5 from your manager (pending HR finalization).`,
      type: 'info',
    });
  }

  await notifyHrAdmin({
    senderId: req.user._id,
    title: 'Performance review pending HR',
    message: `${populated?.employee?.name || 'Employee'} — ${period} review (${rating}/5) awaits HR finalization by ${req.user.name}.`,
    type: 'info',
  });

  return success(res, 201, 'Review created', { review: populated });
});

const getAppraisal = asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findOne({
    _id: req.params.id,
    $or: [{ manager: req.user._id }, { reviewer: req.user._id }],
  }).populate('employee', 'name email designation employeeId department');

  if (!review) throw new ApiError(404, 'Review not found');

  return success(res, 200, 'Appraisal payload', {
    appraisal: {
      review,
      generatedAt: new Date(),
      note: 'PDF export can be wired later',
    },
  });
});

// --- Communication ---
const createAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.create({
    title: req.body.title,
    body: req.body.body,
    audience: 'team',
    manager: req.user._id,
    createdBy: req.user._id,
  });

  const ids = await teamEmployeeIds(req.user._id);
  if (ids.length) {
    await Message.insertMany(
      ids.map((to) => ({
        sender: req.user._id,
        recipient: to,
        title: announcement.title,
        body: announcement.body,
        type: 'announcement',
      }))
    );
  }

  return success(res, 201, 'Announcement posted', { announcement });
});

const listAnnouncements = asyncHandler(async (req, res) => {
  const announcements = await Announcement.find({ manager: req.user._id }).sort({
    createdAt: -1,
  });
  return success(res, 200, 'Announcements fetched', { announcements });
});

const sendMessage = asyncHandler(async (req, res) => {
  const toEmployeeId = req.body.toEmployeeId || req.body.recipientId;
  await assertTeamMember(req.user._id, toEmployeeId, {
    isAdmin: req.isAdminManagerBypass,
  });

  const message = await Message.create({
    sender: req.user._id,
    recipient: toEmployeeId,
    title: req.body.title,
    body: req.body.body,
    type: 'direct',
  });

  return success(res, 201, 'Message sent', { message });
});

// --- Reports (live aggregates from team data) ---
const reportOverview = asyncHandler(async (req, res) => {
  const orgWide = isOrgWideAdmin(req);
  const taskFilter = orgWide
    ? { isDeleted: false }
    : { manager: req.user._id, isDeleted: false };
  const [att, pendingApprovals, openTasks, tasksTotal] = await Promise.all([
    teamAttendanceSnapshot(req.user._id, new Date(), { orgWide }),
    countPendingApprovals(req.user._id, { orgWide }),
    Task.countDocuments({ ...taskFilter, status: { $ne: 'completed' } }),
    Task.countDocuments(taskFilter),
  ]);

  return success(res, 200, 'Overview report', {
    report: {
      date: att.date,
      teamSize: att.teamSize,
      pendingApprovals,
      openTasks,
      tasksTotal,
      presentToday: att.presentToday,
      absentToday: att.absent,
      onLeaveToday: att.onLeave,
      lateToday: att.late,
    },
  });
});

const reportAttendance = asyncHandler(async (req, res) => {
  const orgWide = isOrgWideAdmin(req);
  const day = req.query.date ? new Date(req.query.date) : new Date();
  const att = await teamAttendanceSnapshot(req.user._id, day, { orgWide });
  const attendanceRate = att.teamSize
    ? Math.round((att.presentToday / att.teamSize) * 100)
    : 0;

  return success(res, 200, 'Attendance report', {
    report: {
      date: att.date,
      teamSize: att.teamSize,
      present: att.present,
      late: att.late,
      halfDay: att.halfDay,
      wfh: att.wfh,
      onLeave: att.onLeave,
      absent: att.absent,
      presentToday: att.presentToday,
      clockedIn: att.clockedIn,
      stillOnDuty: att.stillOnDuty,
      attendanceRate,
    },
  });
});

const reportProductivity = asyncHandler(async (req, res) => {
  const orgWide = isOrgWideAdmin(req);
  const base = orgWide
    ? { isDeleted: false }
    : { manager: req.user._id, isDeleted: false };
  const [completed, inProgress, pending, total] = await Promise.all([
    Task.countDocuments({ ...base, status: 'completed' }),
    Task.countDocuments({ ...base, status: 'in_progress' }),
    Task.countDocuments({ ...base, status: 'pending' }),
    Task.countDocuments(base),
  ]);
  return success(res, 200, 'Productivity report', {
    report: {
      tasksCompleted: completed,
      tasksInProgress: inProgress,
      tasksPending: pending,
      tasksTotal: total,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
    },
  });
});

const reportPerformance = asyncHandler(async (req, res) => {
  const orgWide = isOrgWideAdmin(req);
  const filter = orgWide
    ? {}
    : { $or: [{ manager: req.user._id }, { reviewer: req.user._id }] };
  const reviews = await PerformanceReview.find(filter).select(
    'rating period employee'
  );
  const rated = reviews.filter((r) => typeof r.rating === 'number' && r.rating > 0);
  const avg =
    rated.length === 0
      ? 0
      : rated.reduce((s, r) => s + (r.rating || 0), 0) / rated.length;
  return success(res, 200, 'Performance report', {
    report: {
      reviewsCount: reviews.length,
      ratedCount: rated.length,
      averageRating: Number(avg.toFixed(2)),
    },
  });
});

// --- Dashboard ---
const dashboard = asyncHandler(async (req, res) => {
  const orgWide = isOrgWideAdmin(req);
  const taskFilter = orgWide
    ? { isDeleted: false, status: { $ne: 'completed' } }
    : { manager: req.user._id, isDeleted: false, status: { $ne: 'completed' } };
  const [att, pendingApprovals, openTasks] = await Promise.all([
    teamAttendanceSnapshot(req.user._id, new Date(), { orgWide }),
    countPendingApprovals(req.user._id, { orgWide }),
    Task.countDocuments(taskFilter),
  ]);

  await syncProfileCompletionFromUser(req.user._id);
  const completion = await getOrCreateProfileCompletion(req.user._id);

  return success(res, 200, 'Manager dashboard', {
    dashboard: {
      teamSize: att.teamSize,
      presentToday: att.presentToday,
      absentToday: att.absent,
      lateToday: att.late,
      onLeaveToday: att.onLeave,
      pendingApprovals,
      openTasks,
      profileCompletion: profileCompletionSummary(completion),
      permissions: req.managerProfile.permissions,
      attendanceDate: att.date,
    },
  });
});
export {
  getTeam,
  getTeamMember,
  addTeamMember,
  removeTeamMember,
  availableEmployees,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  listApprovals,
  reviewApproval,
  listReviews,
  createReview,
  getAppraisal,
  createAnnouncement,
  listAnnouncements,
  sendMessage,
  reportOverview,
  reportAttendance,
  reportProductivity,
  reportPerformance,
  dashboard,
};
