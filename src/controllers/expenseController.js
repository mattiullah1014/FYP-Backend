import ExpenseClaim from '../models/Expense.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { uploadToCloudinary } from '../config/cloudinary.stub.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';
import { notify } from '../services/notificationService.js';

const HIGH_VALUE_THRESHOLD = 50000;

const createClaim = asyncHandler(async (req, res) => {
  let receipt;
  if (req.file) {
    const uploaded = await uploadToCloudinary(req.file, 'expenses/receipts');
    receipt = { url: uploaded.url, publicId: uploaded.publicId };
  }

  const amount = Number(req.body.amount);
  const claim = await ExpenseClaim.create({
    employee: req.user._id,
    title: req.body.title,
    category: req.body.category,
    amount,
    currency: req.body.currency,
    description: req.body.description,
    expenseDate: req.body.expenseDate,
    receipt,
    isHighValue: amount >= HIGH_VALUE_THRESHOLD,
  });

  return success(res, 201, 'Expense claim submitted', { claim });
});

const myClaims = asyncHandler(async (req, res) => {
  const claims = await ExpenseClaim.find({ employee: req.user._id }).sort({
    createdAt: -1,
  });
  return success(res, 200, 'Claims fetched', { claims });
});

const listClaims = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.MANAGER) {
    const team = await User.find({ manager: req.user._id }).select('_id');
    filter.employee = { $in: team.map((t) => t._id) };
  }
  if (req.query.status) filter.status = req.query.status;

  const claims = await ExpenseClaim.find(filter)
    .populate('employee', 'name email employeeId')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Claims fetched', { claims });
});

const reviewClaim = asyncHandler(async (req, res) => {
  const claim = await ExpenseClaim.findById(req.params.id).populate('employee');
  if (!claim) throw new ApiError(404, 'Claim not found');
  if (claim.status !== 'pending') throw new ApiError(400, 'Already reviewed');

  const { decision, note } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ApiError(400, 'decision must be approved or rejected');
  }

  if (req.user.role === ROLES.MANAGER) {
    if (String(claim.employee.manager) !== String(req.user._id)) {
      throw new ApiError(403, 'Not your team member');
    }
    if (claim.isHighValue) {
      throw new ApiError(403, 'High-value claims require HR/Admin approval');
    }
  }

  claim.status = decision;
  claim.reviewedBy = req.user._id;
  claim.reviewNote = note;
  await claim.save();

  await notify({
    to: claim.employee.email,
    message: `Expense claim ${decision}`,
  });

  return success(res, 200, `Claim ${decision}`, { claim });
});

export { createClaim,
  myClaims,
  listClaims,
  reviewClaim, };
