import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import { LeaveRequest } from '../models/Leave.js';
import { Application } from '../models/Recruitment.js';
import { Payslip } from '../models/Payroll.js';
import ExpenseClaim from '../models/Expense.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES } from '../constants/roles.js';

const myDashboard = asyncHandler(async (req, res) => {
  const employeeId = req.user._id;
  const attendanceCount = await Attendance.countDocuments({ employee: employeeId });
  const presentCount = await Attendance.countDocuments({
    employee: employeeId,
    status: { $in: ['present', 'late'] },
  });
  const leaves = await LeaveRequest.find({ employee: employeeId });
  const usedLeaveDays = leaves
    .filter((l) => l.status === 'approved')
    .reduce((s, l) => s + l.days, 0);

  return success(res, 200, 'Personal dashboard', {
    attendancePercentage: attendanceCount
      ? Math.round((presentCount / attendanceCount) * 100)
      : 0,
    usedLeaveDays,
    pendingLeaves: leaves.filter((l) => l.status === 'pending').length,
  });
});

const teamDashboard = asyncHandler(async (req, res) => {
  const team = await User.find({ manager: req.user._id, isDeleted: false }).select(
    '_id name'
  );
  const ids = team.map((t) => t._id);
  const pendingLeaves = await LeaveRequest.countDocuments({
    employee: { $in: ids },
    status: 'pending',
  });
  const pendingExpenses = await ExpenseClaim.countDocuments({
    employee: { $in: ids },
    status: 'pending',
  });
  const attendanceToday = await Attendance.countDocuments({
    employee: { $in: ids },
    date: {
      $gte: new Date(new Date().setHours(0, 0, 0, 0)),
    },
  });

  return success(res, 200, 'Team dashboard', {
    teamSize: team.length,
    pendingLeaves,
    pendingExpenses,
    attendanceToday,
  });
});

const hrDashboard = asyncHandler(async (req, res) => {
  const totalEmployees = await User.countDocuments({
    isDeleted: false,
    role: { $ne: ROLES.CANDIDATE },
  });
  const candidates = await User.countDocuments({
    role: ROLES.CANDIDATE,
    isDeleted: false,
  });
  const applications = await Application.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const openApplications = await Application.countDocuments({
    status: { $in: ['applied', 'shortlisted', 'interview'] },
  });
  const recentPayslips = await Payslip.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  });

  return success(res, 200, 'HR dashboard', {
    totalEmployees,
    candidates,
    hiringFunnel: applications,
    openApplications,
    payslipsLast30Days: recentPayslips,
  });
});

export { myDashboard,
  teamDashboard,
  hrDashboard, };
