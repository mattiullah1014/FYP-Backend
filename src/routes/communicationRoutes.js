import express from 'express';
import * as communicationController from '../controllers/communicationController.js';
import { protect, authorize } from '../middleware/auth.js';
import { ALL_ROLES,
  MANAGEMENT_ROLES,
  HR_ADMIN,
  ROLES, } from '../constants/roles.js';

const router = express.Router();
router.use(protect);

router.get(
  '/announcements',
  authorize(...ALL_ROLES),
  communicationController.listAnnouncements
);
router.post(
  '/announcements',
  authorize(...MANAGEMENT_ROLES, ROLES.MANAGER),
  communicationController.createAnnouncement
);

router.post('/messages', authorize(...ALL_ROLES), communicationController.sendMessage);
router.get('/messages/inbox', authorize(...ALL_ROLES), communicationController.inbox);
router.get('/messages/sent', authorize(...ALL_ROLES), communicationController.sent);
router.patch(
  '/messages/:id/read',
  authorize(...ALL_ROLES),
  communicationController.markRead
);

export default router;
