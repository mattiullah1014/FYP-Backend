import express from 'express';
import { body } from 'express-validator';
import * as managerController from '../controllers/managerController.js';
import { protect, authorize } from '../middleware/auth.js';
import {
  loadManagerProfile,
  requireManagerPermission,
} from '../middleware/managerAuth.js';
import validate from '../middleware/validate.js';
import { ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(protect);
router.use(authorize(ROLES.MANAGER));
router.use(loadManagerProfile);

router.get('/dashboard', managerController.dashboard);

// Team
router.get('/team', managerController.getTeam);
router.post(
  '/team',
  requireManagerPermission('teamManagement'),
  [body('employeeId').notEmpty()],
  validate,
  managerController.addTeamMember
);
router.delete(
  '/team/:employeeId',
  requireManagerPermission('teamManagement'),
  managerController.removeTeamMember
);
router.get(
  '/employees/available',
  requireManagerPermission('teamManagement'),
  managerController.availableEmployees
);

// Tasks
router.get('/tasks', requireManagerPermission('tasks'), managerController.listTasks);
router.post(
  '/tasks',
  requireManagerPermission('tasks'),
  [body('title').notEmpty(), body('assigneeId').notEmpty()],
  validate,
  managerController.createTask
);
router.patch(
  '/tasks/:id',
  requireManagerPermission('tasks'),
  managerController.updateTask
);
router.delete(
  '/tasks/:id',
  requireManagerPermission('tasks'),
  managerController.deleteTask
);

// Approvals
router.get(
  '/approvals',
  requireManagerPermission('approvals'),
  managerController.listApprovals
);
router.patch(
  '/approvals/:type/:id',
  requireManagerPermission('approvals'),
  [body('status').isIn(['approved', 'rejected'])],
  validate,
  managerController.reviewApproval
);

// Performance
router.get(
  '/reviews',
  requireManagerPermission('performance'),
  managerController.listReviews
);
router.post(
  '/reviews',
  requireManagerPermission('performance'),
  [body('employeeId').notEmpty(), body('period').notEmpty()],
  validate,
  managerController.createReview
);
router.get(
  '/reviews/:id/appraisal',
  requireManagerPermission('performance'),
  managerController.getAppraisal
);

// Communication
router.post(
  '/announcements',
  requireManagerPermission('communication'),
  [body('title').notEmpty(), body('body').notEmpty()],
  validate,
  managerController.createAnnouncement
);
router.get(
  '/announcements',
  requireManagerPermission('communication'),
  managerController.listAnnouncements
);
router.post(
  '/messages',
  requireManagerPermission('communication'),
  [body('toEmployeeId').notEmpty(), body('body').notEmpty()],
  validate,
  managerController.sendMessage
);

// Reports
router.get(
  '/reports/overview',
  requireManagerPermission('reports'),
  managerController.reportOverview
);
router.get(
  '/reports/attendance',
  requireManagerPermission('reports'),
  managerController.reportAttendance
);
router.get(
  '/reports/productivity',
  requireManagerPermission('reports'),
  managerController.reportProductivity
);
router.get(
  '/reports/performance',
  requireManagerPermission('reports'),
  managerController.reportPerformance
);

export default router;
