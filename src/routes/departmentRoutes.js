import express from 'express';
import { body } from 'express-validator';
import * as orgController from '../controllers/orgController.js';
import { protect, authorize } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { HR_ADMIN, STAFF_ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(protect);

router.get('/', authorize(...STAFF_ROLES), orgController.listDepartments);
router.post(
  '/',
  authorize(...HR_ADMIN),
  [body('name').notEmpty().withMessage('Name required')],
  validate,
  orgController.createDepartment
);
router.patch('/:id', authorize(...HR_ADMIN), orgController.updateDepartment);
router.delete('/:id', authorize(...HR_ADMIN), orgController.deleteDepartment);

router.get('/branches/list', authorize(...STAFF_ROLES), orgController.listBranches);
router.post(
  '/branches',
  authorize(...HR_ADMIN),
  [body('name').notEmpty().withMessage('Name required')],
  validate,
  orgController.createBranch
);
router.patch('/branches/:id', authorize(...HR_ADMIN), orgController.updateBranch);
router.delete('/branches/:id', authorize(...HR_ADMIN), orgController.deleteBranch);

export default router;
