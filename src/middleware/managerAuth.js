import ManagerProfile from '../models/ManagerProfile.js';
import ManagerEmployeeAssignment from '../models/ManagerEmployeeAssignment.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ROLES } from '../constants/roles.js';

/** Ensure req.user is an active manager and attach ManagerProfile */
export const loadManagerProfile = asyncHandler(async (req, res, next) => {
  if (req.user.role !== ROLES.MANAGER) {
    throw new ApiError(403, 'Manager role required');
  }

  let profile = await ManagerProfile.findOne({ user: req.user._id });
  if (!profile) {
    profile = await ManagerProfile.create({
      user: req.user._id,
      title: req.user.designation || 'Manager',
      department: undefined,
      status: req.user.isActive === false ? 'inactive' : 'active',
    });
  }

  if (profile.status === 'inactive' || req.user.isActive === false) {
    throw new ApiError(403, 'Manager account is inactive');
  }

  req.managerProfile = profile;
  next();
});

/** Require a specific manager permission flag */
export const requireManagerPermission = (flag) =>
  asyncHandler(async (req, res, next) => {
    const profile = req.managerProfile;
    if (!profile) {
      throw new ApiError(500, 'Manager profile not loaded');
    }
    if (!profile.permissions?.[flag]) {
      throw new ApiError(403, `Missing manager permission: ${flag}`);
    }
    next();
  });

/** Verify employee is on this manager's team */
export const assertTeamMember = async (managerId, employeeId) => {
  const link = await ManagerEmployeeAssignment.findOne({
    manager: managerId,
    employee: employeeId,
  });
  if (!link) {
    throw new ApiError(403, 'Employee is not on your team');
  }
  return link;
};

/** Verify manager reviews this employee (assignment exists) */
export const assertAssignedManager = async (employeeId, managerId) => {
  const link = await ManagerEmployeeAssignment.findOne({
    manager: managerId,
    employee: employeeId,
  });
  if (!link) {
    throw new ApiError(400, 'Selected manager is not assigned to you');
  }
  return link;
};
