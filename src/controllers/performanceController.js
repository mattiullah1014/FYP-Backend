import { Goal, PerformanceReview } from '../models/Performance.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';

const createGoal = asyncHandler(async (req, res) => {
  const employeeId = req.body.employee || req.user._id;

  if (
    req.user.role === ROLES.MANAGER &&
    String(employeeId) !== String(req.user._id)
  ) {
    const member = await User.findById(employeeId);
    if (!member || String(member.manager) !== String(req.user._id)) {
      throw new ApiError(403, 'Not your team member');
    }
  }

  if (
    req.user.role === ROLES.EMPLOYEE &&
    String(employeeId) !== String(req.user._id)
  ) {
    throw new ApiError(403, 'Employees can only create own goals');
  }

  const goal = await Goal.create({
    ...req.body,
    employee: employeeId,
    assignedBy: req.user._id,
  });
  return success(res, 201, 'Goal created', { goal });
});

const listGoals = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.EMPLOYEE) {
    filter.employee = req.user._id;
  } else if (req.user.role === ROLES.MANAGER) {
    const team = await User.find({ manager: req.user._id }).select('_id');
    filter.employee = {
      $in: [...team.map((t) => t._id), req.user._id],
    };
  } else if (req.query.employee) {
    filter.employee = req.query.employee;
  }

  const goals = await Goal.find(filter)
    .populate('employee', 'name email')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Goals fetched', { goals });
});

const updateGoal = asyncHandler(async (req, res) => {
  const goal = await Goal.findById(req.params.id);
  if (!goal) throw new ApiError(404, 'Goal not found');

  const isOwner = String(goal.employee) === String(req.user._id);
  if (!isOwner && ![ROLES.MANAGER, ...HR_ADMIN].includes(req.user.role)) {
    throw new ApiError(403, 'Not allowed');
  }

  ['title', 'description', 'targetValue', 'currentValue', 'status', 'dueDate'].forEach(
    (k) => {
      if (req.body[k] !== undefined) goal[k] = req.body[k];
    }
  );
  await goal.save();
  return success(res, 200, 'Goal updated', { goal });
});

const createReview = asyncHandler(async (req, res) => {
  const review = await PerformanceReview.create({
    ...req.body,
    reviewer: req.user._id,
  });
  return success(res, 201, 'Review created', { review });
});

const submitSelfAssessment = asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  if (String(review.employee) !== String(req.user._id)) {
    throw new ApiError(403, 'Not your review');
  }
  review.selfAssessment = req.body.selfAssessment;
  review.status = 'submitted';
  await review.save();
  return success(res, 200, 'Self-assessment submitted', { review });
});

const completeReview = asyncHandler(async (req, res) => {
  const review = await PerformanceReview.findById(req.params.id).populate(
    'employee'
  );
  if (!review) throw new ApiError(404, 'Review not found');

  if (req.user.role === ROLES.MANAGER) {
    if (String(review.employee.manager) !== String(req.user._id)) {
      throw new ApiError(403, 'Not your team member');
    }
  }

  review.managerComments = req.body.managerComments;
  review.rating = req.body.rating;
  review.promotionRecommendation = req.body.promotionRecommendation || 'none';
  review.reviewer = req.user._id;
  // Manager path → send to HR; HR/Admin completing via this endpoint also finalizes
  if (req.user.role === ROLES.MANAGER) {
    review.status = 'pending_hr';
  } else {
    review.status = 'completed';
  }
  await review.save();
  return success(res, 200, 'Review completed', { review });
});

const listReviews = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.EMPLOYEE) filter.employee = req.user._id;
  else if (req.user.role === ROLES.MANAGER) {
    const team = await User.find({ manager: req.user._id }).select('_id');
    filter.employee = { $in: team.map((t) => t._id) };
  } else if (req.query.employee) filter.employee = req.query.employee;

  const reviews = await PerformanceReview.find(filter)
    .populate('employee', 'name email')
    .populate('reviewer', 'name email')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Reviews fetched', { reviews });
});

export { createGoal,
  listGoals,
  updateGoal,
  createReview,
  submitSelfAssessment,
  completeReview,
  listReviews, };
