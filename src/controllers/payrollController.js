import {
  SalaryStructure,
  PayrollRun,
  Payslip,
  PayrollAdjustment,
} from '../models/Payroll.js';
import Employee from '../models/Employee.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { ROLES } from '../constants/roles.js';
import {
  ensureStructureForEmployee,
  structureToFront,
  frontToStructureBody,
  runDynamicPayroll,
  parseMonthKey,
  monthKey,
  generatePayslipPdfFile,
} from '../services/payrollDynamicService.js';

const findEmployeeByParam = async (raw) => {
  const id = String(raw || '').trim();
  let emp = await Employee.findOne({ empId: id });
  if (!emp && /^[a-f\d]{24}$/i.test(id)) {
    emp = await Employee.findById(id);
  }
  if (!emp && /^[a-f\d]{24}$/i.test(id)) {
    emp = await Employee.findOne({ user: id });
  }
  return emp;
};

const payslipDto = (doc) => {
  const p = doc?.toObject ? doc.toObject() : doc;
  const b = p.breakdown || {};
  return {
    id: String(p._id),
    employee: p.employee,
    empId: b.empId || '',
    employeeName: b.employeeName || '',
    designation: b.designation || '',
    department: b.department || '',
    month: b.monthKey || monthKey(p.month, p.year),
    monthNum: p.month,
    year: p.year,
    basic: p.basic,
    allowancesTotal: p.allowancesTotal,
    deductionsTotal: p.deductionsTotal,
    bonus: p.bonus,
    net: p.netSalary,
    netSalary: p.netSalary,
    gross:
      b.gross ||
      Number(p.basic || 0) +
        Number(p.allowancesTotal || 0) +
        Number(p.bonus || 0),
    earnings: b.earnings || {},
    deductions: b.deductions || {},
    totalDeductions: p.deductionsTotal,
    breakdown: b,
    pdfUrl: p.pdfUrl || null,
    status: 'Processed',
    createdAt: p.createdAt,
  };
};

/** POST /hr/payroll/generate | POST /payroll/run */
const runPayroll = asyncHandler(async (req, res) => {
  let month = req.body.month;
  let year = req.body.year;
  if (typeof month === 'string' && month.includes('-')) {
    const parsed = parseMonthKey(month);
    month = parsed.month;
    year = parsed.year;
  }
  if (!month || !year) {
    const now = new Date();
    month = month || now.getMonth() + 1;
    year = year || now.getFullYear();
  }

  const result = await runDynamicPayroll({
    month,
    year,
    bonuses: req.body.bonuses || {},
    processedBy: req.user._id,
  });

  return success(res, 200, 'Payroll processed', result);
});

/** GET /hr/payroll/runs | GET /payroll/runs */
const listPayrollRuns = asyncHandler(async (req, res) => {
  const runs = await PayrollRun.find().sort({ year: -1, month: -1 }).limit(36);
  const mapped = runs.map((r) => {
    let totals = {};
    try {
      totals = r.notes ? JSON.parse(r.notes) : {};
    } catch {
      totals = {};
    }
    return {
      id: String(r._id),
      month: monthKey(r.month, r.year),
      monthNum: r.month,
      year: r.year,
      status: r.status === 'processed' ? 'Completed' : r.status,
      employeeCount: totals.employeeCount || 0,
      totalGross: totals.totalGross || 0,
      totalDeductions: totals.totalDeductions || 0,
      totalNet: totals.totalNet || 0,
      totalBonus: totals.totalBonus || 0,
      processedAt: r.processedAt,
      createdAt: r.createdAt,
    };
  });
  return success(res, 200, 'Payroll runs fetched', { runs: mapped });
});

/** GET /hr/payroll/payslips?month=2026-08 */
const listPayslipsHr = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.month) {
    const { month, year } = parseMonthKey(req.query.month);
    filter.month = month;
    filter.year = year;
  }
  if (req.query.employeeId) {
    const emp = await findEmployeeByParam(req.query.employeeId);
    if (emp) filter.employee = emp.user;
  }
  const rows = await Payslip.find(filter)
    .sort({ year: -1, month: -1 })
    .limit(500);
  return success(res, 200, 'Payslips fetched', {
    payslips: rows.map(payslipDto),
  });
});

/** GET /payroll/payslips/me | GET /employee/payroll/payslips */
const myPayslips = asyncHandler(async (req, res) => {
  const rows = await Payslip.find({ employee: req.user._id }).sort({
    year: -1,
    month: -1,
  });
  return success(res, 200, 'Payslips fetched', {
    payslips: rows.map(payslipDto),
  });
});

/** GET /payroll/payslips/:id */
const getPayslip = asyncHandler(async (req, res) => {
  const payslip = await Payslip.findById(req.params.id).populate(
    'employee',
    'name email employeeId'
  );
  if (!payslip) throw new ApiError(404, 'Payslip not found');

  const isOwner =
    String(payslip.employee?._id || payslip.employee) === String(req.user._id);
  if (!isOwner && ![ROLES.HR, ROLES.ADMIN].includes(req.user.role)) {
    throw new ApiError(403, 'Not allowed');
  }
  return success(res, 200, 'Payslip fetched', { payslip: payslipDto(payslip) });
});

/** GET .../payslips/:id/pdf */
const downloadPayslipPdf = asyncHandler(async (req, res) => {
  const payslip = await Payslip.findById(req.params.id);
  if (!payslip) throw new ApiError(404, 'Payslip not found');

  const isOwner = String(payslip.employee) === String(req.user._id);
  if (!isOwner && ![ROLES.HR, ROLES.ADMIN].includes(req.user.role)) {
    throw new ApiError(403, 'Not allowed');
  }

  if (!payslip.pdfUrl) {
    const b = payslip.breakdown || {};
    const pdf = await generatePayslipPdfFile(
      {
        ...payslip.toObject(),
        empId: b.empId,
        employeeName: b.employeeName,
        designation: b.designation,
        department: b.department,
        gross: b.gross,
        totalEarnings: b.gross,
      },
      {
        employeeName: b.employeeName,
        empId: b.empId,
        designation: b.designation,
        department: b.department,
      }
    );
    payslip.pdfUrl = pdf.pdfUrl;
    await payslip.save();
  }

  return success(res, 200, 'Payslip PDF ready', {
    pdfUrl: payslip.pdfUrl,
    url: payslip.pdfUrl,
  });
});

/** GET /employee/payroll/summary */
const myPayrollSummary = asyncHandler(async (req, res) => {
  const slips = await Payslip.find({ employee: req.user._id })
    .sort({ year: -1, month: -1 })
    .limit(12);
  const latest = slips[0] ? payslipDto(slips[0]) : null;
  const ytdNet = slips.reduce((s, p) => s + (Number(p.netSalary) || 0), 0);
  return success(res, 200, 'Payroll summary', {
    summary: {
      latestNet: latest?.net || 0,
      latestMonth: latest?.month || null,
      ytdNet,
      payslipCount: slips.length,
    },
  });
});

/** PATCH /hr/payroll/employees/:id/components */
const updateSalaryComponents = asyncHandler(async (req, res) => {
  const emp = await findEmployeeByParam(req.params.id);
  if (!emp) throw new ApiError(404, 'Employee not found');

  const body = frontToStructureBody(req.body);
  const structure = await SalaryStructure.findOneAndUpdate(
    { employee: emp.user },
    {
      ...body,
      employee: emp.user,
      isActive: true,
      effectiveFrom: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  const gross =
    Number(structure.basic || 0) +
    Number(structure.allowances?.housing || 0) +
    Number(structure.allowances?.transport || 0) +
    Number(structure.allowances?.medical || 0) +
    Number(structure.allowances?.other || 0);
  emp.salary = Number(structure.basic) || emp.salary;
  await emp.save();

  return success(res, 200, 'Salary structure saved', {
    structure: structureToFront(structure, emp),
    gross,
    employee: {
      id: String(emp._id),
      empId: emp.empId,
      name: emp.name,
      salary: emp.salary,
    },
  });
});

/** GET structure by empId / user id */
const getStructure = asyncHandler(async (req, res) => {
  const emp = await findEmployeeByParam(
    req.params.id || req.params.employeeId
  );
  if (!emp) throw new ApiError(404, 'Employee not found');

  if (
    [ROLES.EMPLOYEE, ROLES.MANAGER].includes(req.user.role) &&
    String(emp.user) !== String(req.user._id)
  ) {
    throw new ApiError(403, 'Not allowed');
  }

  const structure = await ensureStructureForEmployee(emp);
  return success(res, 200, 'Salary structure fetched', {
    structure: structureToFront(structure, emp),
  });
});

/** POST /hr/payroll/bonus */
const addBonus = asyncHandler(async (req, res) => {
  const emp = await findEmployeeByParam(
    req.body.employeeId || req.body.empId || req.body.employee
  );
  if (!emp) throw new ApiError(404, 'Employee not found');
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) throw new ApiError(400, 'Valid amount required');

  let { month, year } = req.body;
  if (typeof req.body.month === 'string' && req.body.month.includes('-')) {
    const p = parseMonthKey(req.body.month);
    month = p.month;
    year = p.year;
  }
  if (!month || !year) {
    const now = new Date();
    month = now.getMonth() + 1;
    year = now.getFullYear();
  }

  const adj = await PayrollAdjustment.create({
    employee: emp.user,
    empId: emp.empId,
    month,
    year,
    type: 'bonus',
    amount,
    note: String(req.body.note || req.body.reason || '').trim(),
    createdBy: req.user._id,
  });

  return success(res, 201, 'Bonus added for payroll month', {
    adjustment: {
      id: String(adj._id),
      type: adj.type,
      amount: adj.amount,
      month: monthKey(month, year),
      note: adj.note,
    },
  });
});

/** POST /hr/payroll/deductions */
const addDeduction = asyncHandler(async (req, res) => {
  const emp = await findEmployeeByParam(
    req.body.employeeId || req.body.empId || req.body.employee
  );
  if (!emp) throw new ApiError(404, 'Employee not found');
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) throw new ApiError(400, 'Valid amount required');

  let { month, year } = req.body;
  if (typeof req.body.month === 'string' && req.body.month.includes('-')) {
    const p = parseMonthKey(req.body.month);
    month = p.month;
    year = p.year;
  }
  if (!month || !year) {
    const now = new Date();
    month = now.getMonth() + 1;
    year = now.getFullYear();
  }

  const adj = await PayrollAdjustment.create({
    employee: emp.user,
    empId: emp.empId,
    month,
    year,
    type: 'deduction',
    amount,
    note: String(req.body.note || req.body.reason || '').trim(),
    createdBy: req.user._id,
  });

  return success(res, 201, 'Deduction added for payroll month', {
    adjustment: {
      id: String(adj._id),
      type: adj.type,
      amount: adj.amount,
      month: monthKey(month, year),
      note: adj.note,
    },
  });
});

/** Legacy upsert structure */
const upsertStructure = asyncHandler(async (req, res) => {
  const employee = req.body.employee;
  if (!employee) throw new ApiError(400, 'employee (user id) required');
  const structure = await SalaryStructure.findOneAndUpdate(
    { employee },
    req.body,
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return success(res, 200, 'Salary structure saved', { structure });
});

export {
  upsertStructure,
  getStructure,
  runPayroll,
  myPayslips,
  getPayslip,
  listPayrollRuns,
  listPayslipsHr,
  downloadPayslipPdf,
  myPayrollSummary,
  updateSalaryComponents,
  addBonus,
  addDeduction,
};
