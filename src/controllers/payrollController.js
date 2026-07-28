import { SalaryStructure,
  PayrollRun,
  Payslip, } from '../models/Payroll.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { computeNetSalary } from '../services/payrollService.js';
import { ROLES } from '../constants/roles.js';

const upsertStructure = asyncHandler(async (req, res) => {
  const structure = await SalaryStructure.findOneAndUpdate(
    { employee: req.body.employee },
    req.body,
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return success(res, 200, 'Salary structure saved', { structure });
});

const getStructure = asyncHandler(async (req, res) => {
  const employeeId =
    req.user.role === ROLES.EMPLOYEE || req.user.role === ROLES.MANAGER
      ? req.params.employeeId || req.user._id
      : req.params.employeeId;

  if (
    [ROLES.EMPLOYEE, ROLES.MANAGER].includes(req.user.role) &&
    String(employeeId) !== String(req.user._id) &&
    req.user.role === ROLES.EMPLOYEE
  ) {
    throw new ApiError(403, 'Not allowed');
  }

  const structure = await SalaryStructure.findOne({ employee: employeeId });
  if (!structure) throw new ApiError(404, 'Salary structure not found');
  return success(res, 200, 'Salary structure fetched', { structure });
});

const runPayroll = asyncHandler(async (req, res) => {
  const { month, year, bonuses = {} } = req.body;
  let run = await PayrollRun.findOne({ month, year });
  if (run && run.status !== 'draft') {
    throw new ApiError(400, 'Payroll already processed for this period');
  }
  if (!run) {
    run = await PayrollRun.create({ month, year, status: 'draft' });
  }

  const structures = await SalaryStructure.find({ isActive: true });
  const payslips = [];

  for (const structure of structures) {
    const bonus = bonuses[String(structure.employee)] || 0;
    const computed = computeNetSalary(structure, bonus);
    const payslip = await Payslip.findOneAndUpdate(
      { employee: structure.employee, month, year },
      {
        payrollRun: run._id,
        employee: structure.employee,
        month,
        year,
        ...computed,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    payslips.push(payslip);
  }

  run.status = 'processed';
  run.processedBy = req.user._id;
  run.processedAt = new Date();
  await run.save();

  return success(res, 200, 'Payroll processed', { run, count: payslips.length });
});

const myPayslips = asyncHandler(async (req, res) => {
  const payslips = await Payslip.find({ employee: req.user._id }).sort({
    year: -1,
    month: -1,
  });
  return success(res, 200, 'Payslips fetched', { payslips });
});

const getPayslip = asyncHandler(async (req, res) => {
  const payslip = await Payslip.findById(req.params.id).populate(
    'employee',
    'name email employeeId'
  );
  if (!payslip) throw new ApiError(404, 'Payslip not found');

  const isOwner = String(payslip.employee._id) === String(req.user._id);
  if (!isOwner && ![ROLES.HR, ROLES.ADMIN].includes(req.user.role)) {
    throw new ApiError(403, 'Not allowed');
  }
  return success(res, 200, 'Payslip fetched', { payslip });
});

const listPayrollRuns = asyncHandler(async (req, res) => {
  const runs = await PayrollRun.find().sort({ year: -1, month: -1 });
  return success(res, 200, 'Payroll runs fetched', { runs });
});

export { upsertStructure,
  getStructure,
  runPayroll,
  myPayslips,
  getPayslip,
  listPayrollRuns, };
