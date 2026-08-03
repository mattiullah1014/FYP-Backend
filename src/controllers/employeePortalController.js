import fs from 'fs/promises';
import path from 'path';
import User from '../models/User.js';
import Employee from '../models/Employee.js';
import ManagerEmployeeAssignment from '../models/ManagerEmployeeAssignment.js';
import Task from '../models/Task.js';
import OvertimeRequest from '../models/OvertimeRequest.js';
import { LeaveRequest } from '../models/Leave.js';
import ExpenseClaim from '../models/Expense.js';
import { Announcement, Message } from '../models/Communication.js';
import { Goal, PerformanceReview } from '../models/Performance.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { notifyApproversOnSubmit } from '../utils/approvalNotify.js';
import { assertAssignedManager } from '../middleware/managerAuth.js';
import {
  UPLOADS_ROOT,
  absoluteUploadUrl,
} from '../utils/recruitmentHelpers.js';
import {
  getOrCreateProfileCompletion,
  getIncompleteSections,
  profileCompletionSummary,
  syncProfileCompletionFromUser,
} from '../utils/profileCompletion.js';

const calcDays = (from, to) => {
  const start = new Date(from);
  const end = new Date(to);
  const ms = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1);
};

const mapLeaveType = (raw) => {
  const s = String(raw || '').toLowerCase().trim();
  if (['annual', 'sick', 'casual', 'unpaid', 'maternity', 'paternity', 'other'].includes(s)) {
    return s;
  }
  if (s.includes('annual') || s.includes('paid leave')) return 'annual';
  if (s.includes('sick')) return 'sick';
  if (s.includes('personal') || s.includes('casual')) return 'casual';
  if (s.includes('unpaid') || s.includes('lwp')) return 'unpaid';
  if (s.includes('maternity')) return 'maternity';
  if (s.includes('paternity')) return 'paternity';
  return 'other';
};

const listManagers = asyncHandler(async (req, res) => {
  const links = await ManagerEmployeeAssignment.find({ employee: req.user._id })
    .populate('manager', 'name email designation department phone avatar avatarUrl')
    .sort({ relationshipType: 1 });

  const managers = links.map((l) => ({
    id: l.manager?._id,
    name: l.manager?.name,
    email: l.manager?.email,
    department: l.manager?.department,
    designation: l.manager?.designation,
    relationshipType: l.relationshipType,
    assignmentId: l._id,
  }));

  return success(res, 200, 'Managers fetched', { managers });
});

const listTasks = asyncHandler(async (req, res) => {
  const filter = { assignee: req.user._id, isDeleted: false };
  if (req.query.managerId) filter.manager = req.query.managerId;
  if (req.query.status) filter.status = req.query.status;

  const tasks = await Task.find(filter)
    .populate('manager', 'name email')
    .sort({ deadline: 1 });

  return success(res, 200, 'Tasks fetched', { tasks });
});

const updateTaskStatus = asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['pending', 'in_progress', 'completed'].includes(status)) {
    throw new ApiError(400, 'Invalid status');
  }

  const task = await Task.findOne({
    _id: req.params.id,
    assignee: req.user._id,
    isDeleted: false,
  });
  if (!task) throw new ApiError(404, 'Task not found');

  task.status = status;
  await task.save();
  return success(res, 200, 'Task status updated', { task });
});

const createLeave = asyncHandler(async (req, res) => {
  const from = req.body.from || req.body.startDate;
  const to = req.body.to || req.body.endDate;
  const rawType = req.body.type || req.body.leaveType;
  const reason = String(req.body.reason || '').trim();

  if (!from || !to || !rawType || !reason) {
    throw new ApiError(
      400,
      'leaveType (or type), startDate/from, endDate/to, and reason are required'
    );
  }

  const leaveType = mapLeaveType(rawType);
  const days =
    req.body.days != null && Number(req.body.days) > 0
      ? Number(req.body.days)
      : calcDays(from, to);

  // Optional: primary manager if assigned (not required from client)
  const primary = await ManagerEmployeeAssignment.findOne({
    employee: req.user._id,
    relationshipType: 'primary',
  }).select('manager');
  const anyMgr = primary
    ? null
    : await ManagerEmployeeAssignment.findOne({
        employee: req.user._id,
      }).select('manager');
  const managerId =
    req.body.managerId || primary?.manager || anyMgr?.manager || undefined;

  const leave = await LeaveRequest.create({
    employee: req.user._id,
    manager: managerId,
    leaveType,
    startDate: from,
    endDate: to,
    days,
    reason,
    status: 'pending',
    managerStatus: 'pending',
    hrStatus: 'pending',
  });

  // Notify ALL assigned managers + all HR/Admin (email + in-app)
  await notifyApproversOnSubmit({
    employeeId: req.user._id,
    senderId: req.user._id,
    title: 'Leave request',
    message: `${req.user.name} requested ${leaveType} leave (${days} day(s))`,
    includeManagers: true,
    includeHrAdmin: true,
  });

  return success(res, 201, 'Leave request submitted', { leave });
});

const listLeave = asyncHandler(async (req, res) => {
  const filter = { employee: req.user._id };
  if (req.query.managerId) filter.manager = req.query.managerId;
  if (req.query.status) filter.status = req.query.status;

  const leaves = await LeaveRequest.find(filter)
    .populate('manager', 'name email')
    .sort({ createdAt: -1 });

  return success(res, 200, 'Leave requests fetched', { leaves });
});

const createOvertime = asyncHandler(async (req, res) => {
  const managerId = req.body.managerId;
  await assertAssignedManager(req.user._id, managerId);

  if (!req.body.date || !req.body.hours || !req.body.reason) {
    throw new ApiError(400, 'managerId, date, hours, reason are required');
  }

  const overtime = await OvertimeRequest.create({
    employee: req.user._id,
    manager: managerId,
    date: req.body.date,
    hours: Number(req.body.hours),
    reason: req.body.reason,
    status: 'pending',
  });

  await Message.create({
    sender: req.user._id,
    recipient: managerId,
    title: 'Overtime request',
    body: `${req.user.name} requested ${overtime.hours}h overtime`,
    type: 'approval',
  }).catch(() => null);

  await notifyApproversOnSubmit({
    employeeId: req.user._id,
    senderId: req.user._id,
    title: 'Overtime request',
    message: `${req.user.name} requested ${overtime.hours}h overtime on ${req.body.date}. Reason: ${req.body.reason}`,
    includeManagers: true,
    includeHrAdmin: true,
  });

  return success(res, 201, 'Overtime submitted', { overtime });
});

const listOvertime = asyncHandler(async (req, res) => {
  const filter = { employee: req.user._id };
  if (req.query.managerId) filter.manager = req.query.managerId;
  if (req.query.status) filter.status = req.query.status;

  const overtime = await OvertimeRequest.find(filter)
    .populate('manager', 'name email')
    .sort({ createdAt: -1 });

  return success(res, 200, 'Overtime fetched', { overtime });
});

const createExpense = asyncHandler(async (req, res) => {
  if (!req.body.title || req.body.amount == null || !req.body.date) {
    throw new ApiError(400, 'title, amount, and date are required');
  }

  let receiptUrl;
  let receipt;
  if (req.file?.buffer) {
    const dir = path.join(UPLOADS_ROOT, 'receipts');
    await fs.mkdir(dir, { recursive: true });
    const safe = path
      .basename(req.file.originalname || 'receipt')
      .replace(/\s+/g, '-');
    const filename = `${Date.now()}-${safe}`;
    await fs.writeFile(path.join(dir, filename), req.file.buffer);
    receiptUrl = `/uploads/receipts/${filename}`;
    receipt = { url: receiptUrl };
  } else if (req.file?.path) {
    // multer disk storage fallback
    receiptUrl = `/uploads/receipts/${path.basename(req.file.path)}`;
    receipt = { url: receiptUrl };
  }

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'amount must be a number greater than 0');
  }

  const claim = await ExpenseClaim.create({
    employee: req.user._id,
    title: String(req.body.title).trim(),
    category: req.body.category || 'other',
    amount,
    description: req.body.description || req.body.notes || '',
    expenseDate: req.body.date || req.body.expenseDate,
    receipt,
    receiptUrl,
    isHighValue: amount >= 50000,
    status: 'pending',
  });

  // Notify managers + HR/Admin
  await notifyApproversOnSubmit({
    employeeId: req.user._id,
    senderId: req.user._id,
    title: 'Expense claim',
    message: `${req.user.name} submitted expense: ${claim.title} (Rs ${amount})`,
    includeManagers: true,
    includeHrAdmin: true,
  });

  return success(res, 201, 'Expense submitted', {
    expense: {
      ...claim.toObject(),
      id: String(claim._id),
      date: claim.expenseDate,
      receiptUrl: receiptUrl
        ? absoluteUploadUrl(req, receiptUrl)
        : undefined,
    },
  });
});

const listExpenses = asyncHandler(async (req, res) => {
  const filter = { employee: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const rows = await ExpenseClaim.find(filter).sort({ createdAt: -1 });
  const expenses = rows.map((c) => {
    const o = c.toObject();
    return {
      ...o,
      id: String(o._id),
      date: o.expenseDate,
      receiptUrl: o.receiptUrl || o.receipt?.url,
    };
  });

  return success(res, 200, 'Expenses fetched', { expenses });
});

const profileCompletion = asyncHandler(async (req, res) => {
  await syncProfileCompletionFromUser(req.user._id);
  const doc = await getOrCreateProfileCompletion(req.user._id);
  const summary = profileCompletionSummary(doc);

  return success(res, 200, 'Profile completion fetched', {
    profileCompletion: summary,
    incomplete: summary.incomplete,
  });
});

const updateProfileSection = asyncHandler(async (req, res) => {
  const section = req.params.section;
  const doc = await getOrCreateProfileCompletion(req.user._id);
  const user = await User.findById(req.user._id);

  if (section === 'personalInfo') {
    if (req.body.name) user.name = req.body.name;
    if (req.body.phone) user.phone = req.body.phone;
    if (req.body.address) user.address = { ...user.address?.toObject?.() || user.address, ...req.body.address };
    await user.save();
    doc.personalInfoComplete = true;
  } else if (section === 'documents') {
    if (req.body.documents) user.documents = req.body.documents;
    await user.save();
    doc.documentsComplete = Array.isArray(user.documents) && user.documents.length > 0;
  } else if (section === 'emergencyContact') {
    if (req.body.emergencyContacts) {
      user.emergencyContacts = req.body.emergencyContacts;
    } else if (req.body.name && req.body.phone) {
      user.emergencyContacts = [
        {
          name: req.body.name,
          relation: req.body.relation,
          phone: req.body.phone,
        },
      ];
    }
    await user.save();
    doc.emergencyContactComplete =
      Array.isArray(user.emergencyContacts) && user.emergencyContacts.length > 0;
  } else if (section === 'bankDetails') {
    const bankName = req.body.bankName || '';
    const accountNumber = req.body.accountNumber || '';
    const iban = req.body.iban || '';
    doc.bankDetails = {
      accountTitle: req.body.accountTitle,
      bankName,
      accountNumber,
      iban,
    };
    doc.bankDetailsComplete = Boolean(accountNumber || iban);

    // Keep Employee.bank in sync (source of truth for HR / payroll)
    const employee = await Employee.findOne({ user: req.user._id });
    if (employee) {
      employee.bank = { bankName, accountNumber, iban };
      await employee.save();
    }
  } else {
    throw new ApiError(400, 'Unknown section');
  }

  await doc.save();
  return success(res, 200, 'Section updated', {
    profileCompletion: profileCompletionSummary(doc),
  });
});

const dashboard = asyncHandler(async (req, res) => {
  const links = await ManagerEmployeeAssignment.find({
    employee: req.user._id,
  }).populate('manager', 'name designation department');

  const managers = links.map((l) => ({
    id: l.manager?._id,
    name: l.manager?.name,
    relationshipType: l.relationshipType,
    department: l.manager?.department,
  }));

  const [pendingTasks, announcements, alerts] = await Promise.all([
    Task.countDocuments({
      assignee: req.user._id,
      isDeleted: false,
      status: { $ne: 'completed' },
    }),
    Announcement.find({
      $or: [
        { audience: 'all' },
        { manager: { $in: links.map((l) => l.manager?._id).filter(Boolean) } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(10),
    Message.find({ recipient: req.user._id, isRead: false })
      .sort({ createdAt: -1 })
      .limit(20),
  ]);

  await syncProfileCompletionFromUser(req.user._id);
  const completion = await getOrCreateProfileCompletion(req.user._id);

  return success(res, 200, 'Employee dashboard', {
    dashboard: {
      managers,
      pendingTasks,
      announcements,
      alerts,
      profileCompletion: profileCompletionSummary(completion),
      incomplete: getIncompleteSections(completion),
    },
  });
});

/** GET /employee/performance — manager reviews + goals + task stats for self */
const getMyPerformance = asyncHandler(async (req, res) => {
  const uid = req.user._id;

  const [reviews, goals, tasksCompleted, tasksTotal] = await Promise.all([
    PerformanceReview.find({ employee: uid })
      .populate('reviewer', 'name email designation')
      .populate('manager', 'name email designation')
      .sort({ createdAt: -1 }),
    Goal.find({ employee: uid }).sort({ createdAt: -1 }).limit(20),
    Task.countDocuments({
      assignee: uid,
      status: 'completed',
      isDeleted: false,
    }),
    Task.countDocuments({
      assignee: uid,
      isDeleted: false,
    }),
  ]);

  const mappedReviews = reviews.map((r) => {
    const mgr = r.manager || r.reviewer;
    return {
      id: String(r._id),
      period: r.period,
      rating: r.rating ?? null,
      overallRating: r.overallRating ?? null,
      feedback: r.feedback || r.managerComments || '',
      managerComments: r.managerComments || r.feedback || '',
      selfAssessment: r.selfAssessment || '',
      hrReview: r.hrReview || '',
      trainingRecommendation: r.trainingRecommendation || '',
      promotionRecommendation: r.promotionRecommendation || 'none',
      kpis: r.kpis || [],
      status: r.status,
      managerName: mgr?.name || 'Manager',
      managerId: mgr?._id ? String(mgr._id) : null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  const latest = mappedReviews[0] || null;

  return success(res, 200, 'Performance fetched', {
    reviews: mappedReviews,
    latestReview: latest,
    managerReview: latest
      ? {
          rating: latest.rating,
          comments: latest.feedback,
          period: latest.period,
          managerName: latest.managerName,
          kpis: latest.kpis,
          status: latest.status,
        }
      : null,
    goals: goals.map((g) => {
      const target = Number(g.targetValue) || 0;
      const current = Number(g.currentValue) || 0;
      const progress =
        target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
      return {
        id: String(g._id),
        title: g.title,
        description: g.description || '',
        status: g.status,
        progress,
        targetValue: g.targetValue,
        currentValue: g.currentValue,
        dueDate: g.dueDate,
      };
    }),
    tasksCompleted,
    tasksTotal,
    selfAssessment: latest?.selfAssessment
      ? { text: latest.selfAssessment }
      : null,
  });
});

/**
 * POST /employee/performance/self-assessment
 * Body: { text|selfAssessment, rating?, reviewId? }
 * Attaches self-assessment to an existing review (or creates a draft for self).
 */
const submitSelfAssessment = asyncHandler(async (req, res) => {
  const text = String(
    req.body.text || req.body.selfAssessment || '',
  ).trim();
  if (text.length < 20) {
    throw new ApiError(400, 'Self assessment must be at least 20 characters');
  }

  let review = null;
  if (req.body.reviewId) {
    review = await PerformanceReview.findOne({
      _id: req.body.reviewId,
      employee: req.user._id,
    });
    if (!review) throw new ApiError(404, 'Review not found');
  } else {
    review = await PerformanceReview.findOne({ employee: req.user._id }).sort({
      createdAt: -1,
    });
  }

  if (!review) {
    review = await PerformanceReview.create({
      employee: req.user._id,
      period: req.body.period || new Date().toISOString().slice(0, 7),
      selfAssessment: text,
      status: 'submitted',
    });
  } else {
    review.selfAssessment = text;
    if (review.status === 'draft') review.status = 'submitted';
    await review.save();
  }

  return success(res, 200, 'Self-assessment submitted', {
    review: {
      id: String(review._id),
      period: review.period,
      selfAssessment: review.selfAssessment,
      status: review.status,
      rating: review.rating,
    },
  });
});

export {
  listManagers,
  listTasks,
  updateTaskStatus,
  createLeave,
  listLeave,
  createOvertime,
  listOvertime,
  createExpense,
  listExpenses,
  profileCompletion,
  updateProfileSection,
  dashboard,
  getMyPerformance,
  submitSelfAssessment,
};
