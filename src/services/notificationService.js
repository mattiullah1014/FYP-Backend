import { sendEmail } from './emailService.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

const inferType = (subject = '', message = '') => {
  const text = `${subject} ${message}`.toLowerCase();
  if (
    /\b(reject|rejected|denied|failed|not selected|suspend|demote)\b/.test(text)
  ) {
    return 'warning';
  }
  if (
    /\b(approv|approved|credited|congrat|shortlist|success|finalized|promote)\b/.test(
      text,
    )
  ) {
    return 'success';
  }
  return 'info';
};

const looksSensitiveOtp = (subject = '', message = '') =>
  /\b(otp|one[- ]?time|verification code|2fa code|login code)\b/i.test(
    `${subject} ${message}`,
  );

const messageFallback = (subject) =>
  subject ? String(subject) : 'You have a new notification';

/**
 * Persist in-app notification for a user (by userId or email).
 */
const createInAppNotification = async ({
  userId,
  to,
  title,
  body,
  type,
  channel,
  subject,
  meta,
}) => {
  try {
    let uid = userId || null;
    if (!uid && to) {
      const email = String(to).trim().toLowerCase();
      const user = await User.findOne({
        email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).select('_id');
      uid = user?._id || null;
    }
    if (!uid) return null;

    const doc = await Notification.create({
      user: uid,
      title: title || subject || 'Brilliance notification',
      body: body || messageFallback(subject),
      type: type || 'info',
      channel: channel || 'email',
      subject: subject || '',
      emailTo: to ? String(to) : '',
      meta: meta || undefined,
    });
    return doc;
  } catch (err) {
    console.error('[notify:in-app] failed:', err.message);
    return null;
  }
};
/**
 * Multi-channel notify — email via SMTP + always save in-app (when user found).
 * Options:
 *  - to: email
 *  - userId: optional User _id (preferred for in-app)
 *  - channel: 'email' | 'log'
 *  - subject, message, html
 *  - type: success|info|warning|error
 *  - skipInApp: skip DB notification (OTP etc.)
 *  - meta: extra payload
 */
const notify = async ({
  to,
  userId,
  channel = 'log',
  subject,
  message,
  html,
  type,
  skipInApp = false,
  meta,
} = {}) => {
  const title = subject || 'Brilliance notification';
  const body = message || title;
  const notifType = type || inferType(subject, message);
  const shouldSkipInApp = skipInApp || looksSensitiveOtp(subject, message);

  let inApp = null;
  if (!shouldSkipInApp) {
    inApp = await createInAppNotification({
      userId,
      to,
      title,
      body,
      type: notifType,
      channel,
      subject: title,
      meta,
    });
  }

  if (channel === 'email') {
    try {
      const result = await sendEmail({
        to,
        subject: title,
        text: message,
        html,
      });

      if (result.sent) {
        console.log(`[notify:email] sent to=${to} subject=${title}`);
        return {
          queued: true,
          channel: 'email',
          inAppId: inApp?._id || null,
          ...result,
        };
      }

      console.log(
        `[notify:email:fallback] to=${to} subject=${title} :: ${message}`,
      );
      return {
        queued: true,
        channel: 'log',
        inAppId: inApp?._id || null,
        ...result,
      };
    } catch (err) {
      console.error(`[notify:email] failed to=${to}:`, err.message);
      console.log(
        `[notify:email:fallback] to=${to} subject=${title} :: ${message}`,
      );
      return {
        queued: false,
        channel: 'email',
        error: err.message,
        inAppId: inApp?._id || null,
      };
    }
  }

  console.log(`[notify:${channel}] to=${to} subject=${title} :: ${message}`);
  return {
    queued: true,
    channel,
    inAppId: inApp?._id || null,
  };
};

export { notify, createInAppNotification };
