import express from 'express';
import { body } from 'express-validator';
import * as adminController from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { ROLES } from '../constants/roles.js';

const router = express.Router();
router.use(protect);
router.use(authorize(ROLES.ADMIN));

router.get('/dashboard', adminController.adminDashboard);

router.get('/users', adminController.listUsers);
router.delete('/users/purge-deleted', adminController.purgeSoftDeleted);
router.get('/users/:id', adminController.getUser);
router.patch('/users/:id', adminController.updateUser);
router.patch('/users/:id/status', adminController.setUserStatus);
router.post('/users/:id/force-password-reset', adminController.forcePasswordResetFlag);
router.patch('/users/:id/role', adminController.updateRole);
router.delete('/users/:id', adminController.softDeleteUser);

router.get('/candidates', adminController.listCandidates);
router.post(
  '/candidates',
  [
    body('name').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
  ],
  validate,
  adminController.createCandidate
);
router.patch('/candidates/:id', adminController.updateCandidate);
router.delete('/candidates/:id', adminController.deleteCandidate);

router.get('/hr-users', adminController.listHrUsers);
router.post(
  '/hr-users',
  [
    body('name').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
  ],
  validate,
  adminController.createHrUser
);
router.patch('/hr-users/:id', adminController.updateHrUser);
router.delete('/hr-users/:id', adminController.deleteHrUser);

router.get('/settings', adminController.listSettings);
router.put('/settings', adminController.upsertSetting);
router.get('/audit-logs', adminController.listAuditLogs);

export default router;
