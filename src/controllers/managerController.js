import User from '../models/User.js';
import ManagerEmployeeAssignment from '../models/ManagerEmployeeAssignment.js';
import Task from '../models/Task.js';
import OvertimeRequest from '../models/OvertimeRequest.js';
import { LeaveRequest } from '../models/Leave.js';
import ExpenseClaim from '../models/Expense.js';
import { PerformanceReview } from '../models/Performance.js';
import { Announcement, Message } from '../models/Communication.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES } from '../constants/roles.js';
import { assertTeamMember } from '../middleware/managerAuth.js';
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

const teamEmployeeIds = async (managerId) => {
  const links = await ManagerEmployeeAssignment.find({ manager: managerId }).select(
    'employee'
  );
  return links.map((l) => l.employee);
};

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
  await assertTeamMember(req.user._id, assigneeId);

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
    await assertTeamMember(req.user._id, req.body.assigneeId);
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
    });

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
  await assertTeamMember(req.user._id, employeeId);

  const review = await PerformanceReview.create({
    employee: employeeId,
    manager: req.user._id,
    reviewer: req.user._id,
    period: req.body.period,
    rating: req.body.rating,
    feedback: req.body.feedback,
    managerComments: req.body.feedback || req.body.managerComments,
    kpis: req.body.kpis || [],
    status: 'completed',
  });

  return success(res, 201, 'Review created', { review });
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
  await assertTeamMember(req.user._id, toEmployeeId);

  const message = await Message.create({
    sender: req.user._id,
    recipient: toEmployeeId,
    title: req.body.title,
    body: req.body.body,
    type: 'direct',
  });

  return success(res, 201, 'Message sent', { message });
});

// --- Reports (mockable aggregates) ---
const reportOverview = asyncHandler(async (req, res) => {
  const ids = await teamEmployeeIds(req.user._id);
  const [pendingLeave, pendingOt, pendingExp, openTasks] = await Promise.all([
    LeaveRequest.countDocuments({ manager: req.user._id, status: 'pending' }),
    OvertimeRequest.countDocuments({ manager: req.user._id, status: 'pending' }),
    ExpenseClaim.countDocuments({ manager: req.user._id, status: 'pending' }),
    Task.countDocuments({
      manager: req.user._id,
      isDeleted: false,
      status: { $ne: 'completed' },
    }),
  ]);

  return success(res, 200, 'Overview report', {
    report: {
      teamSize: ids.length,
      pendingApprovals: pendingLeave + pendingOt + pendingExp,
      openTasks,
      presentToday: Math.max(0, ids.length - 1),
    },
  });
});

const reportAttendance = asyncHandler(async (req, res) => {
  const ids = await teamEmployeeIds(req.user._id);
  return success(res, 200, 'Attendance report', {
    report: {
      teamSize: ids.length,
      present: Math.max(0, ids.length - 1),
      absent: Math.min(1, ids.length),
      late: 0,
      note: 'Wire to Attendance collection for live calc',
    },
  });
});

const reportProductivity = asyncHandler(async (req, res) => {
  const completed = await Task.countDocuments({
    manager: req.user._id,
    status: 'completed',
    isDeleted: false,
  });
  const total = await Task.countDocuments({
    manager: req.user._id,
    isDeleted: false,
  });
  return success(res, 200, 'Productivity report', {
    report: {
      tasksCompleted: completed,
      tasksTotal: total,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
    },
  });
});

const reportPerformance = asyncHandler(async (req, res) => {
  const reviews = await PerformanceReview.find({
    $or: [{ manager: req.user._id }, { reviewer: req.user._id }],
  }).select('rating period employee');
  const avg =
    reviews.length === 0
      ? 0
      : reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length;
  return success(res, 200, 'Performance report', {
    report: {
      reviewsCount: reviews.length,
      averageRating: Number(avg.toFixed(2)),
    },
  });
});

// --- Dashboard ---
const dashboard = asyncHandler(async (req, res) => {
  const ids = await teamEmployeeIds(req.user._id);
  const [pendingLeave, pendingOt, pendingExp, openTasks] = await Promise.all([
    LeaveRequest.countDocuments({ manager: req.user._id, status: 'pending' }),
    OvertimeRequest.countDocuments({ manager: req.user._id, status: 'pending' }),
    ExpenseClaim.countDocuments({ manager: req.user._id, status: 'pending' }),
    Task.countDocuments({
      manager: req.user._id,
      isDeleted: false,
      status: { $ne: 'completed' },
    }),
  ]);

  await syncProfileCompletionFromUser(req.user._id);
  const completion = await getOrCreateProfileCompletion(req.user._id);

  return success(res, 200, 'Manager dashboard', {
    dashboard: {
      teamSize: ids.length,
      presentToday: Math.max(0, ids.length - 1),
      pendingApprovals: pendingLeave + pendingOt + pendingExp,
      openTasks,
      profileCompletion: profileCompletionSummary(completion),
      permissions: req.managerProfile.permissions,
    },
  });
});

export {
  getTeam,
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
