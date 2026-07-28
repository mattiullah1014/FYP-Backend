import User from '../models/User.js';
import { SystemSetting, AuditLog } from '../models/Admin.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { logAudit } from '../services/auditService.js';
import { ALL_ROLES } from '../constants/roles.js';

const listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.includeDeleted !== 'true') filter.isDeleted = false;
  const users = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Users fetched', { users });
});

const setUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  user.isActive = Boolean(req.body.isActive);
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

const forcePasswordResetFlag = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  // Token flow still goes through auth/forgot-password; this just audits intent
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

export { listUsers,
  setUserStatus,
  forcePasswordResetFlag,
  updateRole,
  purgeSoftDeleted,
  listSettings,
  upsertSetting,
  listAuditLogs, };
