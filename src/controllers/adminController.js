import User from '../models/User.js';
import { SystemSetting, AuditLog } from '../models/Admin.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import Attendance from '../models/Attendance.js';
import { LeaveRequest } from '../models/Leave.js';
import ExpenseClaim from '../models/Expense.js';
import OvertimeRequest from '../models/OvertimeRequest.js';
import { WfhRequest } from '../models/AttendanceRequest.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { logAudit } from '../services/auditService.js';
import { ALL_ROLES, ROLES } from '../constants/roles.js';
import { countPending as countPendingLoanAdvance } from './loanAdvanceController.js';
import { generateEmployeeId } from './employeeController.js';

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const buildUserList = async (req) => {
  const filter = {};
  if (req.query.role) filter.role = String(req.query.role).toLowerCase();
  if (req.query.includeDeleted !== 'true') filter.isDeleted = false;

  if (req.query.search) {
    const q = String(req.query.search).trim();
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { employeeId: { $regex: q, $options: 'i' } },
    ];
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
};

const applyUserUpdates = async (user, body) => {
  const allowed = [
    'name',
    'email',
    'phone',
    'designation',
    'department',
    'isActive',
  ];
  for (const key of allowed) {
    if (body[key] !== undefined) user[key] = body[key];
  }
  if (body.password && String(body.password).length >= 6) {
    user.password = body.password;
  }
  await user.save();
  return user;
};

const listUsers = asyncHandler(async (req, res) => {
  const data = await buildUserList(req);
  return success(res, 200, 'Users fetched', data);
});

const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user || (user.isDeleted && req.query.includeDeleted !== 'true')) {
    throw new ApiError(404, 'User not found');
  }

  let applications = [];
  if (user.role === ROLES.CANDIDATE) {
    applications = await Application.find({ candidate: user._id })
      .populate('job', 'title department status')
      .sort({ createdAt: -1 })
      .limit(20);
  }

  return success(res, 200, 'User fetched', { user, applications });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  await applyUserUpdates(user, req.body);
  await logAudit({
    actor: req.user._id,
    action: 'admin.updateUser',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });

  return success(res, 200, 'User updated', { user: user.toSafeObject() });
});

const setUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  user.isActive = Boolean(req.body.isActive);
  if (user.isActive) {
    user.isDeleted = false;
    user.deletedAt = undefined;
  }
  await user.save();
  await logAudit({
    actor: req.user._id,
    action: user.isActive ? 'admin.activateUser' : 'admin.suspendUser',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });
  return success(res, 200, 'User status updated', {
    user: user.toSafeObject(),
  });
});

/** Soft-delete / deactivate any user across roles */
const softDeleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');
  if (String(user._id) === String(req.user._id)) {
    throw new ApiError(400, 'Cannot deactivate your own account');
  }
  if (user.role === ROLES.ADMIN) {
    const otherAdmins = await User.countDocuments({
      role: ROLES.ADMIN,
      isDeleted: false,
      isActive: true,
      _id: { $ne: user._id },
    });
    if (otherAdmins < 1) {
      throw new ApiError(400, 'Cannot deactivate the last active admin');
    }
  }

  user.isActive = false;
  user.isDeleted = true;
  user.deletedAt = new Date();
  await user.save();

  await logAudit({
    actor: req.user._id,
    action: 'admin.softDeleteUser',
    resource: 'User',
    resourceId: user._id,
    meta: { role: user.role },
    ip: req.ip,
  });

  return success(res, 200, 'User deactivated', { user: user.toSafeObject() });
});

const forcePasswordResetFlag = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  await logAudit({
    actor: req.user._id,
    action: 'admin.forcePasswordReset',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });
  return success(
    res,
    200,
    'Force password reset flagged — user should use forgot-password flow'
  );
});

const updateRole = asyncHandler(async (req, res) => {
  if (!ALL_ROLES.includes(req.body.role)) {
    throw new ApiError(400, 'Invalid role');
  }
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  user.role = req.body.role;
  await user.save();
  await logAudit({
    actor: req.user._id,
    action: 'admin.updateRole',
    resource: 'User',
    resourceId: user._id,
    meta: { role: req.body.role },
    ip: req.ip,
  });
  return success(res, 200, 'Role updated', { user: user.toSafeObject() });
});

const purgeSoftDeleted = asyncHandler(async (req, res) => {
  const result = await User.deleteMany({ isDeleted: true });
  await logAudit({
    actor: req.user._id,
    action: 'admin.purgeSoftDeleted',
    resource: 'User',
    meta: { deletedCount: result.deletedCount },
    ip: req.ip,
  });
  return success(res, 200, 'Soft-deleted users purged', {
    deletedCount: result.deletedCount,
  });
});

/* ── Candidates (thin User + Application CRUD) ─────────────── */
const listCandidates = asyncHandler(async (req, res) => {
  req.query.role = ROLES.CANDIDATE;
  const data = await buildUserList(req);
  return success(res, 200, 'Candidates fetched', data);
});

const createCandidate = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    throw new ApiError(400, 'name, email, password are required');
  }
  const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (exists) throw new ApiError(409, 'Email already registered');

  const user = await User.create({
    name,
    email,
    password,
    phone,
    role: ROLES.CANDIDATE,
    profileCompleted: false,
  });

  await logAudit({
    actor: req.user._id,
    action: 'admin.createCandidate',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });

  return success(res, 201, 'Candidate created', { user: user.toSafeObject() });
});

const updateCandidate = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.isDeleted || user.role !== ROLES.CANDIDATE) {
    throw new ApiError(404, 'Candidate not found');
  }
  await applyUserUpdates(user, req.body);
  await logAudit({
    actor: req.user._id,
    action: 'admin.updateCandidate',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });
  return success(res, 200, 'Candidate updated', { user: user.toSafeObject() });
});

const deleteCandidate = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== ROLES.CANDIDATE) {
    throw new ApiError(404, 'Candidate not found');
  }
  req.params.id = String(user._id);
  // reuse soft-delete body by invoking logic inline
  if (String(user._id) === String(req.user._id)) {
    throw new ApiError(400, 'Cannot deactivate your own account');
  }
  user.isActive = false;
  user.isDeleted = true;
  user.deletedAt = new Date();
  await user.save();
  await logAudit({
    actor: req.user._id,
    action: 'admin.softDeleteUser',
    resource: 'User',
    resourceId: user._id,
    meta: { role: user.role },
    ip: req.ip,
  });
  return success(res, 200, 'User deactivated', { user: user.toSafeObject() });
});

/* ── HR users ──────────────────────────────────────────────── */
const listHrUsers = asyncHandler(async (req, res) => {
  req.query.role = ROLES.HR;
  const data = await buildUserList(req);
  return success(res, 200, 'HR users fetched', data);
});

const createHrUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone, designation } = req.body;
  if (!name || !email || !password) {
    throw new ApiError(400, 'name, email, password are required');
  }
  if (String(password).length < 6) {
    throw new ApiError(400, 'password must be at least 6 characters');
  }

  const exists = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (exists) throw new ApiError(409, 'Email already registered');

  const employeeId = await generateEmployeeId();
  const user = await User.create({
    name,
    email,
    password,
    phone,
    designation: designation || 'HR',
    role: ROLES.HR,
    employeeId,
    profileCompleted: true,
    profileCompletedAt: new Date(),
  });

  await logAudit({
    actor: req.user._id,
    action: 'admin.createHrUser',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });

  return success(res, 201, 'HR user created', { user: user.toSafeObject() });
});

const updateHrUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.isDeleted || user.role !== ROLES.HR) {
    throw new ApiError(404, 'HR user not found');
  }
  await applyUserUpdates(user, req.body);
  await logAudit({
    actor: req.user._id,
    action: 'admin.updateHrUser',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });
  return success(res, 200, 'HR user updated', { user: user.toSafeObject() });
});

const deleteHrUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || user.role !== ROLES.HR) {
    throw new ApiError(404, 'HR user not found');
  }
  if (String(user._id) === String(req.user._id)) {
    throw new ApiError(400, 'Cannot deactivate your own account');
  }
  user.isActive = false;
  user.isDeleted = true;
  user.deletedAt = new Date();
  await user.save();
  await logAudit({
    actor: req.user._id,
    action: 'admin.softDeleteUser',
    resource: 'User',
    resourceId: user._id,
    meta: { role: user.role },
    ip: req.ip,
  });
  return success(res, 200, 'User deactivated', { user: user.toSafeObject() });
});

/* ── Dashboard ─────────────────────────────────────────────── */
const adminDashboard = asyncHandler(async (req, res) => {
  const day = startOfDay();

  const [
    candidates,
    employees,
    managers,
    hrUsers,
    admins,
    openJobs,
    pendingLeave,
    pendingOt,
    pendingExp,
    pendingWfh,
    loanAdvance,
    presentToday,
    activeUsers,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.CANDIDATE, isDeleted: false }),
    User.countDocuments({ role: ROLES.EMPLOYEE, isDeleted: false }),
    User.countDocuments({ role: ROLES.MANAGER, isDeleted: false }),
    User.countDocuments({ role: ROLES.HR, isDeleted: false }),
    User.countDocuments({ role: ROLES.ADMIN, isDeleted: false }),
    Job.countDocuments({ status: 'Active' }),
    LeaveRequest.countDocuments({ status: 'pending' }),
    OvertimeRequest.countDocuments({ status: 'pending' }),
    ExpenseClaim.countDocuments({ status: 'pending' }),
    WfhRequest.countDocuments({
      status: { $in: ['pending', 'pending_manager', 'pending_hr'] },
    }),
    countPendingLoanAdvance(),
    Attendance.countDocuments({
      date: day,
      status: { $in: ['present', 'late', 'half-day', 'wfh'] },
    }),
    User.countDocuments({ isDeleted: false, isActive: { $ne: false } }),
  ]);

  const pendingApprovals =
    pendingLeave +
    pendingOt +
    pendingExp +
    pendingWfh +
    (loanAdvance.pendingLoanAdvance || 0);

  return success(res, 200, 'Admin dashboard', {
    dashboard: {
      candidates,
      employees,
      managers,
      hrUsers,
      admins,
      totalUsers: candidates + employees + managers + hrUsers + admins,
      activeUsers,
      openJobs,
      pendingApprovals,
      pendingLeave,
      pendingOvertime: pendingOt,
      pendingExpenses: pendingExp,
      pendingWfh,
      pendingLoans: loanAdvance.pendingLoanAdvance || 0,
      attendanceToday: {
        date: day.toISOString().slice(0, 10),
        present: presentToday,
      },
    },
  });
});

const listSettings = asyncHandler(async (req, res) => {
  const settings = await SystemSetting.find().sort({ key: 1 });
  return success(res, 200, 'Settings fetched', { settings });
});

const upsertSetting = asyncHandler(async (req, res) => {
  const setting = await SystemSetting.findOneAndUpdate(
    { key: req.body.key },
    {
      key: req.body.key,
      value: req.body.value,
      description: req.body.description,
    },
    { upsert: true, new: true }
  );
  return success(res, 200, 'Setting saved', { setting });
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const logs = await AuditLog.find()
    .populate('actor', 'name email role')
    .sort({ createdAt: -1 })
    .limit(Number(req.query.limit) || 100);
  return success(res, 200, 'Audit logs fetched', { logs });
});

export {
  listUsers,
  getUser,
  updateUser,
  setUserStatus,
  softDeleteUser,
  forcePasswordResetFlag,
  updateRole,
  purgeSoftDeleted,
  listCandidates,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  listHrUsers,
  createHrUser,
  updateHrUser,
  deleteHrUser,
  adminDashboard,
  listSettings,
  upsertSetting,
  listAuditLogs,
};
