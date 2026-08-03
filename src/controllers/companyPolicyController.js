import CompanyPolicy from '../models/CompanyPolicy.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { STAFF_ROLES } from '../constants/roles.js';
import { notify } from '../services/notificationService.js';

const formatPolicy = (policy) => {
  const p = policy?.toObject ? policy.toObject() : policy;
  return {
    id: String(p._id),
    title: p.title,
    body: p.body,
    category: p.category || 'General',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

const previewBody = (body, max = 160) => {
  const text = String(body || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
};

/**
 * Fire-and-forget emails to all active staff. Never throws to caller.
 */
const emailActiveEmployeesPolicyUpdate = async (policy) => {
  try {
    const recipients = await User.find({
      role: { $in: STAFF_ROLES },
      isActive: true,
      isDeleted: false,
    }).select('email name');

    const title = policy.title;
    const category = policy.category || 'General';
    const updatedAt = policy.updatedAt
      ? new Date(policy.updatedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const preview = previewBody(policy.body);
    const subject = `Company Policy Updated: ${title}`;
    const message =
      `The company policy "${title}" (${category}) was updated on ${updatedAt}.\n\n` +
      `Preview: ${preview}\n\n` +
      `Please open the Brilliance app → Company Policies to read the full update.`;
    const html =
      `<p>The company policy <strong>${title}</strong> ` +
      `(${category}) was updated on <strong>${updatedAt}</strong>.</p>` +
      `<p><em>Preview:</em> ${preview}</p>` +
      `<p>Please open the Brilliance app → <strong>Company Policies</strong> to read the full update.</p>`;

    const results = await Promise.allSettled(
      recipients
        .filter((u) => u.email)
        .map((u) =>
          notify({
            to: u.email,
            channel: 'email',
            subject,
            message,
            html,
          })
        )
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    console.log(
      `[company-policy] update emails: total=${recipients.length} failed=${failed} title="${title}"`
    );
  } catch (err) {
    console.error('[company-policy] email blast failed:', err.message);
  }
};

const listPolicies = asyncHandler(async (req, res) => {
  const policies = await CompanyPolicy.find({ isDeleted: false }).sort({
    updatedAt: -1,
  });

  return success(res, 200, 'Policies fetched', {
    policies: policies.map(formatPolicy),
  });
});

const createPolicy = asyncHandler(async (req, res) => {
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body || '').trim();
  const category = String(req.body.category || 'General').trim() || 'General';

  if (!title) throw new ApiError(400, 'title is required');
  if (!body) throw new ApiError(400, 'body is required');

  const policy = await CompanyPolicy.create({
    title,
    body,
    category,
    createdBy: req.user._id,
  });

  return success(res, 201, 'Policy created', {
    policy: formatPolicy(policy),
  });
});

const updatePolicy = asyncHandler(async (req, res) => {
  const policy = await CompanyPolicy.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!policy) throw new ApiError(404, 'Policy not found');

  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) throw new ApiError(400, 'title cannot be empty');
    policy.title = title;
  }
  if (req.body.body !== undefined) {
    const body = String(req.body.body).trim();
    if (!body) throw new ApiError(400, 'body cannot be empty');
    policy.body = body;
  }
  if (req.body.category !== undefined) {
    policy.category =
      String(req.body.category).trim() || policy.category || 'General';
  }

  await policy.save();

  // Email blast must not block / roll back the update
  setImmediate(() => {
    emailActiveEmployeesPolicyUpdate(policy).catch((err) =>
      console.error('[company-policy] async email error:', err.message)
    );
  });

  return success(res, 200, 'Policy updated', {
    policy: formatPolicy(policy),
  });
});

const deletePolicy = asyncHandler(async (req, res) => {
  const policy = await CompanyPolicy.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!policy) throw new ApiError(404, 'Policy not found');

  // Hard delete for FYP simplicity
  await policy.deleteOne();

  return success(res, 200, 'Policy deleted');
});

export {
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  formatPolicy,
};
