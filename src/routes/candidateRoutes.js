import express from 'express';
import { body } from 'express-validator';
import * as candidateController from '../controllers/candidateController.js';
import { protect, authorize } from '../middleware/auth.js';
import { avatarUpload } from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { ROLES } from '../constants/roles.js';
import { CANDIDATE_GENDERS } from '../models/User.js';

const router = express.Router();

router.use(protect);
router.use(authorize(ROLES.CANDIDATE));

router.get('/me/profile', candidateController.getMyProfile);

router.put(
  '/me/avatar',
  avatarUpload.single('avatar'),
  candidateController.uploadAvatar
);

router.delete('/me/avatar', candidateController.removeAvatar);

/**
 * Personal-info CandidateSetup.
 * JSON or multipart (optional field "avatar" for photo).
 */
router.put(
  '/me/profile',
  (req, res, next) => {
    if (req.is('multipart/form-data')) {
      return avatarUpload.single('avatar')(req, res, next);
    }
    return next();
  },
  [
    body('fullName').trim().notEmpty().withMessage('fullName is required'),
    body('phone').trim().notEmpty().withMessage('phone is required'),
    body('dateOfBirth')
      .notEmpty()
      .withMessage('dateOfBirth is required')
      .custom((value) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) {
          throw new Error('dateOfBirth must be a valid date (YYYY-MM-DD)');
        }
        return true;
      }),
    body('gender')
      .trim()
      .notEmpty()
      .withMessage('gender is required')
      .isIn(CANDIDATE_GENDERS)
      .withMessage(`gender must be one of: ${CANDIDATE_GENDERS.join(', ')}`),
    body('cnic').optional({ values: 'falsy' }).trim(),
    body('address').optional(),
    body('street').optional({ values: 'falsy' }).trim(),
    body('city').optional({ values: 'falsy' }).trim(),
    body('state').optional({ values: 'falsy' }).trim(),
    body('zip').optional({ values: 'falsy' }).trim(),
    body('country').optional({ values: 'falsy' }).trim(),
    body('address.street').optional({ values: 'falsy' }).trim(),
    body('address.city').optional({ values: 'falsy' }).trim(),
    body('address.country').optional({ values: 'falsy' }).trim(),
    body().custom((_, { req }) => {
      const a =
        req.body.address && typeof req.body.address === 'object'
          ? req.body.address
          : {};
      const street = String(a.street ?? req.body.street ?? '').trim();
      const city = String(a.city ?? req.body.city ?? '').trim();
      const country = String(a.country ?? req.body.country ?? '').trim();
      if (!street) throw new Error('address.street is required');
      if (!city) throw new Error('address.city is required');
      if (!country) throw new Error('address.country is required');
      return true;
    }),
  ],
  validate,
  candidateController.completeProfile
);

export default router;
