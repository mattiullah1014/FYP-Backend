import nodemailer from 'nodemailer';
import env from '../config/env.js';

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  const { host, port, user, pass, secure } = env.smtp;
  if (!host || !user || !pass) {
    console.warn(
      `[email] SMTP incomplete — host=${Boolean(host)} user=${Boolean(user)} pass=${Boolean(pass)}`
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return transporter;
};

/**
 * Send an email via SMTP. Returns false if SMTP is not configured.
 */
const sendEmail = async ({ to, subject, text, html }) => {
  const transport = getTransporter();
  if (!transport) {
    console.warn(
      '[email] SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in .env'
    );
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const info = await transport.sendMail({
    from: env.smtp.from,
    to,
    subject,
    text,
    html: html || undefined,
  });

  return { sent: true, messageId: info.messageId };
};

export { sendEmail };
