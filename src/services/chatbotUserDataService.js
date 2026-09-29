/**
 * Builds a compact, self-scoped data snapshot for the chatbot.
 * Only the logged-in user's data. Intent-based fetch to keep tokens low.
 */
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import {
  SalaryStructure,
  Payslip,
} from '../models/Payroll.js';
import { LeaveBalance, LeaveRequest } from '../models/Leave.js';
import LoanAdvanceRequest from '../models/LoanAdvance.js';
import ExpenseClaim from '../models/Expense.js';
import { computeNextSalaryDate } from '../utils/salaryDate.js';
import { ROLES } from '../constants/roles.js';

const INTENT = {
  salary: /\b(salary|salar|payslip|payroll|net\s*pay|basic|allowance|deduction|bonus|tanqah|tankhwah|tankhwa|pay\s*slip|wages)\b/i,
  leave: /\b(leave|chutti|vacation|annual|sick|casual|lwp|balance)\b/i,
  attendance: /\b(attendance|hazri|present|absent|late|clock\s*in|check\s*in|wfh|half\s*day)\b/i,
  loan: /\b(loan|advance|qarz|advance\s*salary)\b/i,
  expense: /\b(expense|claim|reimburs|bill)\b/i,
  profile: /\b(profile|cnic|phone|designation|department|manager|emp\s*id|employee\s*id|my\s*info|mera\s*data)\b/i,
};

/** Detect which data buckets the question needs (max 2 to stay small). */
export const detectIntents = (message) => {
  const text = String(message || '');

  // Pure how-to → no DB (saves tokens). Personal facts still match below.
  const howToOnly =
    /\b(kaise|kese|how\s*to|steps?|guide|tutorial)\b/i.test(text) &&
    !/\b(mer[ai]|mera|meri|my|mujhe|kitn[ai]|balance|status|dikhao|batao)\b/i.test(
      text
    );
  if (howToOnly) return [];

  const found = [];
  for (const [key, re] of Object.entries(INTENT)) {
    if (re.test(text)) found.push(key);
  }
  // Vague "mera / meri / my" without clear topic → light profile + latest salary
  if (
    !found.length &&
    /\b(mer[ai]|mera|meri|my|mujhe|mujh|kitn[ai]|batao|dikhao)\b/i.test(text)
  ) {
    found.push('profile', 'salary');
  }
  return found.slice(0, 2);
};

const monthLabel = (m, y) =>
  `${y}-${String(m).padStart(2, '0')}`;

const compactEmp = (emp) => {
  if (!emp) return null;
  return {
    empId: emp.empId,
    name: emp.name,
    designation: emp.designation,
    department: emp.department,
    branch: emp.branch,
    manager: emp.manager,
    status: emp.status,
    joinedAt: emp.joinedAt
      ? new Date(emp.joinedAt).toISOString().slice(0, 10)
      : undefined,
  };
};

async function loadSalary(userId, emp) {
  const [structure, latest] = await Promise.all([
    SalaryStructure.findOne({ employee: userId, isActive: true })
      .select('basic allowances deductions currency')
      .lean(),
    Payslip.findOne({ employee: userId })
      .sort({ year: -1, month: -1 })
      .select('month year basic allowancesTotal deductionsTotal bonus netSalary')
      .lean(),
  ]);

  const a = structure?.allowances || {};
  const d = structure?.deductions || {};
  const basic = Number(structure?.basic ?? emp?.salary) || 0;

  return {
    basicSalary: basic,
    allowances: {
      housing: Number(a.housing) || 0,
      transport: Number(a.transport) || 0,
      medical: Number(a.medical) || 0,
      other: Number(a.other) || 0,
    },
    fixedDeductions: {
      tax: Number(d.tax) || 0,
      providentFund: Number(d.providentFund) || 0,
      loan: Number(d.loan) || 0,
      other: Number(d.other) || 0,
    },
    currency: structure?.currency || 'PKR',
    latestPayslip: latest
      ? {
          month: monthLabel(latest.month, latest.year),
          basic: latest.basic,
          allowances: latest.allowancesTotal,
          deductions: latest.deductionsTotal,
          bonus: latest.bonus,
          net: latest.netSalary,
        }
      : null,
    nextSalaryDate: computeNextSalaryDate(),
  };
}

async function loadLeave(userId) {
  const year = new Date().getFullYear();
  const [balances, pending, recent] = await Promise.all([
    LeaveBalance.find({ employee: userId, year })
      .select('leaveType allocated used pending')
      .lean(),
    LeaveRequest.countDocuments({ employee: userId, status: 'pending' }),
    LeaveRequest.find({ employee: userId })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('leaveType startDate endDate days status')
      .lean(),
  ]);

  return {
    year,
    balances: balances.map((b) => ({
      type: b.leaveType,
      allocated: b.allocated,
      used: b.used,
      pending: b.pending,
      remaining: Math.max(0, (b.allocated || 0) - (b.used || 0) - (b.pending || 0)),
    })),
    pendingRequests: pending,
    recent: recent.map((r) => ({
      type: r.leaveType,
      from: r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : null,
      to: r.endDate ? new Date(r.endDate).toISOString().slice(0, 10) : null,
      days: r.days,
      status: r.status,
    })),
  };
}

async function loadAttendance(userId) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const records = await Attendance.find({
    employee: userId,
    date: { $gte: start, $lte: now },
  })
    .select('status lateMinutes')
    .lean();

  const counts = { present: 0, late: 0, absent: 0, 'half-day': 0, wfh: 0, 'on-leave': 0 };
  records.forEach((r) => {
    const s = r.status || 'present';
    counts[s] = (counts[s] || 0) + 1;
  });

  return {
    month: monthLabel(now.getMonth() + 1, now.getFullYear()),
    daysRecorded: records.length,
    counts,
  };
}

async function loadLoan(userId) {
  const rows = await LoanAdvanceRequest.find({ employee: userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('type amount status installments reason createdAt')
    .lean();
  return rows.map((r) => ({
    type: r.type,
    amount: r.amount,
    status: r.status,
    installments: r.installments,
    reason: (r.reason || '').slice(0, 60),
  }));
}

async function loadExpense(userId) {
  const rows = await ExpenseClaim.find({ employee: userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('title amount status category expenseDate')
    .lean();
  return rows.map((r) => ({
    title: r.title,
    amount: r.amount,
    status: r.status,
    category: r.category,
    date: r.expenseDate
      ? new Date(r.expenseDate).toISOString().slice(0, 10)
      : null,
  }));
}

/**
 * @returns {{ intents: string[], contextText: string, meta: object }}
 */
export const buildUserDataContext = async (user, message) => {
  const intents = detectIntents(message);
  const userId = user._id;
  const role = user.role;

  // Candidates / pure help with no personal data intent
  if (!intents.length) {
    return {
      intents: [],
      contextText: '',
      meta: { buckets: [] },
    };
  }

  // Only staff with Employee record get payroll/attendance personal facts
  const staffRoles = [ROLES.EMPLOYEE, ROLES.MANAGER, ROLES.HR, ROLES.ADMIN];
  const emp = staffRoles.includes(role)
    ? await Employee.findOne({ user: userId, status: { $ne: 'Deleted' } })
        .select(
          'empId name designation department branch manager salary status joinedAt'
        )
        .lean()
    : null;

  const data = {
    who: {
      name: user.name,
      email: user.email,
      role,
      phone: user.phone || undefined,
      employeeId: user.employeeId || emp?.empId || undefined,
    },
  };

  if (intents.includes('profile')) {
    data.profile = compactEmp(emp) || {
      note: 'No employee profile linked (candidate or incomplete onboarding).',
    };
  }

  if (intents.includes('salary')) {
    if (emp) data.salary = await loadSalary(userId, emp);
    else data.salary = { note: 'Salary data only for active employees.' };
  }

  if (intents.includes('leave')) {
    data.leave = await loadLeave(userId);
  }

  if (intents.includes('attendance')) {
    if (emp) data.attendance = await loadAttendance(userId);
    else data.attendance = { note: 'Attendance only for employees.' };
  }

  if (intents.includes('loan')) {
    data.loans = await loadLoan(userId);
  }

  if (intents.includes('expense')) {
    data.expenses = await loadExpense(userId);
  }

  // Compact JSON — no pretty indent (saves tokens)
  const contextText = JSON.stringify(data);
  return {
    intents,
    contextText:
      contextText.length > 1800
        ? `${contextText.slice(0, 1800)}…`
        : contextText,
    meta: { buckets: intents, chars: Math.min(contextText.length, 1800) },
  };
};

export default { buildUserDataContext, detectIntents };
