import User, { CANDIDATE_GENDERS } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES } from '../constants/roles.js';
import { logAudit } from '../services/auditService.js';
import {
  absoluteUploadUrl,
  deleteUploadByUrl,
  saveAvatarFile,
} from '../utils/recruitmentHelpers.js';

const formatDateOnly = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const resolveAvatar = (user, req) => {
  const relative =
    user.candidateProfile?.avatar ||
    user.avatar ||
    user.photo?.url ||
    null;
  const absolute =
    user.candidateProfile?.avatarUrl ||
    user.avatarUrl ||
    (relative ? absoluteUploadUrl(req, relative) : null);
  return { avatar: relative, avatarUrl: absolute };
};

const buildProfileResponse = (user, req) => {
  const info = user.candidateProfile?.personalInfo || {};
  const address = info.address || user.address || {};
  const isProfileComplete = Boolean(
    user.candidateProfile?.isProfileComplete ?? user.profileCompleted
  );
  const { avatar, avatarUrl } = resolveAvatar(user, req);

  return {
    fullName: info.fullName || user.name || '',
    phone: info.phone || user.phone || '',
    dateOfBirth: formatDateOnly(info.dateOfBirth || user.dateOfBirth),
    gender: info.gender || user.gender || '',
    cnic: info.cnic || user.cnic || '',
    address: {
      street: address.street || '',
      city: address.city || '',
      state: address.state || '',
      zip: address.zip || '',
      country: address.country || '',
    },
    avatar,
    avatarUrl,
    isProfileComplete,
  };
};

const isPersonalProfileComplete = (personalInfo) => {
  const addr = personalInfo?.address || {};
  return Boolean(
    personalInfo?.fullName &&
      personalInfo?.phone &&
      personalInfo?.dateOfBirth &&
      personalInfo?.gender &&
      addr.street &&
      addr.city &&
      addr.country
  );
};

const applyAvatarToUser = async (user, req, file) => {
  if (!file) return null;

  const previous =
    user.candidateProfile?.avatar || user.avatar || null;
  const relative = await saveAvatarFile(file);
  const absolute = absoluteUploadUrl(req, relative);

  if (previous && previous !== relative) {
    await deleteUploadByUrl(previous);
  }

  user.avatar = relative;
  user.avatarUrl = absolute;
  user.photo = { url: relative, publicId: undefined };
  user.candidateProfile = {
    personalInfo: user.candidateProfile?.personalInfo,
    isProfileComplete:
      user.candidateProfile?.isProfileComplete ?? user.profileCompleted ?? false,
    avatar: relative,
    avatarUrl: absolute,
  };

  return { avatar: relative, avatarUrl: absolute };
};

/** GET /api/candidates/me/profile */
const getMyProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.role !== ROLES.CANDIDATE) {
    throw new ApiError(403, 'Only candidates can access this profile');
  }

  return success(res, 200, 'Candidate profile fetched', {
    profile: buildProfileResponse(user, req),
  });
});

/**
 * PUT /api/candidates/me/profile
 * Personal information only (JSON or multipart with optional avatar).
 */
const completeProfile = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.CANDIDATE) {
    throw new ApiError(403, 'Only candidates can complete this profile');
  }

  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const body = req.body || {};
  const nestedAddress =
    body.address && typeof body.address === 'object' ? body.address : {};

  const fullName = String(
    body.fullName ?? nestedAddress.fullName ?? user.name ?? ''
  ).trim();
  const phone = String(body.phone ?? user.phone ?? '').trim();
  const cnic =
    body.cnic != null && String(body.cnic).trim() !== ''
      ? String(body.cnic).trim()
      : user.candidateProfile?.personalInfo?.cnic || user.cnic || undefined;
  const gender = String(body.gender ?? '').trim();

  const street = String(
    nestedAddress.street ?? body.street ?? user.address?.street ?? ''
  ).trim();
  const city = String(
    nestedAddress.city ?? body.city ?? user.address?.city ?? ''
  ).trim();
  const state = String(
    nestedAddress.state ?? body.state ?? user.address?.state ?? ''
  ).trim();
  const zip = String(
    nestedAddress.zip ?? body.zip ?? user.address?.zip ?? ''
  ).trim();
  const country = String(
    nestedAddress.country ?? body.country ?? user.address?.country ?? ''
  ).trim();

  const errors = [];
  if (!fullName) errors.push('fullName is required');
  if (!phone) errors.push('phone is required');
  if (!body.dateOfBirth && !user.candidateProfile?.personalInfo?.dateOfBirth) {
    errors.push('dateOfBirth is required');
  }
  if (!gender) {
    errors.push('gender is required');
  } else if (!CANDIDATE_GENDERS.includes(gender)) {
    errors.push(`gender must be one of: ${CANDIDATE_GENDERS.join(', ')}`);
  }
  if (!street) errors.push('address.street is required');
  if (!city) errors.push('address.city is required');
  if (!country) errors.push('address.country is required');

  let dateOfBirth;
  const dobRaw =
    body.dateOfBirth ?? user.candidateProfile?.personalInfo?.dateOfBirth;
  if (dobRaw != null && dobRaw !== '') {
    dateOfBirth = new Date(dobRaw);
    if (Number.isNaN(dateOfBirth.getTime())) {
      errors.push('dateOfBirth must be a valid date (YYYY-MM-DD)');
    }
  }

  if (errors.length) {
    throw new ApiError(400, 'Validation failed', errors);
  }

  const address = {
    street,
    city,
    state: state || undefined,
    zip: zip || undefined,
    country,
  };

  const personalInfo = {
    fullName,
    phone,
    dateOfBirth,
    gender,
    cnic: cnic || undefined,
    address,
  };

  const complete = isPersonalProfileComplete(personalInfo);

  user.name = fullName;
  user.phone = phone;
  user.address = address;
  user.dateOfBirth = dateOfBirth;
  user.gender = gender;
  if (cnic) user.cnic = cnic;

  const existingAvatar = {
    avatar: user.candidateProfile?.avatar || user.avatar,
    avatarUrl: user.candidateProfile?.avatarUrl || user.avatarUrl,
  };

  user.candidateProfile = {
    personalInfo,
    isProfileComplete: complete,
    avatar: existingAvatar.avatar,
    avatarUrl: existingAvatar.avatarUrl,
  };
  user.profileCompleted = complete;
  if (complete) {
    user.profileCompletedAt = user.profileCompletedAt || new Date();
  }

  if (req.file) {
    await applyAvatarToUser(user, req, req.file);
  }

  await user.save();

  await logAudit({
    actor: user._id,
    action: 'candidate.profile.complete',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });

  return success(res, 200, 'Candidate profile updated', {
    profile: buildProfileResponse(user, req),
  });
});

/** PUT /api/candidates/me/avatar */
const uploadAvatar = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.CANDIDATE) {
    throw new ApiError(403, 'Only candidates can update avatar');
  }
  if (!req.file) {
    throw new ApiError(400, 'Avatar file is required (field name: avatar)');
  }

  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const result = await applyAvatarToUser(user, req, req.file);
  await user.save();

  await logAudit({
    actor: user._id,
    action: 'candidate.avatar.upload',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });

  return success(res, 200, 'Avatar updated', result);
});

/** DELETE /api/candidates/me/avatar */
const removeAvatar = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.CANDIDATE) {
    throw new ApiError(403, 'Only candidates can remove avatar');
  }

  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const previous = user.candidateProfile?.avatar || user.avatar;
  await deleteUploadByUrl(previous);

  user.avatar = null;
  user.avatarUrl = null;
  user.photo = undefined;
  user.candidateProfile = {
    personalInfo: user.candidateProfile?.personalInfo,
    isProfileComplete:
      user.candidateProfile?.isProfileComplete ?? user.profileCompleted ?? false,
    avatar: null,
    avatarUrl: null,
  };
  await user.save();

  await logAudit({
    actor: user._id,
    action: 'candidate.avatar.remove',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });

  return success(res, 200, 'Avatar removed');
});

export {
  getMyProfile,
  completeProfile,
  uploadAvatar,
  removeAvatar,
  buildProfileResponse,
};
