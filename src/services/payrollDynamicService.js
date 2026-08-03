import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import { LeaveRequest } from '../models/Leave.js';
import LoanAdvanceRequest from '../models/LoanAdvance.js';
import ExpenseClaim from '../models/Expense.js';
import OvertimeRequest from '../models/OvertimeRequest.js';
import {
  SalaryStructure,
  PayrollRun,
  Payslip,
  PayrollAdjustment,
} from '../models/Payroll.js';
import AttendanceRules from '../models/AttendanceRules.js';
import { UPLOADS_ROOT } from '../utils/recruitmentHelpers.js';

const RULE_DEFAULTS = {
  workingDaysPerMonth: 26,
  lateCountForDayDeduction: 3,
  perfectAttendanceBonusPercent: 5,
  attendanceBonusMinPresentPercent: 95,
};

const getRulesDto = async () => {
  let doc = await AttendanceRules.findOne({ key: 'default' });
  if (!doc) {
    doc = await AttendanceRules.create({ key: 'default' });
  }
  const r = doc.toObject();
  return {
    workingDaysPerMonth:
      r.workingDaysPerMonth ?? RULE_DEFAULTS.workingDaysPerMonth,
    lateCountForDayDeduction:
      r.lateCountForDayDeduction ?? RULE_DEFAULTS.lateCountForDayDeduction,
    perfectAttendanceBonusPercent:
      r.perfectAttendanceBonusPercent ??
      RULE_DEFAULTS.perfectAttendanceBonusPercent,
    attendanceBonusMinPresentPercent:
      r.attendanceBonusMinPresentPercent ??
      RULE_DEFAULTS.attendanceBonusMinPresentPercent,
  };
};

const sumValues = (obj = {}) =>
  Object.values(obj || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);

const monthBounds = (month, year) => {
  const m = Number(month);
  const y = Number(year);
  const start = new Date(y, m - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end, month: m, year: y };
};

const parseMonthKey = (key) => {
  // "2026-08" or { month, year }
  if (typeof key === 'string' && /^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split('-').map(Number);
    return { month: m, year: y };
  }
  return {
    month: Number(key?.month) || new Date().getMonth() + 1,
    year: Number(key?.year) || new Date().getFullYear(),
  };
};

const monthKey = (month, year) =>
  `${year}-${String(month).padStart(2, '0')}`;

/**
 * Ensure SalaryStructure exists from Employee.salary (basic = salary).
 */
export const ensureStructureForEmployee = async (emp) => {
  const userId = emp.user;
  let structure = await SalaryStructure.findOne({ employee: userId });
  if (!structure) {
    const basic = Number(emp.salary) || 0;
    structure = await SalaryStructure.create({
      employee: userId,
      basic,
      allowances: { housing: 0, transport: 0, medical: 0, other: 0 },
      deductions: { tax: 0, providentFund: 0, loan: 0, other: 0 },
      isActive: true,
      effectiveFrom: new Date(),
    });
  }
  return structure;
};

export const structureToFront = (structure, emp) => {
  const a = structure.allowances || {};
  const d = structure.deductions || {};
  return {
    employeeId: emp?.empId || '',
    userId: String(structure.employee),
    basic: Number(structure.basic) || 0,
    houseRent: Number(a.housing) || 0,
    transport: Number(a.transport) || 0,
    medical: Number(a.medical) || 0,
    otherAllowance: Number(a.other) || 0,
    tax: Number(d.tax) || 0,
    providentFund: Number(d.providentFund) || 0,
    otherDeduction: Number(d.other) || 0,
    loanFixed: Number(d.loan) || 0,
    currency: structure.currency || 'PKR',
    isActive: structure.isActive !== false,
  };
};

export const frontToStructureBody = (payload = {}) => ({
  basic: Number(payload.basic) || 0,
  allowances: {
    housing: Number(payload.houseRent ?? payload.housing) || 0,
    transport: Number(payload.transport) || 0,
    medical: Number(payload.medical) || 0,
    other: Number(payload.otherAllowance ?? payload.other) || 0,
  },
  deductions: {
    tax: Number(payload.tax) || 0,
    providentFund: Number(payload.providentFund) || 0,
    loan: Number(payload.loanFixed ?? payload.loan) || 0,
    other: Number(payload.otherDeduction ?? payload.otherDeduction) || 0,
  },
});

const attendanceImpact = async (userId, month, year, rules, gross) => {
  const { start, end } = monthBounds(month, year);
  const workingDays = Number(rules.workingDaysPerMonth) || 26;
  const dayPay = Math.round((Number(gross) || 0) / workingDays);

  const records = await Attendance.find({
    employee: userId,
    date: { $gte: start, $lte: end },
  }).lean();

  const lateDays = records.filter((r) => r.status === 'late').length;
  const lateDeductionDays = Math.floor(
    lateDays / (Number(rules.lateCountForDayDeduction) || 3)
  );
  const absentDays = records.filter((r) => r.status === 'absent').length;
  const halfDays = records.filter(
    (r) => r.status === 'half-day' || r.status === 'half_day'
  ).length;

  const leaves = await LeaveRequest.find({
    employee: userId,
    status: 'approved',
    startDate: { $lte: end },
    endDate: { $gte: start },
  }).lean();

  let unpaidLeaveDays = 0;
  leaves.forEach((l) => {
    const lt = String(l.leaveType || '').toLowerCase();
    if (lt.includes('unpaid') || lt === 'unpaid') {
      unpaidLeaveDays += Number(l.days) || 1;
    }
  });

  const lateDeduction = lateDeductionDays * dayPay;
  const absentDeduction = absentDays * dayPay;
  const unpaidLeaveDeduction = unpaidLeaveDays * dayPay;
  const halfDayDeduction = Math.round(halfDays * dayPay * 0.5);

  const presentLike = records.filter((r) =>
    ['present', 'late', 'half-day', 'half_day', 'wfh'].includes(r.status)
  ).length;
  const presentPercent = Math.round((presentLike / workingDays) * 100);
  const bonusEligible =
    presentPercent >= (Number(rules.attendanceBonusMinPresentPercent) || 95);
  const attendanceBonus = bonusEligible
    ? Math.round(
        ((Number(gross) || 0) *
          (Number(rules.perfectAttendanceBonusPercent) || 0)) /
          100
      )
    : 0;

  return {
    lateDays,
    lateDeductionDays,
    absentDays,
    halfDays,
    unpaidLeaveDays,
    dayPay,
    lateDeduction,
    absentDeduction,
    unpaidLeaveDeduction,
    halfDayDeduction,
    attendanceDeduction:
      lateDeduction + absentDeduction + unpaidLeaveDeduction + halfDayDeduction,
    presentPercent,
    attendanceBonus,
  };
};

const loanAdvanceForMonth = async (userId, month, year) => {
  const { start, end } = monthBounds(month, year);
  const approved = await LoanAdvanceRequest.find({
    employee: userId,
    status: 'approved',
  }).lean();

  let loanDeduction = 0;
  let advanceDeduction = 0;
  const details = [];

  approved.forEach((row) => {
    const reviewed = row.reviewedAt || row.updatedAt || row.createdAt;
    if (!reviewed) return;
    const startMonth = new Date(reviewed);
    startMonth.setDate(1);
    startMonth.setHours(0, 0, 0, 0);
    const installments = Math.max(1, Number(row.installments) || 1);
    const perMonth = Math.ceil(Number(row.amount) / installments);
    const endInstall = new Date(startMonth);
    endInstall.setMonth(endInstall.getMonth() + installments);
    // current period start within installment window
    if (start >= startMonth && start < endInstall) {
      if (row.type === 'loan') {
        loanDeduction += perMonth;
        details.push({
          type: 'loan',
          amount: perMonth,
          total: row.amount,
          installments,
          reason: row.reason,
        });
      } else {
        advanceDeduction += perMonth;
        details.push({
          type: 'advance',
          amount: perMonth,
          total: row.amount,
          installments,
          reason: row.reason,
        });
      }
    }
  });

  return { loanDeduction, advanceDeduction, details, period: { start, end } };
};

const expensesForMonth = async (userId, month, year) => {
  const { start, end } = monthBounds(month, year);
  const rows = await ExpenseClaim.find({
    employee: userId,
    status: { $in: ['approved', 'reimbursed'] },
    expenseDate: { $gte: start, $lte: end },
  }).lean();
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return {
    expenseReimbursement: total,
    items: rows.map((r) => ({
      id: String(r._id),
      title: r.title,
      amount: r.amount,
      category: r.category,
      date: r.expenseDate,
    })),
  };
};

const overtimeForMonth = async (userId, month, year, hourlyRate) => {
  const { start, end } = monthBounds(month, year);
  const rows = await OvertimeRequest.find({
    employee: userId,
    status: 'approved',
    date: { $gte: start, $lte: end },
  }).lean();
  const hours = rows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  // 1.5x hourly
  const amount = Math.round(hours * hourlyRate * 1.5);
  return {
    overtimeHours: hours,
    overtimeEarning: amount,
    items: rows.map((r) => ({
      id: String(r._id),
      hours: r.hours,
      reason: r.reason,
      date: r.date,
    })),
  };
};

const adjustmentsForMonth = async (userId, month, year) => {
  const rows = await PayrollAdjustment.find({
    employee: userId,
    month,
    year,
  }).lean();
  let bonus = 0;
  let deduction = 0;
  rows.forEach((r) => {
    if (r.type === 'bonus') bonus += Number(r.amount) || 0;
    else deduction += Number(r.amount) || 0;
  });
  return { bonus, deduction, items: rows };
};

/**
 * Build one employee payslip computation for a month.
 */
export const buildEmployeePayslipData = async ({
  emp,
  structure,
  month,
  year,
  rules,
  bonusesMap = {},
}) => {
  const userId = emp.user;
  const front = structureToFront(structure, emp);
  const gross =
    front.basic +
    front.houseRent +
    front.transport +
    front.medical +
    front.otherAllowance;

  const fixedDeductions =
    front.tax + front.providentFund + front.otherDeduction + front.loanFixed;

  const att = await attendanceImpact(userId, month, year, rules, gross);
  const loans = await loanAdvanceForMonth(userId, month, year);
  const expenses = await expensesForMonth(userId, month, year);
  const hourly =
    (Number(gross) || 0) /
    ((Number(rules.workingDaysPerMonth) || 26) * 8);
  const ot = await overtimeForMonth(userId, month, year, hourly || 0);
  const adj = await adjustmentsForMonth(userId, month, year);

  const manualBonus =
    Number(bonusesMap[String(userId)]) ||
    Number(bonusesMap[emp.empId]) ||
    0;

  const earnings = {
    basic: front.basic,
    houseRent: front.houseRent,
    transport: front.transport,
    medical: front.medical,
    otherAllowance: front.otherAllowance,
    overtime: ot.overtimeEarning,
    expenseReimbursement: expenses.expenseReimbursement,
    attendanceBonus: att.attendanceBonus,
    hrBonus: adj.bonus + manualBonus,
  };

  const deductions = {
    tax: front.tax,
    providentFund: front.providentFund,
    otherFixed: front.otherDeduction,
    structureLoan: front.loanFixed,
    late: att.lateDeduction,
    absent: att.absentDeduction,
    lwp: att.unpaidLeaveDeduction,
    halfDay: att.halfDayDeduction,
    loan: loans.loanDeduction,
    advance: loans.advanceDeduction,
    manual: adj.deduction,
  };

  const totalEarnings = sumValues(earnings);
  const totalDeductions = sumValues(deductions);
  const net = Math.max(0, totalEarnings - totalDeductions);

  return {
    employee: userId,
    empId: emp.empId,
    employeeName: emp.name,
    designation: emp.designation || emp.role || '',
    department: emp.department || '',
    month,
    year,
    monthKey: monthKey(month, year),
    basic: front.basic,
    allowancesTotal:
      front.houseRent + front.transport + front.medical + front.otherAllowance,
    deductionsTotal: totalDeductions,
    bonus: earnings.hrBonus + earnings.attendanceBonus,
    netSalary: net,
    gross: totalEarnings,
    totalEarnings,
    totalDeductions,
    net,
    earnings,
    deductions,
    breakdown: {
      earnings,
      deductions,
      attendance: att,
      loans: loans.details,
      expenses: expenses.items,
      overtime: ot.items,
      adjustments: adj.items,
      structure: front,
      salaryFromEmployee: Number(emp.salary) || 0,
    },
  };
};

export const generatePayslipPdfFile = async (payslipDoc, meta = {}) => {
  const dir = path.join(UPLOADS_ROOT, 'payslips');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `payslip_${payslipDoc.empId || payslipDoc.employee}_${payslipDoc.year}_${String(payslipDoc.month).padStart(2, '0')}.pdf`;
  const filePath = path.join(dir, fileName);

  const b = payslipDoc.breakdown || {};
  const earnings = b.earnings || {};
  const deductions = b.deductions || {};

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(18).text('Brilliance EMS — Payslip', { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .text(
        `Period: ${monthKey(payslipDoc.month, payslipDoc.year)}`,
        { align: 'center' }
      );
    doc.moveDown();
    doc.fontSize(12).text(`Employee: ${meta.employeeName || payslipDoc.employeeName || ''}`);
    doc.text(`Emp ID: ${meta.empId || payslipDoc.empId || ''}`);
    doc.text(`Designation: ${meta.designation || payslipDoc.designation || ''}`);
    doc.text(`Department: ${meta.department || payslipDoc.department || ''}`);
    doc.moveDown();

    doc.fontSize(13).text('Earnings', { underline: true });
    Object.entries(earnings).forEach(([k, v]) => {
      if (Number(v)) doc.fontSize(11).text(`${k}: Rs ${Number(v).toLocaleString()}`);
    });
    doc.moveDown(0.5);
    doc.fontSize(13).text('Deductions', { underline: true });
    Object.entries(deductions).forEach(([k, v]) => {
      if (Number(v)) doc.fontSize(11).text(`${k}: Rs ${Number(v).toLocaleString()}`);
    });
    doc.moveDown();
    doc.fontSize(12).text(`Gross / Total Earnings: Rs ${Number(payslipDoc.gross || payslipDoc.totalEarnings || 0).toLocaleString()}`);
    doc.text(`Total Deductions: Rs ${Number(payslipDoc.deductionsTotal || 0).toLocaleString()}`);
    doc.fontSize(14).text(`Net Pay: Rs ${Number(payslipDoc.netSalary || 0).toLocaleString()}`, {
      underline: true,
    });
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#666').text('Generated by Brilliance EMS', {
      align: 'center',
    });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return {
    pdfUrl: `/uploads/payslips/${fileName}`,
    fileName,
    filePath,
  };
};

export const runDynamicPayroll = async ({
  month: monthIn,
  year: yearIn,
  monthKey: monthKeyIn,
  bonuses = {},
  processedBy,
}) => {
  const parsed = monthKeyIn
    ? parseMonthKey(monthKeyIn)
    : { month: monthIn, year: yearIn };
  const month = Number(parsed.month);
  const year = Number(parsed.year);
  if (!month || !year) throw new Error('month and year required');

  const rules = await getRulesDto();
  const employees = await Employee.find({
    status: { $nin: ['Deleted', 'Inactive'] },
  }).lean();

  let run = await PayrollRun.findOne({ month, year });
  if (!run) {
    run = await PayrollRun.create({
      month,
      year,
      status: 'draft',
      notes: `Dynamic payroll ${monthKey(month, year)}`,
    });
  }

  const payslips = [];
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  let totalBonus = 0;

  for (const emp of employees) {
    if (!emp.user) continue;
    const structure = await ensureStructureForEmployee(emp);
    const data = await buildEmployeePayslipData({
      emp,
      structure,
      month,
      year,
      rules,
      bonusesMap: bonuses,
    });

    const pdfMeta = {
      employeeName: emp.name,
      empId: emp.empId,
      designation: emp.designation,
      department: emp.department,
    };

    let payslip = await Payslip.findOneAndUpdate(
      { employee: emp.user, month, year },
      {
        payrollRun: run._id,
        employee: emp.user,
        month,
        year,
        basic: data.basic,
        allowancesTotal: data.allowancesTotal,
        deductionsTotal: data.deductionsTotal,
        bonus: data.bonus,
        netSalary: data.netSalary,
        breakdown: {
          ...data.breakdown,
          earnings: data.earnings,
          deductions: data.deductions,
          gross: data.gross,
          net: data.net,
          empId: emp.empId,
          employeeName: emp.name,
          designation: emp.designation,
          department: emp.department,
          monthKey: data.monthKey,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      const pdf = await generatePayslipPdfFile(
        {
          ...payslip.toObject(),
          empId: emp.empId,
          employeeName: emp.name,
          designation: emp.designation,
          department: emp.department,
          gross: data.gross,
          totalEarnings: data.totalEarnings,
        },
        pdfMeta
      );
      payslip.pdfUrl = pdf.pdfUrl;
      await payslip.save();
    } catch {
      // PDF optional — payslip still saved
    }

    payslips.push({
      id: String(payslip._id),
      ...data,
      pdfUrl: payslip.pdfUrl,
      status: run.status === 'paid' ? 'Paid' : 'Processed',
    });

    totalGross += data.gross;
    totalDeductions += data.totalDeductions;
    totalNet += data.net;
    totalBonus += data.bonus;
  }

  run.status = 'processed';
  run.processedBy = processedBy;
  run.processedAt = new Date();
  run.notes = JSON.stringify({
    totalGross,
    totalDeductions,
    totalNet,
    totalBonus,
    employeeCount: payslips.length,
  });
  await run.save();

  return {
    run: {
      id: String(run._id),
      month: monthKey(month, year),
      monthNum: month,
      year,
      status: 'Completed',
      employeeCount: payslips.length,
      totalGross,
      totalDeductions,
      totalNet,
      totalBonus,
      processedAt: run.processedAt,
      createdAt: run.createdAt,
    },
    payslips,
    rules,
  };
};

export { parseMonthKey, monthKey, monthBounds, sumValues };
