import { body } from 'express-validator';
import express from 'express';
import * as authController from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import { normalizeRole } from '../constants/roles.js';

const router = express.Router();

const roleRule = body('role')
  .notEmpty()
  .withMessage('Role is required')
  .custom((value) => {
    if (!normalizeRole(value)) {
      throw new Error(
        `Role must be one of: Candidate, Employee, Manager, HR, Admin (or lowercase)`
      );
    }
    return true;
  });

router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    roleRule,
  ],
  validate,
  authController.register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    roleRule,
  ],
  validate,
  authController.login
);

router.post(
  '/verify-2fa',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').notEmpty().withMessage('OTP is required'),
    roleRule,
  ],
  validate,
  authController.verify2FA
);

router.post(
  '/forgot-password',
  [body('email').isEmail().withMessage('Valid email is required'), roleRule],
  validate,
  authController.forgotPassword
);

router.post(
  '/verify-otp',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').notEmpty().withMessage('OTP is required'),
    roleRule,
  ],
  validate,
  authController.verifyOtp
);

router.post(
  '/reset-password',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp')
      .optional()
      .notEmpty()
      .withMessage('OTP is required'),
    body('token').optional(),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    roleRule,
    body().custom((_, { req }) => {
      if (!req.body.otp && !req.body.token) {
        throw new Error('OTP is required');
      }
      return true;
    }),
  ],
  validate,
  authController.resetPassword
);

router.get('/me', protect, authController.getMe);
router.post('/logout', protect, authController.logout);
router.post(
  '/change-password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters'),
  ],
  validate,
  authController.changePassword
);
router.patch('/2fa', protect, authController.toggle2FA);

export default router;
