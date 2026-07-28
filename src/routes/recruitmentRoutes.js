import express from 'express';
import { body } from 'express-validator';
import * as recruitmentController from '../controllers/recruitmentController.js';
import { protect, authorize } from '../middleware/auth.js';
import optionalProtect from '../middleware/optionalAuth.js';
import upload from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { ROLES,
  ALL_ROLES,
  HR_ADMIN,
  STAFF_ROLES, } from '../constants/roles.js';

const router = express.Router();

router.get('/jobs', optionalProtect, recruitmentController.listJobs);

router.use(protect);

router.post(
  '/jobs',
  authorize(...HR_ADMIN),
  [body('title').notEmpty(), body('description').notEmpty()],
  validate,
  recruitmentController.createJob
);
router.patch('/jobs/:id', authorize(...HR_ADMIN), recruitmentController.updateJob);
router.delete('/jobs/:id', authorize(...HR_ADMIN), recruitmentController.deleteJob);

router.post(
  '/jobs/:jobId/apply',
  authorize(ROLES.CANDIDATE),
  upload.single('resume'),
  recruitmentController.applyToJob
);
router.get(
  '/applications/me',
  authorize(ROLES.CANDIDATE),
  recruitmentController.myApplications
);
router.get(
  '/applications',
  authorize(...HR_ADMIN),
  recruitmentController.listApplications
);
router.patch(
  '/applications/:id/status',
  authorize(...HR_ADMIN),
  recruitmentController.updateApplicationStatus
);
router.post(
  '/applications/:id/interviews',
  authorize(...HR_ADMIN),
  recruitmentController.scheduleInterview
);
router.patch(
  '/interviews/:id',
  authorize(ROLES.CANDIDATE, ...HR_ADMIN),
  recruitmentController.rescheduleOrCancelInterview
);
router.post(
  '/interviews/:id/feedback',
  authorize(...STAFF_ROLES),
  recruitmentController.submitFeedback
);
router.post(
  '/applications/:id/hire',
  authorize(...HR_ADMIN),
  recruitmentController.hireCandidate
);
router.get(
  '/interviews/me',
  authorize(...ALL_ROLES),
  recruitmentController.myInterviews
);

export default router;
