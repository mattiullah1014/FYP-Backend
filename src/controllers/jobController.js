import Job, { JOB_DEPARTMENTS, JOB_TYPES } from '../models/Job.js';
import Application from '../models/Application.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { HR_ADMIN, ROLES } from '../constants/roles.js';
import {
  enrichJob,
  parseRequirements,
  parseTypes,
} from '../utils/recruitmentHelpers.js';
import { logAudit } from '../services/auditService.js';

const createJob = asyncHandler(async (req, res) => {
  const types = parseTypes(req.body.types);
  const requirements = parseRequirements(req.body.requirements);

  if (types.length < 1) {
    throw new ApiError(400, 'At least one employment type is required', [
      'types',
    ]);
  }
  if (requirements.length < 1) {
    throw new ApiError(400, 'At least one requirement is required', [
      'requirements',
    ]);
  }

  const invalidTypes = types.filter((t) => !JOB_TYPES.includes(t));
  if (invalidTypes.length) {
    throw new ApiError(
      400,
      `Invalid types: ${invalidTypes.join(', ')}. Allowed: ${JOB_TYPES.join(', ')}`
    );
  }

  if (req.body.department && !JOB_DEPARTMENTS.includes(req.body.department)) {
    throw new ApiError(
      400,
      `Invalid department. Allowed: ${JOB_DEPARTMENTS.join(', ')}`
    );
  }

  const skills =
    parseRequirements(req.body.skills).length > 0
      ? parseRequirements(req.body.skills)
      : requirements.slice(0, 3);

  const job = await Job.create({
    title: req.body.title,
    company: req.body.company || 'Brilliance Base',
    department: req.body.department,
    location: req.body.location,
    types,
    salaryMin: req.body.salaryMin != null ? Number(req.body.salaryMin) : undefined,
    salaryMax: req.body.salaryMax != null ? Number(req.body.salaryMax) : undefined,
    currency: req.body.currency || 'USD',
    description: req.body.description,
    requirements,
    skills,
    closesAt: req.body.closesAt || undefined,
    branch: req.body.branch || undefined,
    status: 'Active',
    postedBy: req.user._id,
  });

  await logAudit({
    actor: req.user._id,
    action: 'job.create',
    resource: 'Job',
    resourceId: job._id,
    ip: req.ip,
  });

  return success(res, 201, 'Job posted', { job: enrichJob(job, 0) });
});

const listJobs = asyncHandler(async (req, res) => {
  const filter = {};
  const isHr = HR_ADMIN.includes(req.user?.role);
  const isManager = req.user?.role === ROLES.MANAGER;

  if (req.query.status) {
    filter.status = req.query.status;
  } else if (!isHr && !isManager) {
    filter.status = 'Active';
  }

  if (req.query.department) filter.department = req.query.department;

  if (req.query.search) {
    const q = new RegExp(req.query.search, 'i');
    filter.$or = [{ title: q }, { location: q }, { description: q }];
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [jobs, total] = await Promise.all([
    Job.find(filter)
      .populate('postedBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Job.countDocuments(filter),
  ]);

  const jobIds = jobs.map((j) => j._id);
  const counts = await Application.aggregate([
    {
      $match: {
        job: { $in: jobIds },
        status: { $ne: 'Withdrawn' },
      },
    },
    { $group: { _id: '$job', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(
    counts.map((c) => [String(c._id), c.count])
  );

  const enriched = jobs.map((j) =>
    enrichJob(j, countMap[String(j._id)] || 0)
  );

  return success(res, 200, 'Jobs fetched', {
    jobs: enriched,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

const getJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id).populate(
    'postedBy',
    'name email role'
  );
  if (!job) throw new ApiError(404, 'Job not found');

  const applicantsCount = await Application.countDocuments({
    job: job._id,
    status: { $ne: 'Withdrawn' },
  });

  return success(res, 200, 'Job fetched', {
    job: enrichJob(job, applicantsCount),
  });
});

const updateJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw new ApiError(404, 'Job not found');

  const allowed = [
    'title',
    'company',
    'department',
    'location',
    'salaryMin',
    'salaryMax',
    'currency',
    'description',
    'closesAt',
    'branch',
    'status',
  ];

  allowed.forEach((key) => {
    if (req.body[key] !== undefined) job[key] = req.body[key];
  });

  if (req.body.types !== undefined) {
    const types = parseTypes(req.body.types);
    if (types.length < 1) {
      throw new ApiError(400, 'At least one employment type is required');
    }
    job.types = types;
  }

  if (req.body.requirements !== undefined) {
    const requirements = parseRequirements(req.body.requirements);
    if (requirements.length < 1) {
      throw new ApiError(400, 'At least one requirement is required');
    }
    job.requirements = requirements;
  }

  if (req.body.skills !== undefined) {
    job.skills = parseRequirements(req.body.skills);
  }

  await job.save();

  return success(res, 200, 'Job updated', { job: enrichJob(job) });
});

const closeJob = asyncHandler(async (req, res) => {
  const job = await Job.findByIdAndUpdate(
    req.params.id,
    { status: 'Closed' },
    { new: true, runValidators: true }
  );
  if (!job) throw new ApiError(404, 'Job not found');

  await logAudit({
    actor: req.user._id,
    action: 'job.close',
    resource: 'Job',
    resourceId: job._id,
    ip: req.ip,
  });

  return success(res, 200, 'Job closed', { job: enrichJob(job) });
});

export { createJob, listJobs, getJob, updateJob, closeJob };
