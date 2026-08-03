import express from 'express';
import { body } from 'express-validator';
import * as applicationController from '../controllers/applicationController.js';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';

/**
 * Recruitment Applications API
 * Candidate: apply, me, reschedule, withdraw
 * HR/Admin: list, pipeline, review, shortlist, reject, schedule, select
 */
const router = express.Router();

router.use(protect);

// --- Candidate ---
router.post(
  '/',
  authorize(ROLES.CANDIDATE),
  upload.single('resume'),
  [
    body('jobId').notEmpty().withMessage('jobId is required'),
    body('coverLetter')
      .isLength({ min: 20 })
      .withMessage('coverLetter must be at least 20 characters'),
    body('phone').optional().trim(),
    body('experience').optional().trim(),
    body('education').optional().trim(),
    body('expectedSalary').optional(),
    body('linkedin').optional({ values: 'falsy' }).trim(),
  ],
  validate,
  applicationController.applyToJob
);

router.get(
  '/me',
  authorize(ROLES.CANDIDATE),
  applicationController.myApplications
);

router.get(
  '/shortlisted',
  authorize(...HR_ADMIN),
  applicationController.listShortlisted
);

router.get(
  '/job/:jobId',
  authorize(...HR_ADMIN),
  applicationController.listByJob
);

router.get('/', authorize(...HR_ADMIN), applicationController.listApplications);

router.get(
  '/:id',
  authorize(ROLES.CANDIDATE, ...HR_ADMIN),
  applicationController.getApplication
);

router.post(
  '/:id/reschedule',
  authorize(ROLES.CANDIDATE),
  [body('note').trim().notEmpty().withMessage('note is required')],
  validate,
  applicationController.requestReschedule
);

router.post(
  '/:id/withdraw',
  authorize(ROLES.CANDIDATE),
  applicationController.withdrawApplication
);

// --- HR / Admin pipeline ---
router.patch(
  '/:id/review',
  authorize(...HR_ADMIN),
  applicationController.markReview
);

router.patch(
  '/:id/shortlist',
  authorize(...HR_ADMIN),
  applicationController.shortlist
);

router.patch(
  '/:id/reject',
  authorize(...HR_ADMIN),
  applicationController.reject
);

router.post(
  '/:id/schedule-interview',
  authorize(...HR_ADMIN),
  [
    body('mode')
      .isIn(['Onsite', 'Online'])
      .withMessage('mode must be Onsite or Online'),
    body('datetime').notEmpty().withMessage('datetime is required'),
    body('location').optional().trim(),
    body('meetingLink').optional().trim(),
    body('note').optional().trim(),
  ],
  validate,
  applicationController.scheduleInterview
);

router.post(
  '/:id/select',
  authorize(...HR_ADMIN),
  applicationController.selectCandidate
);

export default router;
