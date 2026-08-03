/**
 * Legacy /api/recruitment shim — delegates to Job / Application controllers
 * where paths overlap. Prefer /api/jobs and /api/applications for new clients.
 */
import express from 'express';
import { body } from 'express-validator';
import * as jobController from '../controllers/jobController.js';
import * as applicationController from '../controllers/applicationController.js';
import { Interview, InterviewFeedback } from '../models/Recruitment.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { ROLES, ALL_ROLES, HR_ADMIN, STAFF_ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(protect);

router.get(
  '/jobs',
  authorize(ROLES.CANDIDATE, ROLES.MANAGER, ...HR_ADMIN),
  jobController.listJobs
);

router.post(
  '/jobs',
  authorize(...HR_ADMIN),
  [
    body('title').notEmpty(),
    body('description').isLength({ min: 30 }),
  ],
  validate,
  jobController.createJob
);
router.patch('/jobs/:id', authorize(...HR_ADMIN), jobController.updateJob);
router.delete('/jobs/:id', authorize(...HR_ADMIN), jobController.closeJob);

router.post(
  '/jobs/:jobId/apply',
  authorize(ROLES.CANDIDATE),
  upload.single('resume'),
  (req, res, next) => {
    req.body.jobId = req.body.jobId || req.params.jobId;
    next();
  },
  applicationController.applyToJob
);

router.get(
  '/applications/me',
  authorize(ROLES.CANDIDATE),
  applicationController.myApplications
);
router.get(
  '/applications',
  authorize(...HR_ADMIN),
  applicationController.listApplications
);
router.patch(
  '/applications/:id/status',
  authorize(...HR_ADMIN),
  asyncHandler(async (req, res, next) => {
    const map = {
      applied: 'review',
      review: 'review',
      shortlisted: 'shortlist',
      rejected: 'reject',
      hired: 'select',
      selected: 'select',
    };
    const action = map[String(req.body.status || '').toLowerCase()];
    if (!action) {
      throw new ApiError(
        400,
        'Use dedicated endpoints or status: review|shortlisted|rejected|selected'
      );
    }
    if (action === 'review') return applicationController.markReview(req, res, next);
    if (action === 'shortlist') return applicationController.shortlist(req, res, next);
    if (action === 'reject') return applicationController.reject(req, res, next);
    if (action === 'select') return applicationController.selectCandidate(req, res, next);
    next();
  })
);

router.post(
  '/applications/:id/interviews',
  authorize(...HR_ADMIN),
  asyncHandler(async (req, res, next) => {
    const modeRaw = req.body.mode;
    req.body.mode =
      modeRaw === 'online' || modeRaw === 'Online'
        ? 'Online'
        : 'Onsite';
    req.body.datetime = req.body.datetime || req.body.scheduledAt;
    req.body.meetingLink = req.body.meetingLink || req.body.location;
    return applicationController.scheduleInterview(req, res, next);
  })
);

router.post(
  '/applications/:id/hire',
  authorize(...HR_ADMIN),
  applicationController.selectCandidate
);

router.patch(
  '/interviews/:id',
  authorize(ROLES.CANDIDATE, ...HR_ADMIN),
  asyncHandler(async (req, res) => {
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
  })
);

router.post(
  '/interviews/:id/feedback',
  authorize(...STAFF_ROLES),
  asyncHandler(async (req, res) => {
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
  })
);

router.get(
  '/interviews/me',
  authorize(...ALL_ROLES),
  asyncHandler(async (req, res) => {
    let filter = {};
    if (req.user.role === ROLES.CANDIDATE) {
      const apps = await (
        await import('../models/Application.js')
      ).default
        .find({ candidate: req.user._id })
        .select('_id');
      filter.application = { $in: apps.map((a) => a._id) };
    } else if (
      req.user.role === ROLES.MANAGER ||
      req.user.role === ROLES.EMPLOYEE
    ) {
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
  })
);

export default router;
