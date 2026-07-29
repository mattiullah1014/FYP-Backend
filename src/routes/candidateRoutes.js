import express from 'express';
import { body } from 'express-validator';
import * as candidateController from '../controllers/candidateController.js';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(protect);
router.use(authorize(ROLES.CANDIDATE));

router.get('/me/profile', candidateController.getMyProfile);

router.put(
  '/me/profile',
  upload.single('resume'),
  [
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('education').trim().notEmpty().withMessage('Education is required'),
    body('experience').trim().notEmpty().withMessage('Experience is required'),
    body('expectedSalary')
      .trim()
      .notEmpty()
      .withMessage('Expected salary is required'),
    body('coverLetter')
      .trim()
      .notEmpty()
      .withMessage('Cover letter is required'),
    body('linkedin').optional({ values: 'falsy' }).trim(),
    body('preferredLocation').optional({ values: 'falsy' }).trim(),
    body('skills').optional(),
  ],
  validate,
  candidateController.completeProfile
);

export default router;
