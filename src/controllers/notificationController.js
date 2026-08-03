import Notification from '../models/Notification.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';

const mapNotification = (n) => ({
  id: String(n._id),
  title: n.title,
  body: n.body,
  type: n.type || 'info',
  channel: n.channel || 'email',
  subject: n.subject || '',
  read: Boolean(n.isRead),
  isRead: Boolean(n.isRead),
  createdAt: n.createdAt,
  readAt: n.readAt || null,
  time: n.createdAt,
});

/** GET /notifications?unreadOnly=&limit=&page= */
export const listMyNotifications = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (String(req.query.unreadOnly) === 'true') filter.isRead = false;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  const [rows, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);

  return success(res, 200, 'Notifications fetched', {
    notifications: rows.map(mapNotification),
    unreadCount,
    pagination: { page, limit, total },
  });
});

/** GET /notifications/unread-count */
export const unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    user: req.user._id,
    isRead: false,
  });
  return success(res, 200, 'Unread count', { unreadCount: count });
});

/** PATCH /notifications/:id/read */
export const markRead = asyncHandler(async (req, res) => {
  const n = await Notification.findOne({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!n) throw new ApiError(404, 'Notification not found');

  if (!n.isRead) {
    n.isRead = true;
    n.readAt = new Date();
    await n.save();
  }

  return success(res, 200, 'Marked as read', { notification: mapNotification(n) });
});

/** PATCH /notifications/read-all */
export const markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  return success(res, 200, 'All marked as read', {
    modified: result.modifiedCount ?? result.nModified ?? 0,
  });
});

/** DELETE /notifications/:id */
export const deleteNotification = asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!n) throw new ApiError(404, 'Notification not found');
  return success(res, 200, 'Notification deleted', { id: String(n._id) });
});
