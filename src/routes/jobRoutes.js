import express from 'express';
import { body } from 'express-validator';
import * as jobController from '../controllers/jobController.js';
import { protect, authorize } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';
import { JOB_DEPARTMENTS, JOB_TYPES } from '../models/Job.js';

/**
 * Recruitment Jobs API
 * POST/PATCH/close → hr|admin
 * GET list/detail → candidate|hr|admin|manager
 */
const router = express.Router();

router.use(protect);

router.post(
  '/',
  authorize(...HR_ADMIN),
  [
    body('title').trim().notEmpty().withMessage('title is required'),
    body('department')
      .isIn(JOB_DEPARTMENTS)
      .withMessage(`department must be one of: ${JOB_DEPARTMENTS.join(', ')}`),
    body('location').trim().notEmpty().withMessage('location is required'),
    body('types')
      .custom((value) => {
        const arr = Array.isArray(value)
          ? value
          : typeof value === 'string'
            ? (() => {
                try {
                  const p = JSON.parse(value);
                  return Array.isArray(p) ? p : value.split(',');
                } catch {
                  return value.split(',');
                }
              })()
            : [];
        if (!arr.length) throw new Error('types must have at least 1 value');
        const invalid = arr
          .map((t) => String(t).trim())
          .filter((t) => t && !JOB_TYPES.includes(t));
        if (invalid.length) {
          throw new Error(`Invalid types: ${invalid.join(', ')}`);
        }
        return true;
      }),
    body('description')
      .isLength({ min: 30 })
      .withMessage('description must be at least 30 characters'),
    body('requirements').custom((value) => {
      const has =
        (Array.isArray(value) && value.length > 0) ||
        (typeof value === 'string' && value.trim().length > 0);
      if (!has) throw new Error('requirements is required (array or newlines)');
      return true;
    }),
    body('salaryMin').optional().isNumeric(),
    body('salaryMax').optional().isNumeric(),
  ],
  validate,
  jobController.createJob
);

router.get(
  '/',
  authorize(ROLES.CANDIDATE, ROLES.MANAGER, ...HR_ADMIN),
  jobController.listJobs
);

router.get(
  '/:id',
  authorize(ROLES.CANDIDATE, ROLES.MANAGER, ROLES.EMPLOYEE, ...HR_ADMIN),
  jobController.getJob
);

router.patch('/:id', authorize(...HR_ADMIN), jobController.updateJob);

router.patch('/:id/close', authorize(...HR_ADMIN), jobController.closeJob);

export default router;
