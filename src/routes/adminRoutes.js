import express from 'express';
import * as adminController from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';

const router = express.Router();
router.use(protect);
router.use(authorize(ROLES.ADMIN));

router.get('/users', adminController.listUsers);
router.patch('/users/:id/status', adminController.setUserStatus);
router.post('/users/:id/force-password-reset', adminController.forcePasswordResetFlag);
router.patch('/users/:id/role', adminController.updateRole);
router.delete('/users/purge-deleted', adminController.purgeSoftDeleted);

router.get('/settings', adminController.listSettings);
router.put('/settings', adminController.upsertSetting);
router.get('/audit-logs', adminController.listAuditLogs);

export default router;
