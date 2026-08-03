import LoanAdvanceRequest from '../models/LoanAdvance.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import {
  notifyApproversOnSubmit,
  notifyRequesterOnDecision,
} from '../utils/approvalNotify.js';

const toDto = (doc) => {
  const r = doc?.toObject ? doc.toObject() : doc;
  const emp = r.employee;
  const employeeName =
    r.employeeName ||
    (emp && typeof emp === 'object' ? emp.name : '') ||
    '';
  const empId =
    r.empId ||
    (emp && typeof emp === 'object' ? emp.employeeId : '') ||
    '';

  return {
    id: String(r._id),
    type: r.type,
    amount: r.amount,
    currency: r.currency || 'PKR',
    reason: r.reason || '',
    installments: r.installments || 1,
    status: r.status,
    empId,
    employeeName,
    employeeId:
      emp && typeof emp === 'object' ? String(emp._id) : String(r.employee || ''),
    reviewNote: r.reviewNote || '',
    reviewedAt: r.reviewedAt || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    date: r.createdAt ? String(r.createdAt).slice(0, 10) : '',
    note: r.reason || '',
  };
};

const resolveSelfMeta = async (user) => {
  const employee = await Employee.findOne({ user: user._id }).select(
    'empId name'
  );
  return {
    empId: employee?.empId || user.employeeId || '',
    employeeName: employee?.name || user.name || '',
  };
};

/**
 * POST /api/employee/loans | /api/employee/advances
 */
const createRequest = (type) =>
  asyncHandler(async (req, res) => {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, 'amount must be a number greater than 0');
    }
    const reason = String(req.body.reason || '').trim();
    if (!reason) throw new ApiError(400, 'reason is required');

    let installments = 1;
    if (type === 'loan') {
      installments = Number(req.body.installments) || 6;
      if (!Number.isFinite(installments) || installments < 1) {
        throw new ApiError(400, 'installments must be at least 1');
      }
    } else if (req.body.installments != null && req.body.installments !== '') {
      installments = Math.max(1, Number(req.body.installments) || 1);
    }

    const meta = await resolveSelfMeta(req.user);

    const doc = await LoanAdvanceRequest.create({
      employee: req.user._id,
      empId: meta.empId,
      employeeName: meta.employeeName,
      type,
      amount,
      reason,
      installments,
      status: 'pending',
    });

    const label = type === 'loan' ? 'Loan' : 'Advance';
    await notifyApproversOnSubmit({
      employeeId: req.user._id,
      senderId: req.user._id,
      title: `${label} request`,
      message: `${meta.employeeName || req.user.name} requested ${label.toLowerCase()} of Rs ${amount}. Reason: ${reason}`,
      includeManagers: true,
      includeHrAdmin: true,
    });

    return success(
      res,
      201,
      type === 'loan' ? 'Loan request submitted' : 'Advance request submitted',
      type === 'loan' ? { loan: toDto(doc) } : { advance: toDto(doc) }
    );
  });

/**
 * GET /api/employee/loans | /api/employee/advances
 */
const listMine = (type) =>
  asyncHandler(async (req, res) => {
    const filter = { employee: req.user._id, type };
    if (req.query.status) filter.status = req.query.status;

    const rows = await LoanAdvanceRequest.find(filter).sort({ createdAt: -1 });
    const list = rows.map(toDto);

    return success(
      res,
      200,
      type === 'loan' ? 'Loans fetched' : 'Advances fetched',
      type === 'loan' ? { loans: list } : { advances: list }
    );
  });

/**
 * GET /api/hr/loans | /api/hr/advances
 * Query: status=pending (default for approval queue)
 */
const listForHr = (type) =>
  asyncHandler(async (req, res) => {
    const filter = { type };
    if (req.query.status) filter.status = req.query.status;

    const rows = await LoanAdvanceRequest.find(filter)
      .populate('employee', 'name email employeeId')
      .sort({ createdAt: -1 });

    const list = rows.map(toDto);
    return success(
      res,
      200,
      type === 'loan' ? 'Loans fetched' : 'Advances fetched',
      type === 'loan' ? { loans: list } : { advances: list }
    );
  });

/**
 * PATCH /api/hr/loans/:id/review | /api/hr/advances/:id/review
 * Body: { decision: 'approved'|'rejected', remarks? }  (also accepts status / note)
 */
const reviewRequest = (type) =>
  asyncHandler(async (req, res) => {
    const doc = await LoanAdvanceRequest.findById(req.params.id).populate(
      'employee',
      'name email'
    );
    if (!doc || doc.type !== type) {
      throw new ApiError(404, `${type} request not found`);
    }
    if (doc.status !== 'pending') {
      throw new ApiError(400, 'Request already reviewed');
    }

    const decision = String(
      req.body.decision || req.body.status || ''
    ).toLowerCase();
    if (!['approved', 'rejected'].includes(decision)) {
      throw new ApiError(400, 'decision must be approved or rejected');
    }

    doc.status = decision;
    doc.reviewedBy = req.user._id;
    doc.reviewNote = String(req.body.remarks || req.body.note || '').trim();
    doc.reviewedAt = new Date();
    await doc.save();

    const empEmail = doc.employee?.email;
    if (empEmail) {
      const label = type === 'loan' ? 'Loan' : 'Advance';
      await notifyRequesterOnDecision({
        to: empEmail,
        userId: doc.employee?._id || doc.employee,
        title: `${label} request ${decision}`,
        message: `Your ${label.toLowerCase()} request of Rs ${doc.amount} was ${decision}.${
          doc.reviewNote ? ` Remarks: ${doc.reviewNote}` : ''
        }`,
        decision,
      }).catch(() => null);
    }

    return success(res, 200, `Request ${decision}`, {
      [type === 'loan' ? 'loan' : 'advance']: toDto(doc),
    });
  });

/** Pending counts for HR dashboard */
const countPending = async () => {
  const [loans, advances] = await Promise.all([
    LoanAdvanceRequest.countDocuments({ type: 'loan', status: 'pending' }),
    LoanAdvanceRequest.countDocuments({ type: 'advance', status: 'pending' }),
  ]);
  return { pendingLoans: loans, pendingAdvances: advances, pendingLoanAdvance: loans + advances };
};

export {
  createRequest,
  listMine,
  listForHr,
  reviewRequest,
  countPending,
  toDto,
};
