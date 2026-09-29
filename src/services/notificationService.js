import { sendEmail } from './emailService.js';
import User, { emailAlertsEnabled } from '../models/User.js';
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

/** OTP, password reset, and 2FA must send even when Email Alerts are off. */
const looksLikeSecurityMail = (subject = '', message = '') => {
  if (looksSensitiveOtp(subject, message)) return true;
  return /\b(password reset|reset password|two-factor|2fa)\b/i.test(
    `${subject} ${message}`,
  );
};

const escapeEmail = (email) =>
  String(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findUserForNotify = async ({ userId, to }) => {
  if (userId) {
    return User.findById(userId).select('email notificationPreferences');
  }
  if (!to) return null;
  const email = String(to).trim().toLowerCase();
  return User.findOne({
    email: new RegExp(`^${escapeEmail(email)}$`, 'i'),
  }).select('email notificationPreferences');
};

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
 *  - security: always send email (OTP, reset password, 2FA) — ignores Email Alerts
 *  - meta: extra payload
 * Product mail (leave, OT, interview, payslip, …) is skipped when
 * notificationPreferences.emailAlerts === false. Missing field = enabled.
 * In-app row is still saved (channel in_app) so the bell keeps working.
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
  security = false,
  meta,
} = {}) => {
  const title = subject || 'Brilliance notification';
  const body = message || title;
  const notifType = type || inferType(subject, message);
  const shouldSkipInApp = skipInApp || looksSensitiveOtp(subject, message);
  const bypassPreference =
    security === true || looksLikeSecurityMail(subject, message);

  let deliverEmail = channel === 'email';
  if (deliverEmail && !bypassPreference) {
    const user = await findUserForNotify({ userId, to });
    if (user && !emailAlertsEnabled(user)) {
      deliverEmail = false;
    }
  }

  const storedChannel =
    channel === 'email' && !deliverEmail ? 'in_app' : channel;

  let inApp = null;
  if (!shouldSkipInApp) {
    inApp = await createInAppNotification({
      userId,
      to,
      title,
      body,
      type: notifType,
      channel: storedChannel,
      subject: title,
      meta,
    });
  }

  if (channel === 'email' && !deliverEmail) {
    console.log(
      `[notify:email:skipped] to=${to} subject=${title} reason=email_alerts_disabled`,
    );
    return {
      queued: false,
      channel: 'in_app',
      skipped: true,
      reason: 'email_alerts_disabled',
      inAppId: inApp?._id || null,
    };
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
