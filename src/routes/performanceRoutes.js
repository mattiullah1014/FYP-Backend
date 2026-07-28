import express from 'express';
import * as performanceController from '../controllers/performanceController.js';
import { protect, authorize } from '../middleware/auth.js';
import { STAFF_ROLES, MANAGEMENT_ROLES, HR_ADMIN } from '../constants/roles.js';

const router = express.Router();
router.use(protect);

router.post('/goals', authorize(...STAFF_ROLES), performanceController.createGoal);
router.get('/goals', authorize(...STAFF_ROLES), performanceController.listGoals);
router.patch('/goals/:id', authorize(...STAFF_ROLES), performanceController.updateGoal);

router.post('/reviews', authorize(...MANAGEMENT_ROLES), performanceController.createReview);
router.get('/reviews', authorize(...STAFF_ROLES), performanceController.listReviews);
router.patch(
  '/reviews/:id/self-assessment',
  authorize(...STAFF_ROLES),
  performanceController.submitSelfAssessment
);
router.patch(
  '/reviews/:id/complete',
  authorize(...MANAGEMENT_ROLES),
  performanceController.completeReview
);

export default router;
