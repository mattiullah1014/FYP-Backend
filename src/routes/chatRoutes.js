import express from 'express';
import * as ctrl from '../controllers/chatController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/eligible-contacts', ctrl.eligibleContacts);
router.get('/conversations', ctrl.listConversations);
router.post('/conversations', ctrl.createConversation);
router.get('/conversations/:id/messages', ctrl.listMessages);
router.patch('/conversations/:id/read', ctrl.markConversationRead);
router.get('/unread-count', ctrl.unreadCount);

export default router;
