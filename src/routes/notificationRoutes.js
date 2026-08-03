import express from 'express';
import * as ctrl from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', ctrl.listMyNotifications);
router.get('/unread-count', ctrl.unreadCount);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:id/read', ctrl.markRead);
router.delete('/:id', ctrl.deleteNotification);

export default router;
