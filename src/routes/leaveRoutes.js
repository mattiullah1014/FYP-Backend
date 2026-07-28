import express from 'express';
import { body } from 'express-validator';
import * as leaveController from '../controllers/leaveController.js';
import { protect, authorize } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { STAFF_ROLES, HR_ADMIN, MANAGEMENT_ROLES } from '../constants/roles.js';

const router = express.Router();
router.use(protect);

router.get('/policies', authorize(...STAFF_ROLES), leaveController.listPolicies);
router.post('/policies', authorize(...HR_ADMIN), leaveController.createPolicy);
router.patch('/policies/:id', authorize(...HR_ADMIN), leaveController.updatePolicy);

router.get('/balances/me', authorize(...STAFF_ROLES), leaveController.getMyBalances);
router.post('/balances', authorize(...HR_ADMIN), leaveController.allocateBalance);

router.post(
  '/requests',
  authorize(...STAFF_ROLES),
  [
    body('leaveType').notEmpty(),
    body('startDate').notEmpty(),
    body('endDate').notEmpty(),
    body('reason').notEmpty(),
  ],
  validate,
  leaveController.requestLeave
);
router.get('/requests/me', authorize(...STAFF_ROLES), leaveController.myLeaves);
router.get('/requests', authorize(...MANAGEMENT_ROLES), leaveController.listLeaveRequests);
router.patch(
  '/requests/:id/review',
  authorize(...MANAGEMENT_ROLES),
  leaveController.reviewLeave
);

export default router;
