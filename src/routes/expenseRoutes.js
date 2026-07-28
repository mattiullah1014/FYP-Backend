import express from 'express';
import * as expenseController from '../controllers/expenseController.js';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { STAFF_ROLES, MANAGEMENT_ROLES } from '../constants/roles.js';

const router = express.Router();
router.use(protect);

router.post(
  '/',
  authorize(...STAFF_ROLES),
  upload.single('receipt'),
  expenseController.createClaim
);
router.get('/me', authorize(...STAFF_ROLES), expenseController.myClaims);
router.get('/', authorize(...MANAGEMENT_ROLES), expenseController.listClaims);
router.patch(
  '/:id/review',
  authorize(...MANAGEMENT_ROLES),
  expenseController.reviewClaim
);

export default router;
