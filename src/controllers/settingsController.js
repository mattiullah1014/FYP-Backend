import User, { emailAlertsEnabled } from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';

const prefsPayload = (user) => ({
  emailAlerts: emailAlertsEnabled(user),
});

/** GET /api/settings/notifications */
export const getNotificationPreferences = asyncHandler(async (req, res) => {
  return success(res, 200, 'Notification preferences', prefsPayload(req.user));
});

/** PATCH /api/settings/notifications  { emailAlerts: boolean } */
export const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { 'notificationPreferences.emailAlerts': req.body.emailAlerts } },
    { new: true }
  );
  if (!user) throw new ApiError(401, 'User not found');
  return success(res, 200, 'Notification preferences updated', prefsPayload(user));
});
