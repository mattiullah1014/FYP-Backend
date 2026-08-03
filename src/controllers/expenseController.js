import ExpenseClaim from '../models/Expense.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { uploadToCloudinary } from '../config/cloudinary.stub.js';
import { HR_ADMIN } from '../constants/roles.js';
import { notify } from '../services/notificationService.js';

const HIGH_VALUE_THRESHOLD = 50000;

const toDto = (doc) => {
  const c = doc?.toObject ? doc.toObject() : doc;
  const emp = c.employee;
  return {
    id: String(c._id),
    title: c.title,
    category: c.category,
    amount: c.amount,
    currency: c.currency || 'PKR',
    description: c.description || '',
    date: c.expenseDate,
    expenseDate: c.expenseDate,
    status: c.status,
    receiptUrl: c.receiptUrl || c.receipt?.url || '',
    isHighValue: Boolean(c.isHighValue),
    reviewNote: c.reviewNote || '',
    employeeName: emp && typeof emp === 'object' ? emp.name : '',
    empId: emp && typeof emp === 'object' ? emp.employeeId : '',
    employeeId:
      emp && typeof emp === 'object' ? String(emp._id) : String(c.employee || ''),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
};

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
    expenseDate: req.body.expenseDate || req.body.date,
    receipt,
    isHighValue: amount >= HIGH_VALUE_THRESHOLD,
    status: 'pending',
  });

  return success(res, 201, 'Expense claim submitted', { claim: toDto(claim) });
});

const myClaims = asyncHandler(async (req, res) => {
  const claims = await ExpenseClaim.find({ employee: req.user._id }).sort({
    createdAt: -1,
  });
  return success(res, 200, 'Claims fetched', {
    claims: claims.map(toDto),
    expenses: claims.map(toDto),
  });
});

/** HR list — all claims (optional status filter) */
const listClaims = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const claims = await ExpenseClaim.find(filter)
    .populate('employee', 'name email employeeId')
    .sort({ createdAt: -1 });

  const list = claims.map(toDto);
  return success(res, 200, 'Claims fetched', {
    claims: list,
    expenses: list,
  });
});

/** HR / Admin only — approve or reject */
const reviewClaim = asyncHandler(async (req, res) => {
  if (!HR_ADMIN.includes(req.user.role)) {
    throw new ApiError(403, 'Only HR can approve expense claims');
  }

  const claim = await ExpenseClaim.findById(req.params.id).populate('employee');
  if (!claim) throw new ApiError(404, 'Claim not found');
  if (claim.status !== 'pending') throw new ApiError(400, 'Already reviewed');

  const decision = String(
    req.body.decision || req.body.status || ''
  ).toLowerCase();
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ApiError(400, 'decision must be approved or rejected');
  }

  claim.status = decision;
  claim.reviewedBy = req.user._id;
  claim.reviewNote = String(req.body.remarks || req.body.note || '').trim();
  await claim.save();

  const email = claim.employee?.email;
  if (email) {
    await notify({
      to: email,
      channel: 'email',
      subject: `Expense claim ${decision}`,
      message: `Your expense "${claim.title}" (Rs ${claim.amount}) was ${decision}.${
        claim.reviewNote ? ` Remarks: ${claim.reviewNote}` : ''
      }`,
    }).catch(() => null);
  }

  return success(res, 200, `Claim ${decision}`, { claim: toDto(claim) });
});

export { createClaim, myClaims, listClaims, reviewClaim, toDto };
