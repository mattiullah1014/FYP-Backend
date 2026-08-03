import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import ChatMessage from '../models/ChatMessage.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import {
  canStartConversation,
  getEligibleContacts,
  mapContact,
} from '../utils/chatPermissions.js';

const toId = (v) => String(v?._id || v);

const mapMessage = (m) => ({
  id: toId(m),
  conversationId: toId(m.conversation),
  senderId: toId(m.sender?._id || m.sender),
  sender: m.sender?._id
    ? mapContact(m.sender)
    : { id: toId(m.sender) },
  text: m.text,
  readBy: (m.readBy || []).map(toId),
  createdAt: m.createdAt,
});

/**
 * Total unread messages across all conversations for a user
 * (messages not sent by them and not in their readBy).
 */
export const countUnreadForUser = async (userId) => {
  const conversations = await Conversation.find({
    participants: userId,
  })
    .select('_id')
    .lean();
  if (!conversations.length) return 0;

  const ids = conversations.map((c) => c._id);
  return ChatMessage.countDocuments({
    conversation: { $in: ids },
    sender: { $ne: userId },
    readBy: { $ne: userId },
  });
};

/** GET /chat/eligible-contacts */
export const eligibleContacts = asyncHandler(async (req, res) => {
  const contacts = await getEligibleContacts(req.user);
  return success(res, 200, 'Eligible contacts', { contacts });
});

/** GET /chat/conversations */
export const listConversations = asyncHandler(async (req, res) => {
  const me = req.user._id;

  const conversations = await Conversation.find({ participants: me })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .populate('participants', 'name role avatar avatarUrl photo isActive isDeleted')
    .populate({
      path: 'lastMessage',
      select: 'text sender createdAt readBy',
    })
    .lean();

  const conversationIds = conversations.map((c) => c._id);

  const unreadAgg = conversationIds.length
    ? await ChatMessage.aggregate([
        {
          $match: {
            conversation: { $in: conversationIds },
            sender: { $ne: me },
            readBy: { $ne: me },
          },
        },
        { $group: { _id: '$conversation', count: { $sum: 1 } } },
      ])
    : [];

  const unreadMap = Object.fromEntries(
    unreadAgg.map((r) => [String(r._id), r.count]),
  );

  const items = conversations.map((c) => {
    const other = (c.participants || []).find(
      (p) => String(p._id) !== String(me),
    );
    return {
      id: String(c._id),
      otherParticipant: mapContact(other),
      lastMessage: c.lastMessage
        ? {
            id: String(c.lastMessage._id),
            text: c.lastMessage.text,
            senderId: String(c.lastMessage.sender),
            createdAt: c.lastMessage.createdAt,
          }
        : null,
      lastMessageAt: c.lastMessageAt || c.updatedAt || c.createdAt,
      unreadCount: unreadMap[String(c._id)] || 0,
      createdAt: c.createdAt,
    };
  });

  return success(res, 200, 'Conversations fetched', { conversations: items });
});

/** POST /chat/conversations  body: { recipientId } */
export const createConversation = asyncHandler(async (req, res) => {
  const { recipientId } = req.body || {};
  if (!recipientId || !mongoose.isValidObjectId(recipientId)) {
    throw new ApiError(400, 'Valid recipientId is required');
  }

  if (String(recipientId) === String(req.user._id)) {
    throw new ApiError(400, 'Cannot start a conversation with yourself');
  }

  const recipient = await User.findById(recipientId);
  if (!recipient || recipient.isDeleted) {
    throw new ApiError(404, 'Recipient not found');
  }
  if (!recipient.isActive) {
    throw new ApiError(400, 'Recipient account is inactive');
  }

  const allowed = await canStartConversation(req.user, recipient);
  if (!allowed) {
    throw new ApiError(
      403,
      'You are not allowed to start a conversation with this user',
    );
  }

  // Find existing 1:1 (exactly these two participants)
  let conversation = await Conversation.findOne({
    participants: { $all: [req.user._id, recipient._id], $size: 2 },
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [req.user._id, recipient._id],
    });
  }

  await conversation.populate([
    { path: 'participants', select: 'name role avatar avatarUrl photo' },
    { path: 'lastMessage', select: 'text sender createdAt' },
  ]);

  const other = conversation.participants.find(
    (p) => String(p._id) !== String(req.user._id),
  );

  let unreadCount = 0;
  if (conversation.lastMessage) {
    unreadCount = await ChatMessage.countDocuments({
      conversation: conversation._id,
      sender: { $ne: req.user._id },
      readBy: { $ne: req.user._id },
    });
  }

  return success(res, 200, 'Conversation ready', {
    conversation: {
      id: String(conversation._id),
      otherParticipant: mapContact(other),
      lastMessage: conversation.lastMessage
        ? {
            id: String(conversation.lastMessage._id),
            text: conversation.lastMessage.text,
            senderId: String(conversation.lastMessage.sender),
            createdAt: conversation.lastMessage.createdAt,
          }
        : null,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount,
      createdAt: conversation.createdAt,
    },
  });
});

/** GET /chat/conversations/:id/messages?before=&page=&limit= */
export const listMessages = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, 'Invalid conversation id');
  }

  const conversation = await Conversation.findById(id);
  if (!conversation) throw new ApiError(404, 'Conversation not found');

  const isParticipant = conversation.participants.some(
    (p) => String(p) === String(req.user._id),
  );
  if (!isParticipant) {
    throw new ApiError(403, 'Not a participant of this conversation');
  }

  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
  const filter = { conversation: conversation._id };

  if (req.query.before && mongoose.isValidObjectId(req.query.before)) {
    const beforeMsg = await ChatMessage.findById(req.query.before).select(
      'createdAt',
    );
    if (beforeMsg) {
      filter.createdAt = { $lt: beforeMsg.createdAt };
    }
  } else {
    const page = Math.max(1, Number(req.query.page) || 1);
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      ChatMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'name role avatar avatarUrl photo')
        .lean(),
      ChatMessage.countDocuments(filter),
    ]);

    return success(res, 200, 'Messages fetched', {
      messages: rows.reverse().map(mapMessage),
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + rows.length < total,
      },
    });
  }

  const rows = await ChatMessage.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'name role avatar avatarUrl photo')
    .lean();

  return success(res, 200, 'Messages fetched', {
    messages: rows.reverse().map(mapMessage),
    pagination: {
      limit,
      hasMore: rows.length === limit,
    },
  });
});

/** PATCH /chat/conversations/:id/read */
export const markConversationRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, 'Invalid conversation id');
  }

  const conversation = await Conversation.findById(id);
  if (!conversation) throw new ApiError(404, 'Conversation not found');

  const isParticipant = conversation.participants.some(
    (p) => String(p) === String(req.user._id),
  );
  if (!isParticipant) {
    throw new ApiError(403, 'Not a participant of this conversation');
  }

  await ChatMessage.updateMany(
    {
      conversation: conversation._id,
      sender: { $ne: req.user._id },
      readBy: { $ne: req.user._id },
    },
    { $addToSet: { readBy: req.user._id } },
  );

  const unreadCount = await countUnreadForUser(req.user._id);

  return success(res, 200, 'Conversation marked as read', { unreadCount });
});

/** GET /chat/unread-count */
export const unreadCount = asyncHandler(async (req, res) => {
  const count = await countUnreadForUser(req.user._id);
  return success(res, 200, 'Unread count', { unreadCount: count });
});

export { mapMessage };
