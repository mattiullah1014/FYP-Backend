import express from 'express';
import * as reportController from '../controllers/reportController.js';
import { protect, authorize } from '../middleware/auth.js';
import { STAFF_ROLES, MANAGEMENT_ROLES, HR_ADMIN } from '../constants/roles.js';

const router = express.Router();
router.use(protect);

router.get('/me', authorize(...STAFF_ROLES), reportController.myDashboard);
router.get('/team', authorize(...MANAGEMENT_ROLES), reportController.teamDashboard);
router.get('/hr', authorize(...HR_ADMIN), reportController.hrDashboard);

export default router;
