import { Server } from 'socket.io';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import ChatMessage from '../models/ChatMessage.js';
import { verifyToken } from '../utils/tokens.js';
import {
  countUnreadForUser,
  mapMessage,
} from '../controllers/chatController.js';

/**
 * Attach Socket.io to the same HTTP server as Express.
 * Auth: handshake.auth.token (JWT), same verification as protect middleware.
 */
const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id).select('-password');
      if (!user || user.isDeleted) {
        return next(new Error('User not found'));
      }
      if (!user.isActive) {
        return next(new Error('Account is suspended'));
      }

      socket.userId = String(user._id);
      socket.userRole = user.role;
      socket.user = user;
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;

    // Personal room for unread badge updates
    socket.join(`user:${userId}`);

    // Auto-join all conversation rooms the user belongs to
    try {
      const conversations = await Conversation.find({ participants: userId })
        .select('_id')
        .lean();
      conversations.forEach((c) => {
        socket.join(`conversation:${String(c._id)}`);
      });
    } catch (err) {
      console.error('Socket join conversations failed:', err.message);
    }

    socket.on('join', () => {
      socket.join(`user:${userId}`);
    });

    socket.on('conversation:open', async ({ conversationId } = {}) => {
      if (!conversationId) return;
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;
        const isParticipant = conversation.participants.some(
          (p) => String(p) === userId,
        );
        if (!isParticipant) return;
        socket.join(`conversation:${conversationId}`);
      } catch (err) {
        console.error('conversation:open failed:', err.message);
      }
    });

    socket.on('message:send', async (payload = {}, ack) => {
      try {
        const { conversationId, text } = payload;
        const trimmed = String(text || '').trim();
        if (!conversationId || !trimmed) {
          if (typeof ack === 'function') {
            ack({ ok: false, error: 'conversationId and text are required' });
          }
          return;
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (typeof ack === 'function') {
            ack({ ok: false, error: 'Conversation not found' });
          }
          return;
        }

        const isParticipant = conversation.participants.some(
          (p) => String(p) === userId,
        );
        if (!isParticipant) {
          if (typeof ack === 'function') {
            ack({ ok: false, error: 'Not a participant' });
          }
          return;
        }

        const message = await ChatMessage.create({
          conversation: conversation._id,
          sender: userId,
          text: trimmed,
          readBy: [userId],
        });

        conversation.lastMessage = message._id;
        conversation.lastMessageAt = message.createdAt;
        await conversation.save();

        await message.populate('sender', 'name role avatar avatarUrl photo');
        const mapped = mapMessage(message);

        io.to(`conversation:${conversationId}`).emit('message:new', {
          message: mapped,
        });

        // Unread update for other participant(s)
        const others = conversation.participants.filter(
          (p) => String(p) !== userId,
        );
        await Promise.all(
          others.map(async (otherId) => {
            const unreadCount = await countUnreadForUser(otherId);
            io.to(`user:${String(otherId)}`).emit('unread:update', {
              unreadCount,
            });
          }),
        );

        if (typeof ack === 'function') {
          ack({ ok: true, message: mapped });
        }
      } catch (err) {
        console.error('message:send failed:', err.message);
        if (typeof ack === 'function') {
          ack({ ok: false, error: err.message || 'Failed to send' });
        }
      }
    });

    socket.on('typing', ({ conversationId, isTyping } = {}) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit('typing:update', {
        conversationId,
        userId,
        isTyping: Boolean(isTyping),
      });
    });

    socket.on('disconnect', () => {
      // rooms cleaned up automatically
    });
  });

  return io;
};

export default initSocket;
