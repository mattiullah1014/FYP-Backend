import express from 'express';
import { body } from 'express-validator';
import * as employeeController from '../controllers/employeeController.js';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { ROLES, STAFF_ROLES, HR_ADMIN, MANAGEMENT_ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(protect);

router.get('/', authorize(...STAFF_ROLES), employeeController.listEmployees);
router.get('/team/mine', authorize(ROLES.MANAGER, ...HR_ADMIN), employeeController.getTeam);
router.get('/:id', authorize(...STAFF_ROLES), employeeController.getEmployee);

router.post(
  '/',
  authorize(...HR_ADMIN),
  [
    body('name').notEmpty().withMessage('Name required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('role').notEmpty().withMessage('Role required'),
  ],
  validate,
  employeeController.createEmployee
);

router.patch('/:id', authorize(...STAFF_ROLES), employeeController.updateEmployee);
router.delete('/:id', authorize(...HR_ADMIN), employeeController.softDeleteEmployee);

router.post(
  '/:id/documents',
  authorize(...STAFF_ROLES),
  upload.single('file'),
  employeeController.uploadDocument
);

router.post(
  '/:id/photo',
  authorize(...STAFF_ROLES),
  upload.single('photo'),
  employeeController.uploadPhoto
);

export default router;
