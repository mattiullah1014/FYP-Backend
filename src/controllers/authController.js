import crypto from 'crypto';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { signToken } from '../utils/tokens.js';
import { ALL_ROLES, ROLES, normalizeRole } from '../constants/roles.js';
import { logAudit } from '../services/auditService.js';
import { notify } from '../services/notificationService.js';

const resolveRole = (raw) => {
  const role = normalizeRole(raw);
  if (!role || !ALL_ROLES.includes(role)) {
    throw new ApiError(
      400,
      `Valid role is required (${ALL_ROLES.join(', ')})`
    );
  }
  return role;
};

const hashOtp = (otp) =>
  crypto.createHash('sha256').update(String(otp)).digest('hex');

/** Public signup: candidate | admin only. Staff (employee/manager/hr) are created by Admin/HR or hire conversion. */
const PUBLIC_REGISTER_ROLES = [ROLES.CANDIDATE, ROLES.ADMIN];

const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  const role = resolveRole(req.body.role);

  if (!PUBLIC_REGISTER_ROLES.includes(role)) {
    throw new ApiError(
      403,
      'Public signup only allows candidate or admin. Employee, manager, and HR accounts are created by Admin/HR (or via hiring).'
    );
  }

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) {
    throw new ApiError(
      409,
      `Email already registered as '${exists.role}'. Login with that role.`
    );
  }

  const user = await User.create({
    name,
    email,
    password,
    phone,
    role,
    // Candidates must finish CandidateSetup; admin skips it
    profileCompleted: role !== ROLES.CANDIDATE,
    profileCompletedAt: role !== ROLES.CANDIDATE ? new Date() : undefined,
  });

  const token = signToken(user._id, user.role);
  await logAudit({
    actor: user._id,
    action: 'auth.register',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
    meta: { role: user.role },
  });

  return success(res, 201, `Registered successfully as ${user.role}`, {
    user: user.toSafeObject(),
    token,
  });
});

/** Matches RN RoleSelection → Login: credentials must match selected role */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const role = resolveRole(req.body.role);

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    '+password'
  );
  if (!user || user.isDeleted) throw new ApiError(401, 'Invalid credentials');
  if (!user.isActive) throw new ApiError(403, 'Account is suspended');

  const matched = await user.matchPassword(password);
  if (!matched) throw new ApiError(401, 'Invalid credentials');

  if (user.role !== role) {
    throw new ApiError(
      403,
      `This account is registered as '${user.role}'. Please select that role to login.`
    );
  }

  // Email OTP challenge when 2FA is enabled
  if (user.twoFactorEnabled) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    user.twoFactorToken = hashOtp(otp);
    user.twoFactorExpire = Date.now() + 10 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    await notify({
      to: user.email,
      channel: 'email',
      subject: 'Brilliance login verification code',
      message: `Your Brilliance 2FA login OTP is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your Brilliance <strong>2FA login OTP</strong> is <strong style="font-size:20px;letter-spacing:4px">${otp}</strong>.</p><p>It expires in 10 minutes. If you did not try to log in, ignore this email.</p>`,
    });

    const payload = {
      requires2FA: true,
      email: user.email,
      role: user.role,
    };
    if (process.env.NODE_ENV !== 'production') {
      payload.otp = otp;
    }

    return success(res, 200, '2FA OTP sent to your email', payload);
  }

  const token = signToken(user._id, user.role);
  await logAudit({
    actor: user._id,
    action: 'auth.login',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
    meta: { role: user.role },
  });

  return success(res, 200, 'Login successful', {
    user: user.toSafeObject(),
    token,
  });
});

/** Complete login after email 2FA OTP */
const verify2FA = asyncHandler(async (req, res) => {
  const role = resolveRole(req.body.role);
  const email = String(req.body.email).toLowerCase().trim();
  const otp = String(req.body.otp || '').trim();

  if (!otp || otp.length < 4) {
    throw new ApiError(400, 'Valid OTP is required');
  }

  const user = await User.findOne({
    email,
    role,
    twoFactorEnabled: true,
    twoFactorToken: hashOtp(otp),
    twoFactorExpire: { $gt: Date.now() },
    isDeleted: false,
  });

  if (!user) throw new ApiError(400, 'Invalid or expired OTP');

  user.twoFactorToken = undefined;
  user.twoFactorExpire = undefined;
  await user.save({ validateBeforeSave: false });

  const token = signToken(user._id, user.role);
  await logAudit({
    actor: user._id,
    action: 'auth.login.2fa',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
    meta: { role: user.role },
  });

  return success(res, 200, 'Login successful', {
    user: user.toSafeObject(),
    token,
  });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('department', 'name code')
    .populate('branch', 'name code')
    .populate('manager', 'name email designation');

  const payload = {
    user: user.toSafeObject(),
  };

  if (user.role === ROLES.MANAGER) {
    const ManagerProfile = (await import('../models/ManagerProfile.js')).default;
    let profile = await ManagerProfile.findOne({ user: user._id });
    if (!profile) {
      profile = await ManagerProfile.create({
        user: user._id,
        title: user.designation || 'Manager',
        status: user.isActive === false ? 'inactive' : 'active',
      });
    }
    payload.permissions = profile.permissions;
    payload.managerProfile = profile;
  }

  if (user.role === ROLES.EMPLOYEE || user.role === ROLES.MANAGER) {
    const {
      syncProfileCompletionFromUser,
      getOrCreateProfileCompletion,
      profileCompletionSummary,
    } = await import('../utils/profileCompletion.js');
    await syncProfileCompletionFromUser(user._id);
    const completion = await getOrCreateProfileCompletion(user._id);
    payload.profileCompletion = profileCompletionSummary(completion);
  }

  if (user.role === ROLES.EMPLOYEE) {
    const ManagerEmployeeAssignment = (
      await import('../models/ManagerEmployeeAssignment.js')
    ).default;
    const links = await ManagerEmployeeAssignment.find({
      employee: user._id,
    }).populate('manager', 'name email designation department');
    payload.managers = links.map((l) => ({
      id: l.manager?._id,
      name: l.manager?.name,
      email: l.manager?.email,
      designation: l.manager?.designation,
      department: l.manager?.department,
      relationshipType: l.relationshipType,
    }));
  }

  return success(res, 200, 'Profile fetched', payload);
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  const matched = await user.matchPassword(currentPassword);
  if (!matched) throw new ApiError(400, 'Current password is incorrect');

  user.password = newPassword;
  await user.save();
  return success(res, 200, 'Password updated');
});

/** RN Forget step 1: send OTP for email + selected role */
const forgotPassword = asyncHandler(async (req, res) => {
  const role = resolveRole(req.body.role);
  const email = String(req.body.email).toLowerCase().trim();

  const genericMsg = 'If the account exists, an OTP was sent';
  const user = await User.findOne({ email, role, isDeleted: false });

  if (!user) {
    return success(res, 200, genericMsg);
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  user.resetPasswordToken = hashOtp(otp);
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  await user.save({ validateBeforeSave: false });

  await notify({
    to: user.email,
    channel: 'email',
    subject: 'Password reset OTP',
    message: `Your Brilliance password reset OTP is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your Brilliance <strong>password reset OTP</strong> is <strong style="font-size:20px;letter-spacing:4px">${otp}</strong>.</p><p>It expires in 10 minutes. If you did not request this, ignore this email.</p>`,
  });

  const payload =
    process.env.NODE_ENV === 'production' ? undefined : { otp };

  return success(res, 200, genericMsg, payload);
});

/** RN Forget step 2: verify OTP before showing new-password form */
const verifyOtp = asyncHandler(async (req, res) => {
  const role = resolveRole(req.body.role);
  const email = String(req.body.email).toLowerCase().trim();
  const otp = String(req.body.otp || '').trim();

  if (!otp || otp.length < 4) {
    throw new ApiError(400, 'Valid OTP is required');
  }

  const user = await User.findOne({
    email,
    role,
    resetPasswordToken: hashOtp(otp),
    resetPasswordExpire: { $gt: Date.now() },
    isDeleted: false,
  });

  if (!user) throw new ApiError(400, 'Invalid or expired OTP');

  return success(res, 200, 'OTP verified', { verified: true });
});

/** RN Forget step 3: reset password with email + role + OTP */
const resetPassword = asyncHandler(async (req, res) => {
  const role = resolveRole(req.body.role);
  const email = String(req.body.email).toLowerCase().trim();
  const otp = String(req.body.otp || req.body.token || '').trim();
  const { newPassword } = req.body;

  if (!otp) throw new ApiError(400, 'OTP is required');

  const user = await User.findOne({
    email,
    role,
    resetPasswordToken: hashOtp(otp),
    resetPasswordExpire: { $gt: Date.now() },
    isDeleted: false,
  }).select('+password');

  if (!user) throw new ApiError(400, 'Invalid or expired OTP');

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  await notify({
    to: user.email,
    channel: 'email',
    subject: 'Password reset successful',
    message:
      'Your Brilliance account password was reset successfully. If this was not you, contact support immediately.',
    html: `<p>Your Brilliance account password was <strong>reset successfully</strong>.</p><p>If this was not you, contact support immediately.</p>`,
  });

  return success(res, 200, 'Password reset successful');
});

const logout = asyncHandler(async (req, res) => {
  await logAudit({
    actor: req.user._id,
    action: 'auth.logout',
    resource: 'User',
    resourceId: req.user._id,
    ip: req.ip,
  });
  return success(res, 200, 'Logged out (client should discard token)');
});

const toggle2FA = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const enabled = Boolean(req.body.enabled);
  user.twoFactorEnabled = enabled;

  if (!enabled) {
    user.twoFactorToken = undefined;
    user.twoFactorExpire = undefined;
  }

  await user.save();

  await notify({
    to: user.email,
    channel: 'email',
    subject: enabled
      ? 'Two-factor authentication enabled'
      : 'Two-factor authentication disabled',
    message: enabled
      ? 'Email 2FA is now enabled on your Brilliance account. You will receive a login OTP each time you sign in.'
      : 'Email 2FA has been disabled on your Brilliance account.',
    html: enabled
      ? `<p>Email <strong>2FA is now enabled</strong> on your Brilliance account.</p><p>You will receive a login OTP each time you sign in.</p>`
      : `<p>Email <strong>2FA has been disabled</strong> on your Brilliance account.</p>`,
  });

  return success(res, 200, '2FA setting updated', {
    twoFactorEnabled: user.twoFactorEnabled,
  });
});

export {
  register,
  login,
  verify2FA,
  getMe,
  changePassword,
  forgotPassword,
  verifyOtp,
  resetPassword,
  logout,
  toggle2FA,
};
