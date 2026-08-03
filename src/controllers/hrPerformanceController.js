import { PerformanceReview, Goal } from '../models/Performance.js';
import Task from '../models/Task.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { notifyRequesterOnDecision } from '../utils/approvalNotify.js';

const mapReview = (r) => {
  const emp = r.employee;
  const mgr = r.manager || r.reviewer;
  const dept =
    emp?.department && typeof emp.department === 'object'
      ? emp.department.name || ''
      : emp?.department || '';
  return {
    id: String(r._id),
    _id: String(r._id),
    employeeId: emp?._id ? String(emp._id) : String(r.employee),
    employeeName: emp?.name || 'Employee',
    empId: emp?.employeeId || '',
    email: emp?.email || '',
    department: dept,
    designation: emp?.designation || '',
    managerName: mgr?.name || 'Manager',
    managerId: mgr?._id ? String(mgr._id) : null,
    period: r.period,
    rating: r.rating ?? null,
    overallRating: r.overallRating ?? null,
    feedback: r.feedback || r.managerComments || '',
    managerReview: r.managerComments || r.feedback || '',
    managerComments: r.managerComments || r.feedback || '',
    selfAssessment: r.selfAssessment || '',
    hrReview: r.hrReview || '',
    trainingRecommendation: r.trainingRecommendation || '',
    promotionRecommendation: r.promotionRecommendation || 'none',
    kpis: r.kpis || [],
    status: r.status || 'draft',
    hrReviewedAt: r.hrReviewedAt || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    employee: emp,
    manager: mgr,
  };
};

/**
 * GET /hr/performance
 * Query: status, employee, search, page, limit
 */
export const listPerformance = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status).trim();
  if (req.query.employee) filter.employee = req.query.employee;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const skip = (page - 1) * limit;

  let reviews = await PerformanceReview.find(filter)
    .populate('employee', 'name email employeeId department designation')
    .populate('manager', 'name email')
    .populate('reviewer', 'name email')
    .populate('hrReviewedBy', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const search = String(req.query.search || '').trim().toLowerCase();
  if (search) {
    reviews = reviews.filter((r) => {
      const name = r.employee?.name || '';
      const email = r.employee?.email || '';
      const empId = r.employee?.employeeId || '';
      return (
        name.toLowerCase().includes(search) ||
        email.toLowerCase().includes(search) ||
        String(empId).toLowerCase().includes(search) ||
        String(r.period || '').toLowerCase().includes(search)
      );
    });
  }

  const total = await PerformanceReview.countDocuments(filter);
  const mapped = reviews.map(mapReview);

  const [pendingHr, completed, draft] = await Promise.all([
    PerformanceReview.countDocuments({ status: 'pending_hr' }),
    PerformanceReview.countDocuments({ status: 'completed' }),
    PerformanceReview.countDocuments({
      status: { $in: ['draft', 'submitted'] },
    }),
  ]);

  return success(res, 200, 'Performance reviews fetched', {
    reviews: mapped,
    performance: mapped,
    stats: {
      total,
      pendingHr,
      completed,
      draft,
    },
    pagination: { page, limit, total },
  });
});

/**
 * PATCH /hr/performance/:id/hr-review
 * Body: { hrReview, overallRating?, trainingRecommendation?, promotionRecommendation? }
 */
export const submitHrReview = asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findById(req.params.id).populate(
    'employee',
    'name email',
  );
  if (!review) throw new ApiError(404, 'Review not found');

  const hrReview = String(req.body.hrReview || req.body.remarks || '').trim();
  if (hrReview.length < 5) {
    throw new ApiError(400, 'hrReview must be at least 5 characters');
  }

  const overallRaw =
    req.body.overallRating ?? req.body.rating ?? review.rating;
  const overallRating = Number(overallRaw);
  if (!overallRating || overallRating < 1 || overallRating > 5) {
    throw new ApiError(400, 'overallRating must be between 1 and 5');
  }

  review.hrReview = hrReview;
  review.overallRating = overallRating;
  if (req.body.trainingRecommendation !== undefined) {
    review.trainingRecommendation = String(
      req.body.trainingRecommendation || '',
    ).trim();
  }
  if (req.body.promotionRecommendation) {
    const pr = String(req.body.promotionRecommendation);
    if (['none', 'promote', 'demote'].includes(pr)) {
      review.promotionRecommendation = pr;
    }
  }
  review.hrReviewedBy = req.user._id;
  review.hrReviewedAt = new Date();
  review.status = 'completed';
  await review.save();

  const populated = await PerformanceReview.findById(review._id)
    .populate('employee', 'name email employeeId department designation')
    .populate('manager', 'name email')
    .populate('reviewer', 'name email')
    .populate('hrReviewedBy', 'name email');

  const empEmail = populated?.employee?.email;
  if (empEmail) {
    await notifyRequesterOnDecision({
      to: empEmail,
      userId: populated?.employee?._id,
      title: `Performance review finalized — ${review.period}`,
      message: `HR finalized your performance review for ${review.period}: ${overallRating}/5.`,
      decision: 'approved',
      type: 'success',
    }).catch(() => null);
  }

  return success(res, 200, 'HR performance review saved', {
    review: mapReview(populated),
  });
});

/**
 * GET /hr/performance/report
 * Aggregate company performance overview for HR/Admin.
 */
export const getPerformanceReport = asyncHandler(async (req, res) => {
  const reviews = await PerformanceReview.find()
    .populate('employee', 'name email employeeId department')
    .populate('manager', 'name email')
    .sort({ createdAt: -1 })
    .limit(200);

  const mapped = reviews.map(mapReview);
  const rated = mapped.filter((r) => Number(r.overallRating || r.rating) > 0);
  const avg = (arr, key) => {
    const vals = arr.map((r) => Number(r[key])).filter((n) => n > 0);
    if (!vals.length) return 0;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  };

  const byStatus = mapped.reduce((acc, r) => {
    const s = r.status || 'draft';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const top = [...rated]
    .sort(
      (a, b) =>
        Number(b.overallRating || b.rating) -
        Number(a.overallRating || a.rating),
    )
    .slice(0, 5)
    .map((r) => ({
      employeeName: r.employeeName,
      period: r.period,
      rating: r.overallRating || r.rating,
      status: r.status,
    }));

  const pending = mapped.filter((r) => r.status === 'pending_hr');

  const activeGoals = await Goal.countDocuments({ status: 'active' });
  const completedGoals = await Goal.countDocuments({ status: 'completed' });

  return success(res, 200, 'Performance report', {
    report: {
      reviewsCount: mapped.length,
      ratedCount: rated.length,
      pendingHrCount: pending.length,
      completedCount: byStatus.completed || 0,
      averageManagerRating: avg(mapped, 'rating'),
      averageOverallRating: avg(
        mapped.filter((r) => r.overallRating),
        'overallRating',
      ),
      byStatus,
      topPerformers: top,
      pendingHr: pending.slice(0, 10),
      goals: { active: activeGoals, completed: completedGoals },
      generatedAt: new Date().toISOString(),
    },
    reviews: mapped,
  });
});

/**
 * GET /hr/performance/:id — single review detail (+ optional task stats)
 */
export const getPerformanceById = asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findById(req.params.id)
    .populate('employee', 'name email employeeId department designation')
    .populate('manager', 'name email')
    .populate('reviewer', 'name email')
    .populate('hrReviewedBy', 'name email');

  if (!review) throw new ApiError(404, 'Review not found');

  const empId = review.employee?._id || review.employee;
  let tasksCompleted = 0;
  let tasksTotal = 0;
  if (empId) {
    [tasksCompleted, tasksTotal] = await Promise.all([
      Task.countDocuments({
        assignee: empId,
        status: 'completed',
        isDeleted: false,
      }).catch(() => 0),
      Task.countDocuments({ assignee: empId, isDeleted: false }).catch(() => 0),
    ]);
  }

  return success(res, 200, 'Review fetched', {
    review: {
      ...mapReview(review),
      tasksCompleted,
      tasksTotal,
    },
  });
});
