import express from 'express';
import { body } from 'express-validator';
import * as ctrl from '../controllers/chatbotController.js';
import { protect } from '../middleware/auth.js';
import validate from '../middleware/validate.js';

const router = express.Router();

router.use(protect);

router.get('/health', ctrl.health);

router.post(
  '/ask',
  [
    body('message')
      .trim()
      .notEmpty()
      .withMessage('message is required')
      .isLength({ max: 4000 })
      .withMessage('message max 4000 characters'),
    body('history').optional().isArray({ max: 20 }),
    body('history.*.role').optional().isIn(['user', 'model', 'assistant']),
    body('history.*.text').optional().isString(),
  ],
  validate,
  ctrl.ask
);

export default router;
