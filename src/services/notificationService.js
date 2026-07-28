import { sendEmail } from './emailService.js';

/**
 * Multi-channel notify — email via SMTP, otherwise console log.
 */
const notify = async ({ to, channel = 'log', subject, message, html }) => {
  if (channel === 'email') {
    try {
      const result = await sendEmail({
        to,
        subject: subject || 'Brilliance notification',
        text: message,
        html,
      });

      if (result.sent) {
        console.log(`[notify:email] sent to=${to} subject=${subject || '-'}`);
        return { queued: true, channel: 'email', ...result };
      }

      // Fallback so OTP still visible in logs during local/dev without SMTP
      console.log(
        `[notify:email:fallback] to=${to} subject=${subject || '-'} :: ${message}`
      );
      return { queued: true, channel: 'log', ...result };
    } catch (err) {
      console.error(`[notify:email] failed to=${to}:`, err.message);
      console.log(
        `[notify:email:fallback] to=${to} subject=${subject || '-'} :: ${message}`
      );
      return { queued: false, channel: 'email', error: err.message };
    }
  }

  console.log(
    `[notify:${channel}] to=${to} subject=${subject || '-'} :: ${message}`
  );
  return { queued: true, channel };
};

export { notify };
