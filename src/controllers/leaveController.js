import { LeavePolicy,
  LeaveBalance,
  LeaveRequest, } from '../models/Leave.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES, HR_ADMIN } from '../constants/roles.js';
import { notify } from '../services/notificationService.js';

const startOfDay = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const dayDiff = (start, end) => {
  const ms = startOfDay(end) - startOfDay(start);
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
};

const listPolicies = asyncHandler(async (req, res) => {
  const policies = await LeavePolicy.find({ isActive: true });
  return success(res, 200, 'Leave policies fetched', { policies });
});

const createPolicy = asyncHandler(async (req, res) => {
  const policy = await LeavePolicy.create(req.body);
  return success(res, 201, 'Leave policy created', { policy });
});

const updatePolicy = asyncHandler(async (req, res) => {
  const policy = await LeavePolicy.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!policy) throw new ApiError(404, 'Policy not found');
  return success(res, 200, 'Leave policy updated', { policy });
});

const getMyBalances = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const balances = await LeaveBalance.find({
    employee: req.user._id,
    year,
  });
  return success(res, 200, 'Leave balances fetched', { balances });
});

const allocateBalance = asyncHandler(async (req, res) => {
  const { employee, leaveType, year, allocated } = req.body;
  const balance = await LeaveBalance.findOneAndUpdate(
    { employee, leaveType, year },
    { allocated, employee, leaveType, year },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return success(res, 200, 'Leave balance allocated', { balance });
});

const requestLeave = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, reason } = req.body;
  const days = dayDiff(startDate, endDate);
  if (days < 1) throw new ApiError(400, 'Invalid date range');

  const leave = await LeaveRequest.create({
    employee: req.user._id,
    leaveType,
    startDate,
    endDate,
    days,
    reason,
    status: 'pending',
    managerStatus: 'pending',
    hrStatus: 'not-required',
  });

  const year = new Date(startDate).getFullYear();
  await LeaveBalance.findOneAndUpdate(
    { employee: req.user._id, leaveType, year },
    { $inc: { pending: days } },
    { upsert: true }
  );

  await notify({
    to: req.user.email,
    message: `Leave request submitted (${days} day(s))`,
  });

  return success(res, 201, 'Leave requested', { leave });
});

const myLeaves = asyncHandler(async (req, res) => {
  const leaves = await LeaveRequest.find({ employee: req.user._id }).sort({
    createdAt: -1,
  });
  return success(res, 200, 'Leave history fetched', { leaves });
});

const listLeaveRequests = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === ROLES.MANAGER) {
    const team = await User.find({ manager: req.user._id }).select('_id');
    filter.employee = { $in: team.map((t) => t._id) };
  }
  if (req.query.status) filter.status = req.query.status;

  const leaves = await LeaveRequest.find(filter)
    .populate('employee', 'name email employeeId manager')
    .sort({ createdAt: -1 });
  return success(res, 200, 'Leave requests fetched', { leaves });
});

const reviewLeave = asyncHandler(async (req, res) => {
  const leave = await LeaveRequest.findById(req.params.id).populate('employee');
  if (!leave) throw new ApiError(404, 'Leave request not found');
  if (leave.status !== 'pending') throw new ApiError(400, 'Already reviewed');

  const { decision, note, escalateToHr } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    throw new ApiError(400, 'decision must be approved or rejected');
  }

  if (req.user.role === ROLES.MANAGER) {
    if (String(leave.employee.manager) !== String(req.user._id)) {
      throw new ApiError(403, 'Not your team member');
    }
    leave.managerStatus = decision;
    if (escalateToHr && decision === 'approved') {
      leave.hrStatus = 'pending';
      leave.status = 'pending';
    } else {
      leave.status = decision;
    }
  } else if (HR_ADMIN.includes(req.user.role)) {
    leave.hrStatus = decision;
    leave.status = decision;
    if (leave.managerStatus === 'pending') leave.managerStatus = decision;
  }

  leave.reviewedBy = req.user._id;
  leave.reviewNote = note;
  await leave.save();

  const year = new Date(leave.startDate).getFullYear();
  const balance = await LeaveBalance.findOne({
    employee: leave.employee._id,
    leaveType: leave.leaveType,
    year,
  });
  if (balance) {
    balance.pending = Math.max(0, balance.pending - leave.days);
    if (leave.status === 'approved') balance.used += leave.days;
    await balance.save();
  }

  await notify({
    to: leave.employee.email,
    message: `Leave request ${leave.status}`,
  });

  return success(res, 200, `Leave ${leave.status}`, { leave });
});

export { listPolicies,
  createPolicy,
  updatePolicy,
  getMyBalances,
  allocateBalance,
  requestLeave,
  myLeaves,
  listLeaveRequests,
  reviewLeave, };
