import { JobPosting,
  Application,
  Interview,
  InterviewFeedback, } from '../models/Recruitment.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { uploadToCloudinary } from '../config/cloudinary.stub.js';
import { generateEmployeeId } from './employeeController.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';
import { notify } from '../services/notificationService.js';
import { logAudit } from '../services/auditService.js';

const listJobs = asyncHandler(async (req, res) => {
  const filter = {};
  if (!HR_ADMIN.includes(req.user?.role) && req.user?.role !== ROLES.MANAGER) {
    filter.status = 'active';
  } else if (req.query.status) {
    filter.status = req.query.status;
  } else if (!req.user) {
    filter.status = 'active';
  }
  const jobs = await JobPosting.find(filter)
    .populate('department', 'name')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Jobs fetched', { jobs });
});

const createJob = asyncHandler(async (req, res) => {
  const job = await JobPosting.create({ ...req.body, postedBy: req.user._id });
  return success(res, 201, 'Job posted', { job });
});

const updateJob = asyncHandler(async (req, res) => {
  const job = await JobPosting.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!job) throw new ApiError(404, 'Job not found');
  return success(res, 200, 'Job updated', { job });
});

const deleteJob = asyncHandler(async (req, res) => {
  const job = await JobPosting.findByIdAndUpdate(
    req.params.id,
    { status: 'closed' },
    { new: true }
  );
  if (!job) throw new ApiError(404, 'Job not found');
  return success(res, 200, 'Job closed', { job });
});

const applyToJob = asyncHandler(async (req, res) => {
  const job = await JobPosting.findById(req.params.jobId);
  if (!job || job.status !== 'active') throw new ApiError(404, 'Job not available');

  let resume;
  if (req.file) {
    const uploaded = await uploadToCloudinary(req.file, 'recruitment/resumes');
    resume = { url: uploaded.url, publicId: uploaded.publicId };
  }

  const application = await Application.create({
    job: job._id,
    candidate: req.user._id,
    coverLetter: req.body.coverLetter,
    resume,
  });

  await notify({
    to: req.user.email,
    message: `Application submitted for ${job.title}`,
  });

  return success(res, 201, 'Application submitted', { application });
});

const myApplications = asyncHandler(async (req, res) => {
  const applications = await Application.find({ candidate: req.user._id })
    .populate('job', 'title status location')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Applications fetched', { applications });
});

const listApplications = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.job) filter.job = req.query.job;
  if (req.query.status) filter.status = req.query.status;

  const applications = await Application.find(filter)
    .populate('job', 'title')
    .populate('candidate', 'name email phone')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Applications fetched', { applications });
});

const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const allowed = ['applied', 'shortlisted', 'interview', 'hired', 'rejected'];
  if (!allowed.includes(status)) throw new ApiError(400, 'Invalid status');

  const application = await Application.findById(req.params.id).populate(
    'candidate',
    'email name'
  );
  if (!application) throw new ApiError(404, 'Application not found');

  application.status = status;
  if (notes !== undefined) application.notes = notes;
  await application.save();

  await notify({
    to: application.candidate.email,
    message: `Application status updated to ${status}`,
  });

  return success(res, 200, 'Application status updated', { application });
});

const scheduleInterview = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);
  if (!application) throw new ApiError(404, 'Application not found');

  const interview = await Interview.create({
    application: application._id,
    scheduledAt: req.body.scheduledAt,
    mode: req.body.mode,
    location: req.body.location,
    interviewers: req.body.interviewers || [],
    notes: req.body.notes,
  });

  application.status = 'interview';
  await application.save();

  return success(res, 201, 'Interview scheduled', { interview });
});

const rescheduleOrCancelInterview = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.id).populate({
    path: 'application',
    populate: { path: 'candidate' },
  });
  if (!interview) throw new ApiError(404, 'Interview not found');

  const isCandidate =
    String(interview.application.candidate._id) === String(req.user._id);

  if (!isCandidate && !HR_ADMIN.includes(req.user.role)) {
    throw new ApiError(403, 'Not allowed');
  }

  if (req.body.action === 'cancel') {
    interview.status = 'cancelled';
  } else {
    interview.status = 'rescheduled';
    if (req.body.scheduledAt) interview.scheduledAt = req.body.scheduledAt;
    if (req.body.mode) interview.mode = req.body.mode;
    if (req.body.location) interview.location = req.body.location;
  }
  await interview.save();
  return success(res, 200, 'Interview updated', { interview });
});

const submitFeedback = asyncHandler(async (req, res) => {
  const interview = await Interview.findById(req.params.id);
  if (!interview) throw new ApiError(404, 'Interview not found');

  const isInterviewer = interview.interviewers.some(
    (id) => String(id) === String(req.user._id)
  );
  if (!isInterviewer && !HR_ADMIN.includes(req.user.role)) {
    throw new ApiError(403, 'Not assigned as interviewer');
  }

  const feedback = await InterviewFeedback.create({
    interview: interview._id,
    interviewer: req.user._id,
    score: req.body.score,
    comments: req.body.comments,
    recommendation: req.body.recommendation,
  });

  interview.status = 'completed';
  await interview.save();

  return success(res, 201, 'Feedback submitted', { feedback });
});

const hireCandidate = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate(
    'candidate'
  );
  if (!application) throw new ApiError(404, 'Application not found');

  const candidate = await User.findById(application.candidate._id).select(
    '+password'
  );
  if (!candidate) throw new ApiError(404, 'Candidate not found');

  candidate.role = req.body.role || ROLES.EMPLOYEE;
  candidate.department = req.body.department;
  candidate.branch = req.body.branch;
  candidate.manager = req.body.manager;
  candidate.designation = req.body.designation;
  candidate.dateOfJoining = req.body.dateOfJoining || new Date();
  if (!candidate.employeeId) {
    candidate.employeeId = await generateEmployeeId();
  }
  await candidate.save();

  application.status = 'hired';
  await application.save();

  await logAudit({
    actor: req.user._id,
    action: 'recruitment.hire',
    resource: 'User',
    resourceId: candidate._id,
    ip: req.ip,
  });

  await notify({
    to: candidate.email,
    message: 'Congratulations! You have been hired.',
  });

  return success(res, 200, 'Candidate hired and converted to employee', {
    employee: candidate.toSafeObject(),
    application,
  });
});

const myInterviews = asyncHandler(async (req, res) => {
  let filter = {};
  if (req.user.role === ROLES.CANDIDATE) {
    const apps = await Application.find({ candidate: req.user._id }).select('_id');
    filter.application = { $in: apps.map((a) => a._id) };
  } else if (req.user.role === ROLES.MANAGER || req.user.role === ROLES.EMPLOYEE) {
    filter.interviewers = req.user._id;
  }

  const interviews = await Interview.find(filter)
    .populate({
      path: 'application',
      populate: [
        { path: 'candidate', select: 'name email' },
        { path: 'job', select: 'title' },
      ],
    })
    .sort({ scheduledAt: 1 });

  return success(res, 200, 'Interviews fetched', { interviews });
});

export { listJobs,
  createJob,
  updateJob,
  deleteJob,
  applyToJob,
  myApplications,
  listApplications,
  updateApplicationStatus,
  scheduleInterview,
  rescheduleOrCancelInterview,
  submitFeedback,
  hireCandidate,
  myInterviews, };
