import express from 'express';
import { body } from 'express-validator';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import * as ctrl from '../controllers/settingsController.js';

const router = express.Router();

router.use(protect);

router.get('/notifications', ctrl.getNotificationPreferences);
router.patch(
  '/notifications',
  [
    body('emailAlerts')
      .isBoolean({ strict: true })
      .withMessage('emailAlerts must be a boolean'),
  ],
  validate,
  ctrl.updateNotificationPreferences
);

export default router;
