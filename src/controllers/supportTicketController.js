import SupportTicket from '../models/SupportTicket.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { notifyHrAdmin } from '../utils/approvalNotify.js';

const ticketDto = (doc) => {
  const t = doc?.toObject ? doc.toObject() : doc;
  return {
    id: String(t._id),
    subject: t.subject,
    message: t.message,
    category: t.category || 'general',
    status: t.status || 'open',
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
};

/** POST /api/employee/support/tickets */
export const createTicket = asyncHandler(async (req, res) => {
  const subject = String(req.body.subject || '').trim();
  const message = String(req.body.message || '').trim();
  const category = String(req.body.category || 'general').trim() || 'general';

  if (!subject || !message) {
    throw new ApiError(400, 'subject and message are required');
  }

  const ticket = await SupportTicket.create({
    employee: req.user._id,
    subject,
    message,
    category,
    status: 'open',
  });

  await notifyHrAdmin({
    senderId: req.user._id,
    title: 'Support ticket',
    message: `${req.user.name}: ${subject}`,
    type: 'info',
  }).catch(() => null);

  return success(res, 201, 'Support ticket created', {
    ticket: ticketDto(ticket),
  });
});

/** GET /api/employee/support/tickets */
export const listMyTickets = asyncHandler(async (req, res) => {
  const tickets = await SupportTicket.find({ employee: req.user._id }).sort({
    createdAt: -1,
  });
  return success(res, 200, 'Support tickets fetched', {
    tickets: tickets.map(ticketDto),
  });
});
