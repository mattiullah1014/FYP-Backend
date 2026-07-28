import express from 'express';
import * as attendanceController from '../controllers/attendanceController.js';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES, STAFF_ROLES, HR_ADMIN, MANAGEMENT_ROLES } from '../constants/roles.js';

const router = express.Router();
router.use(protect);

router.post('/clock-in', authorize(...STAFF_ROLES), attendanceController.clockIn);
router.post('/clock-out', authorize(...STAFF_ROLES), attendanceController.clockOut);
router.post('/late-reason', authorize(...STAFF_ROLES), attendanceController.submitLateReason);
router.get('/me', authorize(...STAFF_ROLES), attendanceController.myAttendance);
router.get('/team', authorize(...MANAGEMENT_ROLES), attendanceController.teamAttendance);
router.patch('/:id/adjust', authorize(...MANAGEMENT_ROLES), attendanceController.adjustAttendance);

router.get('/shifts', authorize(...STAFF_ROLES), attendanceController.listShifts);
router.post('/shifts', authorize(...HR_ADMIN), attendanceController.upsertShift);
router.patch('/shifts/:id', authorize(...HR_ADMIN), attendanceController.upsertShift);

router.get('/holidays', authorize(...STAFF_ROLES), attendanceController.listHolidays);
router.post('/holidays', authorize(...HR_ADMIN), attendanceController.createHoliday);

export default router;
