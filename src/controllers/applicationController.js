import mongoose from 'mongoose';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import Employee, { generateEmpId } from '../models/Employee.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { HR_ADMIN, ROLES } from '../constants/roles.js';
import {
  formatInterviewMessage,
  saveResumeFile,
} from '../utils/recruitmentHelpers.js';
import { notify } from '../services/notificationService.js';
import { notifyHrAdmin } from '../utils/approvalNotify.js';
import { logAudit } from '../services/auditService.js';
import { buildFullEmployeeDto } from '../utils/hrEmployeeHelpers.js';
import { getOrCreateProfileCompletion } from '../utils/profileCompletion.js';

const JOB_POPULATE =
  'title company department location types status salaryMin salaryMax currency';

const assertOwnOrHr = (application, user) => {
  const isOwner = String(application.candidate) === String(user._id);
  if (!isOwner && !HR_ADMIN.includes(user.role)) {
    throw new ApiError(403, 'Not allowed to access this application');
  }
};

const applyToJob = asyncHandler(async (req, res) => {
  const jobId = req.body.jobId || req.body.job;
  if (!jobId) throw new ApiError(400, 'jobId is required');

  const job = await Job.findById(jobId);
  if (!job || job.status !== 'Active') {
    throw new ApiError(404, 'Job not available');
  }

  const existing = await Application.findOne({
    job: job._id,
    candidate: req.user._id,
    status: { $ne: 'Withdrawn' },
  });
  if (existing) {
    throw new ApiError(409, 'You have already applied to this job');
  }

  const coverLetter = String(req.body.coverLetter || '').trim();
  if (coverLetter.length < 20) {
    throw new ApiError(400, 'Cover letter must be at least 20 characters');
  }

  let resume = undefined;
  if (req.file) {
    resume = await saveResumeFile(req.file);
  } else if (req.user.resume?.url) {
    resume = {
      name: req.user.resume.originalName || 'resume',
      url: req.user.resume.url,
      mimeType: undefined,
      size: undefined,
    };
  }

  const application = await Application.create({
    job: job._id,
    candidate: req.user._id,
    candidateName: req.user.name,
    candidateEmail: req.user.email,
    phone: req.body.phone || req.user.phone,
    experience: req.body.experience || req.user.experience,
    education: req.body.education || req.user.education,
    expectedSalary: req.body.expectedSalary || req.user.expectedSalary,
    linkedin: req.body.linkedin || req.user.linkedin,
    coverLetter,
    resume,
    status: 'Applied',
  });

  await notify({
    to: req.user.email,
    userId: req.user._id,
    channel: 'email',
    subject: 'Application submitted',
    message: `Application submitted for ${job.title}`,
    type: 'success',
  });

  await notifyHrAdmin({
    senderId: req.user._id,
    title: 'New job application',
    message: `${req.user.name} applied for ${job.title}`,
    type: 'info',
  });

  return success(res, 201, 'Application submitted', { application });
});

const myApplications = asyncHandler(async (req, res) => {
  const applications = await Application.find({ candidate: req.user._id })
    .populate('job', JOB_POPULATE)
    .sort({ createdAt: -1 });

  return success(res, 200, 'Applications fetched', { applications });
});

const getApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id)
    .populate('job', JOB_POPULATE)
    .populate('candidate', 'name email phone role');

  if (!application) throw new ApiError(404, 'Application not found');
  assertOwnOrHr(application, req.user);

  return success(res, 200, 'Application fetched', { application });
});

const requestReschedule = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);
  if (!application) throw new ApiError(404, 'Application not found');

  if (String(application.candidate) !== String(req.user._id)) {
    throw new ApiError(403, 'Not allowed');
  }
  if (application.status !== 'Interview') {
    throw new ApiError(400, 'Reschedule only allowed when status is Interview');
  }

  const note = String(req.body.note || '').trim();
  if (!note) throw new ApiError(400, 'note is required');

  application.rescheduleRequest = { note, requestedAt: new Date() };
  await application.save();

  return success(res, 200, 'Reschedule requested', { application });
});

const withdrawApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);
  if (!application) throw new ApiError(404, 'Application not found');

  if (String(application.candidate) !== String(req.user._id)) {
    throw new ApiError(403, 'Not allowed');
  }
  if (application.status === 'Selected') {
    throw new ApiError(400, 'Cannot withdraw a Selected application');
  }
  if (application.status === 'Withdrawn') {
    throw new ApiError(400, 'Application already withdrawn');
  }

  application.status = 'Withdrawn';
  await application.save();

  return success(res, 200, 'Application withdrawn', { application });
});

const listApplications = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.jobId || req.query.job) {
    filter.job = req.query.jobId || req.query.job;
  }
  if (req.query.status) filter.status = req.query.status;

  if (req.query.search) {
    const q = new RegExp(req.query.search, 'i');
    filter.$or = [{ candidateName: q }, { candidateEmail: q }];
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [applications, total] = await Promise.all([
    Application.find(filter)
      .populate('job', JOB_POPULATE)
      .populate('candidate', 'name email phone role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Application.countDocuments(filter),
  ]);

  return success(res, 200, 'Applications fetched', {
    applications,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

const listByJob = asyncHandler(async (req, res) => {
  const applications = await Application.find({ job: req.params.jobId })
    .populate('job', JOB_POPULATE)
    .populate('candidate', 'name email phone')
    .sort({ createdAt: -1 });

  return success(res, 200, 'Job applications fetched', { applications });
});

const listShortlisted = asyncHandler(async (req, res) => {
  const applications = await Application.find({
    status: { $in: ['Shortlisted', 'Interview'] },
  })
    .populate('job', JOB_POPULATE)
    .populate('candidate', 'name email phone')
    .sort({ updatedAt: -1 });

  return success(res, 200, 'Shortlisted applications fetched', {
    applications,
  });
});

const markReview = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate(
    'candidate',
    'email name'
  );
  if (!application) throw new ApiError(404, 'Application not found');

  if (application.status !== 'Applied') {
    throw new ApiError(400, 'Can only mark Review from Applied');
  }

  application.status = 'Review';
  if (req.body?.note !== undefined) application.reviewNote = req.body.note;
  await application.save();

  const reviewTo =
    application.candidate?.email || application.candidateEmail;
  if (reviewTo) {
    await notify({
      to: reviewTo,
      userId: application.candidate?._id,
      channel: 'email',
      subject: 'Application under review',
      message: 'Your application is under review',
      type: 'info',
    });
  }

  return success(res, 200, 'Marked as Review', { application });
});

const shortlist = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate(
    'candidate',
    'email name'
  );
  if (!application) throw new ApiError(404, 'Application not found');

  if (!['Applied', 'Review'].includes(application.status)) {
    throw new ApiError(400, 'Shortlist allowed from Applied or Review only');
  }

  application.status = 'Shortlisted';
  if (req.body?.note !== undefined) application.reviewNote = req.body.note;
  await application.save();

  const shortlistTo =
    application.candidate?.email || application.candidateEmail;
  if (shortlistTo) {
    await notify({
      to: shortlistTo,
      userId: application.candidate?._id,
      channel: 'email',
      subject: 'You have been shortlisted',
      message: 'Congratulations! You have been shortlisted',
      type: 'success',
    });
  }

  return success(res, 200, 'Candidate shortlisted', { application });
});

const reject = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate(
    'candidate',
    'email name'
  );
  if (!application) throw new ApiError(404, 'Application not found');

  if (['Selected', 'Withdrawn'].includes(application.status)) {
    throw new ApiError(400, `Cannot reject when status is ${application.status}`);
  }

  application.status = 'Rejected';
  if (req.body?.note !== undefined) application.reviewNote = req.body.note;
  await application.save();

  const rejectTo =
    application.candidate?.email || application.candidateEmail;
  if (rejectTo) {
    await notify({
      to: rejectTo,
      userId: application.candidate?._id,
      channel: 'email',
      subject: 'Application update',
      message: 'Your application was not selected at this time',
      type: 'warning',
    });
  }

  return success(res, 200, 'Application rejected', { application });
});

const scheduleInterview = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate(
    'candidate',
    'email name'
  );
  if (!application) throw new ApiError(404, 'Application not found');

  if (!['Shortlisted', 'Interview'].includes(application.status)) {
    throw new ApiError(
      400,
      'Interview can be scheduled from Shortlisted or Interview (reschedule)'
    );
  }

  const { mode, datetime, location, meetingLink, note } = req.body;
  if (!['Onsite', 'Online'].includes(mode)) {
    throw new ApiError(400, 'mode must be Onsite or Online');
  }
  if (!datetime) throw new ApiError(400, 'datetime is required');

  if (mode === 'Onsite' && !String(location || '').trim()) {
    throw new ApiError(400, 'location is required for Onsite interviews');
  }
  if (mode === 'Online' && !String(meetingLink || '').trim()) {
    throw new ApiError(400, 'meetingLink is required for Online interviews');
  }

  const message = formatInterviewMessage({
    mode,
    datetime,
    location,
    meetingLink,
  });

  application.interview = {
    mode,
    datetime: new Date(datetime),
    location: mode === 'Onsite' ? location : undefined,
    meetingLink: mode === 'Online' ? meetingLink : undefined,
    message: note ? `${message} Note: ${note}` : message,
  };
  application.status = 'Interview';
  application.rescheduleRequest = null;
  await application.save();

  await notify({
    to: application.candidate.email,
    userId: application.candidate._id,
    channel: 'email',
    subject: 'Interview scheduled',
    message: application.interview.message,
    type: 'info',
  });

  return success(res, 200, 'Interview scheduled', { application });
});

const selectCandidate = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate(
    'job'
  );
  if (!application) throw new ApiError(404, 'Application not found');

  if (application.status !== 'Interview') {
    throw new ApiError(400, 'Select is only allowed after Interview');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  let employee;
  let user;

  try {
    application.status = 'Selected';
    await application.save({ session });

    user = await User.findById(application.candidate).session(session);
    if (!user) throw new ApiError(404, 'Candidate user not found');

    user.role = ROLES.EMPLOYEE;
    user.designation = application.job?.title || user.designation;
    user.dateOfJoining = user.dateOfJoining || new Date();
    user.profileCompleted = true;
    user.isActive = true;
    user.isDeleted = false;
    if (!user.profileCompletedAt) user.profileCompletedAt = new Date();
    if (application.phone) user.phone = application.phone;

    employee = await Employee.findOne({ user: user._id }).session(session);
    if (!employee) {
      const empId = await generateEmpId(session);
      user.employeeId = empId;
      await user.save({ session });

      const created = await Employee.create(
        [
          {
            user: user._id,
            empId,
            name: user.name,
            email: user.email,
            phone: user.phone || application.phone,
            designation: application.job?.title,
            department: application.job?.department,
            role: 'Employee',
            joinedAt: user.dateOfJoining || new Date(),
            status: 'Active',
            isActive: true,
            fromApplication: application._id,
          },
        ],
        { session }
      );
      employee = created[0];
    } else {
      user.employeeId = user.employeeId || employee.empId;
      await user.save({ session });
      employee.status = 'Active';
      employee.isActive = true;
      employee.fromApplication = application._id;
      employee.designation = application.job?.title || employee.designation;
      employee.department = application.job?.department || employee.department;
      employee.role = employee.role || 'Employee';
      employee.name = user.name;
      employee.email = user.email;
      employee.phone = user.phone || application.phone || employee.phone;
      await employee.save({ session });
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  await getOrCreateProfileCompletion(user._id);

  await logAudit({
    actor: req.user._id,
    action: 'application.select',
    resource: 'Application',
    resourceId: application._id,
    ip: req.ip,
    meta: { empId: employee.empId, userId: user._id },
  });

  await notify({
    to: user.email,
    userId: user._id,
    channel: 'email',
    subject: 'Selected — welcome aboard',
    message:
      'Congratulations! You have been selected and converted to an employee.',
    type: 'success',
  });

  const employeeDto = await buildFullEmployeeDto(employee);

  return success(res, 200, 'Candidate selected and hired', {
    application,
    employee: employeeDto,
    user: user.toSafeObject(),
  });
});

export {
  applyToJob,
  myApplications,
  getApplication,
  requestReschedule,
  withdrawApplication,
  listApplications,
  listByJob,
  listShortlisted,
  markReview,
  shortlist,
  reject,
  scheduleInterview,
  selectCandidate,
};
