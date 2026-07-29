import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { uploadToCloudinary } from '../config/cloudinary.stub.js';
import { ROLES } from '../constants/roles.js';
import { logAudit } from '../services/auditService.js';

const parseSkills = (raw) => {
  if (raw == null || raw === '') return undefined;
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

/** GET /api/candidates/me/profile */
const getMyProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user || user.role !== ROLES.CANDIDATE) {
    throw new ApiError(403, 'Only candidates can access this profile');
  }
  return success(res, 200, 'Candidate profile fetched', {
    user: user.toSafeObject(),
  });
});

/**
 * PUT /api/candidates/me/profile
 * Multipart or JSON — completes CandidateSetup form.
 * Required: phone, education, experience, expectedSalary, coverLetter, resume (file or already saved)
 */
const completeProfile = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.CANDIDATE) {
    throw new ApiError(403, 'Only candidates can complete this profile');
  }

  const user = await User.findById(req.user._id);
  if (!user || user.isDeleted) throw new ApiError(404, 'User not found');

  const phone = req.body.phone != null ? String(req.body.phone).trim() : user.phone;
  const education =
    req.body.education != null ? String(req.body.education).trim() : user.education;
  const experience =
    req.body.experience != null
      ? String(req.body.experience).trim()
      : user.experience;
  const expectedSalary =
    req.body.expectedSalary != null
      ? String(req.body.expectedSalary).trim()
      : user.expectedSalary;
  const coverLetter =
    req.body.coverLetter != null
      ? String(req.body.coverLetter).trim()
      : user.coverLetter;

  const missing = [];
  if (!phone) missing.push('phone');
  if (!education) missing.push('education');
  if (!experience) missing.push('experience');
  if (!expectedSalary) missing.push('expectedSalary');
  if (!coverLetter) missing.push('coverLetter');

  let resume = user.resume;
  if (req.file) {
    const uploaded = await uploadToCloudinary(req.file, 'candidates/resumes');
    resume = {
      url: uploaded.url,
      publicId: uploaded.publicId,
      originalName: req.file.originalname,
    };
  }
  if (!resume?.url) missing.push('resume');

  if (missing.length) {
    throw new ApiError(400, `Missing required fields: ${missing.join(', ')}`);
  }

  user.phone = phone;
  user.education = education;
  user.experience = experience;
  user.expectedSalary = expectedSalary;
  user.coverLetter = coverLetter;
  user.resume = resume;

  if (req.body.linkedin !== undefined) {
    user.linkedin = String(req.body.linkedin).trim();
  }
  if (req.body.preferredLocation !== undefined) {
    user.preferredLocation = String(req.body.preferredLocation).trim();
  }
  if (req.body.skills !== undefined) {
    user.skills = parseSkills(req.body.skills);
  }

  user.profileCompleted = true;
  user.profileCompletedAt = new Date();
  await user.save();

  await logAudit({
    actor: user._id,
    action: 'candidate.profile.complete',
    resource: 'User',
    resourceId: user._id,
    ip: req.ip,
  });

  return success(res, 200, 'Candidate profile completed', {
    user: user.toSafeObject(),
  });
});

export { getMyProfile, completeProfile };
