import User from '../models/User.js';
import ManagerProfile from '../models/ManagerProfile.js';
import ManagerEmployeeAssignment from '../models/ManagerEmployeeAssignment.js';
import Employee from '../models/Employee.js';
import mongoose from 'mongoose';
import Task from '../models/Task.js';
import OvertimeRequest from '../models/OvertimeRequest.js';
import { LeaveRequest } from '../models/Leave.js';
import ExpenseClaim from '../models/Expense.js';
import { PerformanceReview } from '../models/Performance.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES } from '../constants/roles.js';
import { generateEmployeeId } from './employeeController.js';
import {
  MANAGER_PERMISSION_KEYS,
} from '../models/ManagerProfile.js';
import {
  getOrCreateProfileCompletion,
  profileCompletionSummary,
  syncProfileCompletionFromUser,
  getIncompleteSections,
} from '../utils/profileCompletion.js';
import { countPending as countPendingLoanAdvance } from './loanAdvanceController.js';

const ensurePrimaryExclusive = async (employeeId, managerId) => {
  await ManagerEmployeeAssignment.updateMany(
    {
      employee: employeeId,
      relationshipType: 'primary',
      manager: { $ne: managerId },
    },
    { relationshipType: 'secondary' }
  );
};

const listManagers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  let profiles = await ManagerProfile.find(filter)
    .populate('user', 'name email phone designation department employeeId isActive isDeleted')
    .sort({ createdAt: -1 });

  if (req.query.search) {
    const q = String(req.query.search).toLowerCase();
    profiles = profiles.filter((p) => {
      const u = p.user;
      return (
        u?.name?.toLowerCase().includes(q) ||
        u?.email?.toLowerCase().includes(q) ||
        p.title?.toLowerCase().includes(q)
      );
    });
  }

  const managers = await Promise.all(
    profiles.map(async (p) => {
      const teamSize = await ManagerEmployeeAssignment.countDocuments({
        manager: p.user?._id,
      });
      return { ...p.toObject(), teamSize };
    })
  );

  return success(res, 200, 'Managers fetched', { managers });
});

const createManager = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    title,
    department,
    phone,
    team = [],
    permissions,
  } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, 'name, email, password are required');
  }

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) throw new ApiError(409, 'Email already registered');

  const employeeId = await generateEmployeeId();
  const user = await User.create({
    name,
    email,
    password,
    phone,
    role: ROLES.MANAGER,
    designation: title,
    employeeId,
    profileCompleted: false,
  });

  // store createdBy if schema has it — User may not; ignore
  const profile = await ManagerProfile.create({
    user: user._id,
    title: title || 'Manager',
    department,
    status: 'active',
    permissions: {
      ...ManagerProfile.defaultPermissions(),
      teamManagement: true,
      approvals: true,
      performance: true,
      tasks: true,
      reports: true,
      communication: true,
      ...(permissions || {}),
    },
    createdBy: req.user._id,
  });

  for (const item of team) {
    if (!item.employeeId) continue;
    const rel = item.relationshipType || 'secondary';
    if (rel === 'primary') await ensurePrimaryExclusive(item.employeeId, user._id);
    await ManagerEmployeeAssignment.findOneAndUpdate(
      { manager: user._id, employee: item.employeeId },
      { relationshipType: rel },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (rel === 'primary') {
      await User.findByIdAndUpdate(item.employeeId, { manager: user._id });
    }
  }

  await getOrCreateProfileCompletion(user._id);

  return success(res, 201, 'Manager created', {
    manager: user.toSafeObject(),
    profile,
  });
});

const getManager = asyncHandler(async (req, res) => {
  const profile = await ManagerProfile.findOne({
    $or: [{ _id: req.params.id }, { user: req.params.id }],
  }).populate(
    'user',
    'name email phone designation department employeeId isActive'
  );
  if (!profile) throw new ApiError(404, 'Manager not found');

  const team = await ManagerEmployeeAssignment.find({
    manager: profile.user._id,
  }).populate('employee', 'name email employeeId designation');

  return success(res, 200, 'Manager fetched', { profile, team });
});

const updateManager = asyncHandler(async (req, res) => {
  const profile = await ManagerProfile.findOne({
    $or: [{ _id: req.params.id }, { user: req.params.id }],
  });
  if (!profile) throw new ApiError(404, 'Manager not found');

  if (req.body.title !== undefined) profile.title = req.body.title;
  if (req.body.department !== undefined) profile.department = req.body.department;
  if (req.body.status !== undefined) profile.status = req.body.status;
  if (req.body.permissions) {
    MANAGER_PERMISSION_KEYS.forEach((k) => {
      if (req.body.permissions[k] !== undefined) {
        profile.permissions[k] = Boolean(req.body.permissions[k]);
      }
    });
  }
  await profile.save();

  const user = await User.findById(profile.user);
  if (user) {
    if (req.body.title) user.designation = req.body.title;
    if (req.body.name) user.name = req.body.name;
    if (req.body.phone) user.phone = req.body.phone;
    await user.save();
  }

  if (Array.isArray(req.body.team)) {
    for (const item of req.body.team) {
      if (!item.employeeId) continue;
      const rel = item.relationshipType || 'secondary';
      if (rel === 'primary') {
        await ensurePrimaryExclusive(item.employeeId, profile.user);
      }
      await ManagerEmployeeAssignment.findOneAndUpdate(
        { manager: profile.user, employee: item.employeeId },
        { relationshipType: rel },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (rel === 'primary') {
        await User.findByIdAndUpdate(item.employeeId, { manager: profile.user });
      }
    }
  }

  return success(res, 200, 'Manager updated', { profile });
});

const transferManager = asyncHandler(async (req, res) => {
  const profile = await ManagerProfile.findOne({
    $or: [{ _id: req.params.id }, { user: req.params.id }],
  });
  if (!profile) throw new ApiError(404, 'Manager not found');

  if (req.body.department) profile.department = req.body.department;
  if (req.body.title) {
    profile.title = req.body.title;
    await User.findByIdAndUpdate(profile.user, { designation: req.body.title });
  }
  await profile.save();

  return success(res, 200, 'Manager transferred', { profile });
});

const deactivateManager = asyncHandler(async (req, res) => {
  const profile = await ManagerProfile.findOne({
    $or: [{ _id: req.params.id }, { user: req.params.id }],
  });
  if (!profile) throw new ApiError(404, 'Manager not found');

  const managerUserId = profile.user;
  const reassignTo = req.body.reassignToManagerId;

  if (reassignTo) {
    const target = await User.findOne({
      _id: reassignTo,
      role: ROLES.MANAGER,
      isDeleted: false,
    });
    if (!target) throw new ApiError(404, 'Target manager not found');

    const assignments = await ManagerEmployeeAssignment.find({
      manager: managerUserId,
    });
    for (const a of assignments) {
      const exists = await ManagerEmployeeAssignment.findOne({
        manager: reassignTo,
        employee: a.employee,
      });
      if (exists) {
        if (
          a.relationshipType === 'primary' &&
          exists.relationshipType !== 'primary'
        ) {
          await ensurePrimaryExclusive(a.employee, reassignTo);
          exists.relationshipType = 'primary';
          await exists.save();
          await User.findByIdAndUpdate(a.employee, { manager: reassignTo });
        }
        await a.deleteOne();
      } else {
        if (a.relationshipType === 'primary') {
          await ensurePrimaryExclusive(a.employee, reassignTo);
        }
        a.manager = reassignTo;
        await a.save();
        if (a.relationshipType === 'primary') {
          await User.findByIdAndUpdate(a.employee, { manager: reassignTo });
        }
      }
    }
  }

  profile.status = 'inactive';
  await profile.save();
  await User.findByIdAndUpdate(managerUserId, { isActive: false });

  return success(res, 200, 'Manager deactivated', { profile });
});

const managerActivity = asyncHandler(async (req, res) => {
  const profile = await ManagerProfile.findOne({
    $or: [{ _id: req.params.id }, { user: req.params.id }],
  });
  if (!profile) throw new ApiError(404, 'Manager not found');
  const mid = profile.user;

  const [tasksAssigned, pendingLeave, pendingOt, pendingExp, reviews, recentTasks] =
    await Promise.all([
      Task.countDocuments({ manager: mid, isDeleted: false }),
      LeaveRequest.countDocuments({ manager: mid, status: 'pending' }),
      OvertimeRequest.countDocuments({ manager: mid, status: 'pending' }),
      ExpenseClaim.countDocuments({ manager: mid, status: 'pending' }),
      PerformanceReview.countDocuments({
        $or: [{ manager: mid }, { reviewer: mid }],
      }),
      Task.find({ manager: mid, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('assignee', 'name'),
    ]);

  const approvalsGiven =
    (await LeaveRequest.countDocuments({
      manager: mid,
      status: { $in: ['approved', 'rejected'] },
    })) +
    (await OvertimeRequest.countDocuments({
      manager: mid,
      status: { $in: ['approved', 'rejected'] },
    })) +
    (await ExpenseClaim.countDocuments({
      manager: mid,
      status: { $in: ['approved', 'rejected'] },
    }));

  return success(res, 200, 'Manager activity', {
    activity: {
      tasksAssigned,
      approvalsGiven,
      pendingApprovals: pendingLeave + pendingOt + pendingExp,
      reviewsCompleted: reviews,
      recent: recentTasks,
    },
  });
});

const managerReport = asyncHandler(async (req, res) => {
  const profile = await ManagerProfile.findOne({
    $or: [{ _id: req.params.id }, { user: req.params.id }],
  }).populate('user', 'name email designation');
  if (!profile) throw new ApiError(404, 'Manager not found');

  const teamSize = await ManagerEmployeeAssignment.countDocuments({
    manager: profile.user._id,
  });

  return success(res, 200, 'Manager report', {
    report: {
      manager: profile,
      teamSize,
      permissions: profile.permissions,
      generatedAt: new Date(),
    },
  });
});

// --- Assignments ---
const createAssignment = asyncHandler(async (req, res) => {
  const { managerId, employeeId, relationshipType = 'secondary' } = req.body;
  if (!managerId || !employeeId) {
    throw new ApiError(400, 'managerId and employeeId are required');
  }
  if (!['primary', 'secondary'].includes(relationshipType)) {
    throw new ApiError(400, 'Invalid relationshipType');
  }

  const [manager, employee] = await Promise.all([
    User.findOne({ _id: managerId, role: ROLES.MANAGER, isDeleted: false }),
    User.findOne({ _id: employeeId, role: ROLES.EMPLOYEE, isDeleted: false }),
  ]);
  if (!manager) throw new ApiError(404, 'Manager not found');
  if (!employee) throw new ApiError(404, 'Employee not found');

  if (relationshipType === 'primary') {
    await ensurePrimaryExclusive(employeeId, managerId);
  }

  const assignment = await ManagerEmployeeAssignment.findOneAndUpdate(
    { manager: managerId, employee: employeeId },
    { relationshipType },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (relationshipType === 'primary') {
    employee.manager = managerId;
    await employee.save();
  }

  return success(res, 201, 'Assignment created', { assignment });
});

const updateAssignment = asyncHandler(async (req, res) => {
  const assignment = await ManagerEmployeeAssignment.findById(req.params.id);
  if (!assignment) throw new ApiError(404, 'Assignment not found');

  const relationshipType = req.body.relationshipType;
  if (!['primary', 'secondary'].includes(relationshipType)) {
    throw new ApiError(400, 'Invalid relationshipType');
  }

  if (relationshipType === 'primary') {
    await ensurePrimaryExclusive(assignment.employee, assignment.manager);
    await User.findByIdAndUpdate(assignment.employee, {
      manager: assignment.manager,
    });
  }

  assignment.relationshipType = relationshipType;
  await assignment.save();
  return success(res, 200, 'Assignment updated', { assignment });
});

const deleteAssignment = asyncHandler(async (req, res) => {
  const assignment = await ManagerEmployeeAssignment.findByIdAndDelete(
    req.params.id
  );
  if (!assignment) throw new ApiError(404, 'Assignment not found');

  const emp = await User.findById(assignment.employee);
  if (emp && String(emp.manager) === String(assignment.manager)) {
    const next = await ManagerEmployeeAssignment.findOne({
      employee: emp._id,
      relationshipType: 'primary',
    });
    emp.manager = next?.manager || undefined;
    await emp.save();
  }

  return success(res, 200, 'Assignment deleted');
});

const employeeManagers = asyncHandler(async (req, res) => {
  const isObjectId =
    mongoose.Types.ObjectId.isValid(req.params.id) &&
    String(new mongoose.Types.ObjectId(req.params.id)) === String(req.params.id);

  let userId = req.params.id;
  const emp = await Employee.findOne({
    $or: [
      { empId: req.params.id },
      ...(isObjectId ? [{ _id: req.params.id }, { user: req.params.id }] : []),
    ],
  });
  if (emp) userId = emp.user;

  const links = await ManagerEmployeeAssignment.find({
    employee: userId,
  }).populate('manager', 'name email designation department');

  return success(res, 200, 'Employee managers', {
    managers: links.map((l) => ({
      name: l.manager?.name || 'Unknown',
      relationship:
        l.relationshipType === 'primary' ? 'Primary' : 'Secondary',
    })),
  });
});

const getPermissions = asyncHandler(async (req, res) => {
  const profile = await ManagerProfile.findOne({
    $or: [{ _id: req.params.id }, { user: req.params.id }],
  });
  if (!profile) throw new ApiError(404, 'Manager not found');
  return success(res, 200, 'Permissions fetched', {
    permissions: profile.permissions,
  });
});

const putPermissions = asyncHandler(async (req, res) => {
  const profile = await ManagerProfile.findOne({
    $or: [{ _id: req.params.id }, { user: req.params.id }],
  });
  if (!profile) throw new ApiError(404, 'Manager not found');

  MANAGER_PERMISSION_KEYS.forEach((k) => {
    if (req.body[k] !== undefined) profile.permissions[k] = Boolean(req.body[k]);
  });
  await profile.save();

  return success(res, 200, 'Permissions updated', {
    permissions: profile.permissions,
  });
});

const hrDashboard = asyncHandler(async (req, res) => {
  const managers = await ManagerProfile.find({ status: 'active' });
  let incompleteManagers = 0;
  for (const m of managers) {
    await syncProfileCompletionFromUser(m.user);
    const c = await getOrCreateProfileCompletion(m.user);
    if (getIncompleteSections(c).length) incompleteManagers += 1;
  }

  const [pendingLeave, pendingOt, pendingExp, employees, loanAdvance] =
    await Promise.all([
      LeaveRequest.countDocuments({ status: 'pending' }),
      OvertimeRequest.countDocuments({ status: 'pending' }),
      ExpenseClaim.countDocuments({ status: 'pending' }),
      User.countDocuments({ role: ROLES.EMPLOYEE, isDeleted: false }),
      countPendingLoanAdvance(),
    ]);

  return success(res, 200, 'HR dashboard', {
    dashboard: {
      activeManagers: managers.length,
      incompleteManagerProfiles: incompleteManagers,
      employees,
      pendingApprovals:
        pendingLeave +
        pendingOt +
        pendingExp +
        (loanAdvance.pendingLoanAdvance || 0),
      pendingLoans: loanAdvance.pendingLoanAdvance || 0,
      pendingLoanRequests: loanAdvance.pendingLoans || 0,
      pendingAdvances: loanAdvance.pendingAdvances || 0,
    },
  });
});

const profileAlerts = asyncHandler(async (req, res) => {
  const users = await User.find({
    role: { $in: [ROLES.EMPLOYEE, ROLES.MANAGER] },
    isDeleted: false,
  }).select('name email role');

  const alerts = [];
  for (const u of users) {
    await syncProfileCompletionFromUser(u._id);
    const c = await getOrCreateProfileCompletion(u._id);
    const incomplete = getIncompleteSections(c);
    if (incomplete.length) {
      alerts.push({
        user: u,
        incomplete,
        profileCompletion: profileCompletionSummary(c),
      });
    }
  }

  return success(res, 200, 'Profile alerts', { alerts });
});

export {
  listManagers,
  createManager,
  getManager,
  updateManager,
  transferManager,
  deactivateManager,
  managerActivity,
  managerReport,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  employeeManagers,
  getPermissions,
  putPermissions,
  hrDashboard,
  profileAlerts,
};
