import { Announcement, Message } from '../models/Communication.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';

const createAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.create({
    ...req.body,
    createdBy: req.user._id,
  });
  return success(res, 201, 'Announcement created', { announcement });
});

const listAnnouncements = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.MANAGER && req.query.audience === 'team') {
    filter.audience = 'team';
  }
  const announcements = await Announcement.find(filter)
    .populate('createdBy', 'name role')
    .sort({ isPinned: -1, createdAt: -1 });
  return success(res, 200, 'Announcements fetched', { announcements });
});

const sendMessage = asyncHandler(async (req, res) => {
  const message = await Message.create({
    sender: req.user._id,
    recipient: req.body.recipient,
    subject: req.body.subject,
    body: req.body.body,
  });
  return success(res, 201, 'Message sent', { message });
});

const inbox = asyncHandler(async (req, res) => {
  const messages = await Message.find({ recipient: req.user._id })
    .populate('sender', 'name email role')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Inbox fetched', { messages });
});

const sent = asyncHandler(async (req, res) => {
  const messages = await Message.find({ sender: req.user._id })
    .populate('recipient', 'name email role')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Sent messages fetched', { messages });
});

const markRead = asyncHandler(async (req, res) => {
  const message = await Message.findById(req.params.id);
  if (!message) throw new ApiError(404, 'Message not found');
  if (String(message.recipient) !== String(req.user._id)) {
    throw new ApiError(403, 'Not your message');
  }
  message.isRead = true;
  message.readAt = new Date();
  await message.save();
  return success(res, 200, 'Message marked as read', { message });
});

export { createAnnouncement,
  listAnnouncements,
  sendMessage,
  inbox,
  sent,
  markRead, };
