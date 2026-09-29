/**
 * Trimmed test seed:
 * - Keep admin: mattimughal80@gmail.com
 * - Keep candidate: mattiullah1014@gmail.com
 * - 1 HR, 1 manager, 10 employees, 5 candidates (+ the kept gmail candidate)
 * Password for seeded accounts: Asdf@@123
 *
 * Usage: node scripts/seed-test-data.mjs
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import User from '../src/models/User.js';
import Employee from '../src/models/Employee.js';
import Department from '../src/models/Department.js';
import Branch from '../src/models/Branch.js';
import Job from '../src/models/Job.js';
import Application from '../src/models/Application.js';
import Attendance from '../src/models/Attendance.js';
import AttendanceRules from '../src/models/AttendanceRules.js';
import ManagerProfile from '../src/models/ManagerProfile.js';
import ManagerEmployeeAssignment from '../src/models/ManagerEmployeeAssignment.js';
import {
  LeavePolicy,
  LeaveBalance,
  LeaveRequest,
} from '../src/models/Leave.js';
import LoanAdvanceRequest from '../src/models/LoanAdvance.js';
import ExpenseClaim from '../src/models/Expense.js';
import OvertimeRequest from '../src/models/OvertimeRequest.js';
import HalfDayRequest from '../src/models/HalfDayRequest.js';
import Task from '../src/models/Task.js';
import { Goal, PerformanceReview } from '../src/models/Performance.js';
import ProfileCompletion from '../src/models/ProfileCompletion.js';
import {
  SalaryStructure,
  PayrollRun,
  Payslip,
  PayrollAdjustment,
} from '../src/models/Payroll.js';
import { Holiday, Shift } from '../src/models/Admin.js';
import { ROLES } from '../src/constants/roles.js';
import { runDynamicPayroll } from '../src/services/payrollDynamicService.js';

const PASSWORD = 'Asdf@@123';
const YEAR = 2026;
const PAYROLL_MONTHS = [7, 8, 9];
const KEEP_ADMIN_EMAIL = 'mattimughal80@gmail.com';
const KEEP_CANDIDATE_EMAIL = 'mattiullah1014@gmail.com';

const EMP_COUNT = 10;
/** New seeded candidates (plus protected KEEP_CANDIDATE_EMAIL = 5 total) */
const CAND_COUNT = 4;

const FIRST_M = ['Ahmed', 'Ali', 'Hassan', 'Usman', 'Bilal', 'Hamza', 'Omar', 'Zain', 'Faizan', 'Saad'];
const FIRST_F = ['Ayesha', 'Fatima', 'Sara', 'Hira', 'Maryam'];
const LAST = ['Khan', 'Ahmed', 'Malik', 'Hussain', 'Raza', 'Iqbal', 'Sheikh', 'Butt', 'Mirza', 'Qureshi'];

const DEPARTMENTS = [
  { name: 'Engineering', code: 'ENG' },
  { name: 'HR', code: 'HR' },
  { name: 'Finance', code: 'FIN' },
  { name: 'Marketing', code: 'MKT' },
  { name: 'Design', code: 'DES' },
  { name: 'Product', code: 'PRD' },
];

const BRANCHES = [
  { name: 'Head Office', code: 'HO', city: 'Lahore', country: 'Pakistan', address: 'Gulberg III, Lahore', phone: '+92-42-111-100-200' },
  { name: 'Karachi Office', code: 'KHI', city: 'Karachi', country: 'Pakistan', address: 'Clifton Block 5', phone: '+92-21-111-100-201' },
];

const DESIGNATIONS = [
  'Software Engineer', 'Frontend Developer', 'Backend Developer', 'QA Engineer',
  'UI/UX Designer', 'Product Analyst', 'Marketing Executive', 'Finance Associate',
  'HR Coordinator', 'DevOps Engineer',
];

const JOB_SAMPLES = [
  {
    title: 'Senior React Native Developer',
    department: 'Engineering',
    location: 'Lahore, PK',
    types: ['Full-time'],
    salaryMin: 150000,
    salaryMax: 220000,
    currency: 'PKR',
    description: 'Lead mobile EMS features for Brilliance Base including attendance, payroll views, and recruitment candidate flows.',
    requirements: ['3+ years React Native', 'Strong REST', 'Production app experience'],
    skills: ['React Native', 'TypeScript'],
  },
  {
    title: 'Backend Node.js Engineer',
    department: 'Engineering',
    location: 'Remote',
    types: ['Full-time'],
    salaryMin: 140000,
    salaryMax: 200000,
    currency: 'PKR',
    description: 'Build Express APIs for HR, payroll, attendance, and manager portals with MongoDB and realtime features.',
    requirements: ['2+ years Node.js', 'MongoDB experience', 'JWT auth'],
    skills: ['Node.js', 'MongoDB'],
  },
  {
    title: 'HR Recruitment Specialist',
    department: 'HR',
    location: 'Lahore, PK',
    types: ['Full-time'],
    salaryMin: 80000,
    salaryMax: 120000,
    currency: 'PKR',
    description: 'Own end-to-end recruitment pipeline: job posting, screening, interviews, and offer coordination.',
    requirements: ['2+ years recruiting', 'Strong communication', 'ATS familiarity'],
    skills: ['Recruitment', 'Interviewing'],
  },
  {
    title: 'UI/UX Designer',
    department: 'Design',
    location: 'Karachi, PK',
    types: ['Full-time'],
    salaryMin: 90000,
    salaryMax: 140000,
    currency: 'PKR',
    description: 'Design mobile and web experiences for employee self-service and candidate apply flows.',
    requirements: ['Strong Figma portfolio', 'Mobile-first design', 'Usability basics'],
    skills: ['Figma', 'UI Design'],
  },
];

const WIPE_COLLECTIONS = [
  'employees', 'jobs', 'jobpostings', 'applications', 'attendances',
  'attendancecorrections', 'halfdayrequests', 'overtimerequests', 'wfhrequests',
  'payslips', 'payrollruns', 'payrolladjustments', 'salarystructures',
  'managerprofiles', 'manageremployeeassignments', 'leavebalances', 'leaverequests',
  'loanadvancerequests', 'expenseclaims', 'tasks', 'goals', 'performancereviews',
  'notifications', 'conversations', 'chatmessages', 'messages', 'supporttickets',
  'assets', 'assetassignments', 'profilecompletions', 'interviews', 'interviewfeedbacks',
  'announcements', 'enrollments', 'courses', 'companypolicies',
];

const credentials = {
  password: PASSWORD,
  admins: [],
  hr: [],
  managers: [],
  employees: [],
  candidates: [],
  jobs: [],
  applications: [],
  summary: {},
};

const pick = (arr, i) => arr[i % arr.length];
const phoneOf = (i) => `+92300${String(1000000 + i).slice(0, 7)}`;
const cnicOf = (i) => `${35202 + (i % 5)}-${String(1000000 + i * 17).slice(0, 7)}-${(i % 9) + 1}`;
const fullName = (i, female = false) =>
  `${female ? pick(FIRST_F, i) : pick(FIRST_M, i)} ${pick(LAST, i * 3 + 1)}`;
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const eachWorkday = (month, year, fn) => {
  const days = new Date(year, month, 0).getDate();
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    if (!isWeekend(date)) fn(date, day);
  }
};
const log = (...a) => console.log('[seed]', ...a);

async function wipeKeepProtected(db) {
  const admin = await User.findOne({
    email: KEEP_ADMIN_EMAIL,
    role: ROLES.ADMIN,
  });
  if (!admin) {
    throw new Error(`Admin ${KEEP_ADMIN_EMAIL} not found — aborting`);
  }

  let keepCandidate = await User.findOne({
    email: KEEP_CANDIDATE_EMAIL,
  });

  // Delete everyone except protected admin + protected candidate email
  const del = await User.deleteMany({
    email: { $nin: [KEEP_ADMIN_EMAIL, KEEP_CANDIDATE_EMAIL] },
  });
  log(`Deleted users (except protected): ${del.deletedCount}`);

  // Ensure protected candidate stays as candidate
  if (keepCandidate) {
    keepCandidate.role = ROLES.CANDIDATE;
    keepCandidate.isActive = true;
    keepCandidate.isDeleted = false;
    keepCandidate.profileCompleted = true;
    keepCandidate.profileCompletedAt = keepCandidate.profileCompletedAt || new Date();
    if (!keepCandidate.candidateProfile?.isProfileComplete) {
      keepCandidate.candidateProfile = {
        ...(keepCandidate.candidateProfile || {}),
        personalInfo: {
          ...(keepCandidate.candidateProfile?.personalInfo || {}),
          fullName: keepCandidate.name,
          phone: keepCandidate.phone || phoneOf(999),
        },
        isProfileComplete: true,
      };
    }
    await keepCandidate.save();
  } else {
    keepCandidate = await User.create({
      name: 'Matti Ullah Candidate',
      email: KEEP_CANDIDATE_EMAIL,
      password: PASSWORD,
      phone: phoneOf(999),
      role: ROLES.CANDIDATE,
      profileCompleted: true,
      profileCompletedAt: new Date(),
      candidateProfile: {
        personalInfo: {
          fullName: 'Matti Ullah Candidate',
          phone: phoneOf(999),
          gender: 'Male',
        },
        isProfileComplete: true,
      },
      isActive: true,
    });
    log(`Created protected candidate ${KEEP_CANDIDATE_EMAIL}`);
  }

  for (const name of WIPE_COLLECTIONS) {
    try {
      const res = await db.collection(name).deleteMany({});
      if (res.deletedCount) log(`Cleared ${name}: ${res.deletedCount}`);
    } catch {
      /* ignore */
    }
  }

  await Department.deleteMany({});
  await Branch.deleteMany({});
  await LeavePolicy.deleteMany({});
  await Holiday.deleteMany({});
  await Shift.deleteMany({});

  await AttendanceRules.findOneAndUpdate(
    { key: 'default' },
    {
      key: 'default',
      workStart: '09:00',
      workEnd: '18:00',
      graceMinutes: 20,
      halfDayAfter: '11:30',
      lateCountForDayDeduction: 3,
      workingDaysPerMonth: 26,
      perfectAttendanceBonusPercent: 5,
      attendanceBonusMinPresentPercent: 95,
      weekendOffDays: [0, 6],
    },
    { upsert: true, new: true }
  );

  credentials.admins = [
    {
      name: admin.name,
      email: admin.email,
      phone: admin.phone || '-',
      role: 'admin',
      note: 'Kept admin (password unchanged)',
    },
  ];

  return { admin, keepCandidate };
}

async function seedOrg() {
  const depts = [];
  for (const d of DEPARTMENTS) {
    depts.push(await Department.create({ ...d, description: `${d.name} department`, isActive: true }));
  }
  const branches = [];
  for (const b of BRANCHES) {
    branches.push(await Branch.create({ ...b, isActive: true }));
  }
  for (const p of [
    { name: 'Annual Leave', leaveType: 'annual', daysPerYear: 14 },
    { name: 'Sick Leave', leaveType: 'sick', daysPerYear: 10 },
    { name: 'Casual Leave', leaveType: 'casual', daysPerYear: 8 },
    { name: 'Unpaid Leave', leaveType: 'unpaid', daysPerYear: 30 },
  ]) {
    await LeavePolicy.create({ ...p, isActive: true, carryForward: false });
  }
  await Holiday.insertMany([
    { name: 'Independence Day', date: new Date(YEAR, 7, 14), type: 'public' },
  ]);
  await Shift.create({
    name: 'General Shift',
    startTime: '09:00',
    endTime: '18:00',
    graceMinutes: 20,
    isActive: true,
  });
  return { depts, branches };
}

async function seedHrManager(admin, depts, branches) {
  const hrDept = depts.find((d) => d.name === 'HR');
  const hr = await User.create({
    name: 'Sana HR',
    email: 'hr1@ems.company',
    password: PASSWORD,
    phone: phoneOf(901),
    role: ROLES.HR,
    designation: 'HR Manager',
    employeeId: 'HR001',
    department: hrDept?._id,
    branch: branches[0]._id,
    dateOfJoining: new Date(YEAR - 2, 0, 10),
    gender: 'Female',
    profileCompleted: true,
    profileCompletedAt: new Date(),
    isActive: true,
  });
  credentials.hr.push({
    name: hr.name,
    email: hr.email,
    phone: hr.phone,
    password: PASSWORD,
    role: 'hr',
    employeeId: hr.employeeId,
    designation: hr.designation,
  });

  const eng = depts.find((d) => d.name === 'Engineering');
  const manager = await User.create({
    name: 'Omar Engineering Mgr',
    email: 'manager1@ems.company',
    password: PASSWORD,
    phone: phoneOf(910),
    role: ROLES.MANAGER,
    designation: 'Engineering Manager',
    employeeId: 'MGR001',
    department: eng?._id,
    branch: branches[0]._id,
    dateOfJoining: new Date(YEAR - 3, 0, 5),
    gender: 'Male',
    profileCompleted: true,
    profileCompletedAt: new Date(),
    isActive: true,
  });
  await ManagerProfile.create({
    user: manager._id,
    title: 'Engineering Manager',
    department: 'Engineering',
    status: 'active',
    permissions: {
      teamManagement: true,
      approvals: true,
      performance: true,
      tasks: true,
      reports: true,
      communication: true,
    },
    createdBy: admin._id,
  });
  credentials.managers.push({
    name: manager.name,
    email: manager.email,
    phone: manager.phone,
    password: PASSWORD,
    role: 'manager',
    employeeId: manager.employeeId,
    designation: 'Engineering Manager',
    department: 'Engineering',
  });

  return { hr, manager };
}

async function seedEmployees(manager, depts, branches, hr) {
  const deptCycle = ['Engineering', 'Engineering', 'Design', 'Product', 'Marketing', 'Finance', 'HR', 'Engineering', 'Design', 'Engineering'];
  const employees = [];

  for (let i = 1; i <= EMP_COUNT; i += 1) {
    const female = i % 4 === 0;
    const name = fullName(i, female);
    const deptName = pick(deptCycle, i - 1);
    const dept = depts.find((d) => d.name === deptName) || depts[0];
    const branch = branches[(i - 1) % branches.length];
    const designation = pick(DESIGNATIONS, i - 1);
    const empId = `EMP${String(i).padStart(3, '0')}`;
    const basic = 55000 + (i % 10) * 8000 + (i % 3) * 5000;
    const email = `employee${i}@ems.company`;
    const phone = phoneOf(i);
    const joinedAt = new Date(YEAR - 1, i % 12, 1 + (i % 20));

    const user = await User.create({
      name,
      email,
      password: PASSWORD,
      phone,
      role: ROLES.EMPLOYEE,
      designation,
      employeeId: empId,
      department: dept._id,
      branch: branch._id,
      manager: manager._id,
      dateOfJoining: joinedAt,
      dateOfBirth: new Date(1990 + (i % 10), i % 12, (i % 27) + 1),
      gender: female ? 'Female' : 'Male',
      cnic: cnicOf(i),
      address: {
        street: `House ${i}, Block ${String.fromCharCode(65 + (i % 5))}`,
        city: branch.city,
        country: 'Pakistan',
      },
      emergencyContacts: [{ name: `Emergency ${name.split(' ')[0]}`, relation: 'Parent', phone: phoneOf(100 + i) }],
      profileCompleted: true,
      profileCompletedAt: new Date(),
      isActive: true,
    });

    const emp = await Employee.create({
      user: user._id,
      empId,
      name,
      email,
      phone,
      designation,
      department: deptName,
      branch: branch.name,
      role: 'employee',
      manager: manager.name,
      salary: basic,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      cnic: user.cnic,
      address: user.address,
      emergencyContact: user.emergencyContacts?.[0] || {},
      bank: {
        bankName: pick(['HBL', 'Meezan', 'UBL'], i),
        accountNumber: `00${1000000000 + i * 111}`,
        iban: `PK00HBL${String(1000000000000000 + i).slice(0, 16)}`,
      },
      assets: [{ name: 'Laptop', tag: `LT-${empId}`, status: 'Assigned', assignedOn: joinedAt }],
      joinedAt,
      onboardingComplete: true,
      status: 'Active',
      isActive: true,
    });

    await ManagerEmployeeAssignment.create({
      manager: manager._id,
      employee: user._id,
      relationshipType: 'primary',
    });

    const housing = Math.round(basic * 0.3);
    await SalaryStructure.create({
      employee: user._id,
      basic,
      allowances: {
        housing,
        transport: 5000 + (i % 5) * 500,
        medical: 3000 + (i % 4) * 500,
        other: i % 3 === 0 ? 2000 : 0,
      },
      deductions: {
        tax: Math.round(basic * 0.05),
        providentFund: Math.round(basic * 0.08),
        loan: i % 7 === 0 ? 3000 : 0,
        other: i % 9 === 0 ? 500 : 0,
      },
      currency: 'PKR',
      effectiveFrom: joinedAt,
      isActive: true,
    });

    for (const lt of ['annual', 'sick', 'casual', 'unpaid']) {
      const allocated = lt === 'annual' ? 14 : lt === 'sick' ? 10 : lt === 'casual' ? 8 : 30;
      await LeaveBalance.create({
        employee: user._id,
        leaveType: lt,
        year: YEAR,
        allocated,
        used: i % 4,
        pending: 0,
      });
    }

    await ProfileCompletion.create({
      user: user._id,
      personalInfoComplete: true,
      documentsComplete: true,
      emergencyContactComplete: true,
      bankDetailsComplete: true,
      bankDetails: {
        accountTitle: name,
        bankName: emp.bank.bankName,
        accountNumber: emp.bank.accountNumber,
        iban: emp.bank.iban,
      },
    });

    if (i <= 6) {
      await Task.create({
        title: `Q3 Task ${i}`,
        description: `Deliverable for ${deptName}`,
        assignee: user._id,
        manager: manager._id,
        deadline: new Date(YEAR, 8, 20),
        status: pick(['pending', 'in_progress', 'completed'], i),
        priority: pick(['high', 'medium', 'low'], i),
      });
    }

    employees.push({ user, emp, manager, basic, deptName });
    credentials.employees.push({
      name,
      email,
      phone,
      password: PASSWORD,
      role: 'employee',
      empId,
      designation,
      department: deptName,
      branch: branch.name,
      manager: manager.name,
      managerEmail: manager.email,
      salary: basic,
      cnic: user.cnic,
      bank: emp.bank.bankName,
      accountNumber: emp.bank.accountNumber,
    });
  }

  // mark hr used so eslint-ish quiet — used for reviews optionally
  void hr;
  return employees;
}

async function seedCandidates(keepCandidate) {
  const candidates = [keepCandidate];
  credentials.candidates.push({
    name: keepCandidate.name,
    email: keepCandidate.email,
    phone: keepCandidate.phone || '-',
    password: '(unchanged — existing account)',
    role: 'candidate',
    note: 'Protected candidate — not deleted',
  });

  const educations = [
    'BS Computer Science — LUMS',
    'BS Software Engineering — FAST',
    'BBA — IBA Karachi',
    'BS IT — NUST',
    'MSc Data Science — PU',
  ];
  const experiences = [
    '1 year internship',
    '2 years junior developer',
    'Fresh graduate',
    '3 years QA',
    '1.5 years designer',
  ];

  for (let i = 1; i <= CAND_COUNT; i += 1) {
    const female = i % 3 === 0;
    const name = fullName(50 + i, female);
    const email = `candidate${i}@ems.company`;
    const phone = phoneOf(200 + i);
    const user = await User.create({
      name,
      email,
      password: PASSWORD,
      phone,
      role: ROLES.CANDIDATE,
      gender: female ? 'Female' : 'Male',
      dateOfBirth: new Date(1995 + (i % 8), i % 12, (i % 25) + 1),
      cnic: cnicOf(200 + i),
      education: pick(educations, i),
      experience: pick(experiences, i),
      linkedin: `https://linkedin.com/in/candidate${i}`,
      preferredLocation: pick(['Lahore', 'Karachi', 'Islamabad', 'Remote'], i),
      expectedSalary: String(70000 + i * 5000),
      skills: pick(
        [['JavaScript', 'React'], ['Node.js', 'MongoDB'], ['Figma', 'UI'], ['Recruitment', 'HR'], ['Python', 'SQL']],
        i
      ),
      candidateProfile: {
        personalInfo: {
          fullName: name,
          phone,
          gender: female ? 'Female' : 'Male',
          cnic: cnicOf(200 + i),
          address: { city: pick(['Lahore', 'Karachi', 'Islamabad'], i), country: 'Pakistan' },
        },
        isProfileComplete: true,
      },
      profileCompleted: true,
      profileCompletedAt: new Date(),
      isActive: true,
    });
    candidates.push(user);
    credentials.candidates.push({
      name,
      email,
      phone,
      password: PASSWORD,
      role: 'candidate',
      education: user.education,
      experience: user.experience,
      expectedSalary: user.expectedSalary,
      preferredLocation: user.preferredLocation,
      skills: (user.skills || []).join(', '),
      cnic: user.cnic,
    });
  }
  return candidates;
}

async function seedJobsApps(hr, candidates) {
  const jobs = [];
  for (let i = 0; i < JOB_SAMPLES.length; i += 1) {
    const sample = JOB_SAMPLES[i];
    const job = await Job.create({
      ...sample,
      company: 'Brilliance Base',
      status: 'Active',
      postedBy: hr._id,
      closesAt: new Date(YEAR, 10, 30),
      branch: pick(['Head Office', 'Karachi Office'], i),
    });
    jobs.push(job);
    credentials.jobs.push({
      title: job.title,
      department: job.department,
      location: job.location,
      status: job.status,
      postedBy: hr.email,
      salary: `${job.salaryMin}-${job.salaryMax} ${job.currency}`,
    });
  }

  const statuses = ['Applied', 'Review', 'Shortlisted', 'Interview', 'Selected', 'Rejected'];
  for (let i = 0; i < candidates.length; i += 1) {
    const cand = candidates[i];
    const job = jobs[i % jobs.length];
    const status = statuses[i % statuses.length];
    const app = await Application.create({
      job: job._id,
      candidate: cand._id,
      candidateName: cand.name,
      candidateEmail: cand.email,
      phone: cand.phone,
      experience: cand.experience || '1+ year',
      education: cand.education || 'BS',
      expectedSalary: Number(cand.expectedSalary) || 80000,
      linkedin: cand.linkedin,
      coverLetter: `I am interested in the ${job.title} role at Brilliance Base and believe my background is a strong fit for this opening.`,
      resume: {
        name: `${String(cand.name).replace(/\s+/g, '_')}_CV.pdf`,
        url: `/uploads/resumes/cand${i}.pdf`,
        mimeType: 'application/pdf',
        size: 120000,
      },
      status,
      ...(status === 'Interview' || status === 'Selected'
        ? {
            interview: {
              mode: 'Online',
              datetime: new Date(YEAR, 8, 12 + i, 11, 0),
              meetingLink: `https://meet.ems.company/int-${i}`,
              message: 'Please confirm availability.',
            },
          }
        : {}),
    });
    credentials.applications.push({
      candidate: cand.email,
      candidateName: cand.name,
      job: job.title,
      status,
    });
    void app;
  }
  return { jobs };
}

async function seedAttendanceExtras(employees, hr) {
  const attendanceDocs = [];
  const overtimes = [];
  const leaves = [];

  for (const { user, emp, manager, basic } of employees) {
    void basic;
    for (const month of PAYROLL_MONTHS) {
      let dayIndex = 0;
      eachWorkday(month, YEAR, (date) => {
        dayIndex += 1;
        const roll = (dayIndex + month + Number(emp.empId.replace(/\D/g, ''))) % 20;
        let status = 'present';
        let lateMinutes = 0;
        let clockInHour = 9;
        let clockInMin = 5;
        let clockOutHour = 18;
        let clockOutMin = 5;
        let overtimeMinutes = 0;

        if (roll === 0) status = 'absent';
        else if (roll === 1 || roll === 2) {
          status = 'late';
          lateMinutes = 30;
          clockInMin = 40;
        } else if (roll === 3) status = 'half-day';
        else if (roll === 4) status = 'wfh';
        else if (roll === 5) status = 'on-leave';
        else if (roll >= 17) {
          clockOutHour = 20;
          overtimeMinutes = 120;
        }

        if (status === 'absent' || status === 'on-leave') {
          attendanceDocs.push({
            employee: user._id,
            date,
            status,
            lateMinutes: 0,
            overtimeMinutes: 0,
            workMinutes: 0,
          });
          return;
        }

        const clockIn = new Date(date);
        clockIn.setHours(status === 'half-day' ? 12 : clockInHour, clockInMin, 0, 0);
        const clockOut = new Date(date);
        clockOut.setHours(clockOutHour, clockOutMin, 0, 0);
        attendanceDocs.push({
          employee: user._id,
          date,
          clockIn,
          clockOut,
          status,
          lateMinutes,
          overtimeMinutes,
          workMinutes: Math.round((clockOut - clockIn) / 60000),
        });

        if (overtimeMinutes >= 60 && dayIndex % 4 === 0) {
          overtimes.push({
            employee: user._id,
            manager: manager._id,
            date,
            hours: 2,
            reason: 'Sprint deadline',
            source: 'manual',
            status: 'approved',
            reviewedBy: manager._id,
          });
        }
      });

      if (month === 8) {
        const start = new Date(YEAR, 7, 5 + (Number(emp.empId.replace(/\D/g, '')) % 8));
        if (!isWeekend(start)) {
          leaves.push({
            employee: user._id,
            manager: manager._id,
            leaveType: pick(['annual', 'sick', 'casual'], Number(emp.empId.slice(-1))),
            startDate: start,
            endDate: start,
            days: 1,
            reason: 'Personal matter',
            status: 'approved',
            managerStatus: 'approved',
            hrStatus: 'approved',
            reviewedBy: hr._id,
          });
        }
      }
    }

    const n = Number(emp.empId.replace(/\D/g, ''));
    if (n % 5 === 0) {
      await LoanAdvanceRequest.create({
        employee: user._id,
        empId: emp.empId,
        employeeName: emp.name,
        type: 'loan',
        amount: 30000,
        reason: 'Personal loan',
        installments: 6,
        status: 'approved',
        reviewedBy: hr._id,
        reviewedAt: new Date(YEAR, 6, 5),
      });
    }
    if (n % 4 === 0) {
      await ExpenseClaim.create({
        employee: user._id,
        manager: manager._id,
        title: 'Client visit travel',
        category: 'travel',
        amount: 3500 + n * 100,
        description: 'Travel expense',
        expenseDate: new Date(YEAR, 7, 12),
        status: 'approved',
        reviewedBy: manager._id,
      });
    }
    if (n % 3 === 0) {
      await PayrollAdjustment.create({
        employee: user._id,
        empId: emp.empId,
        month: 8,
        year: YEAR,
        type: 'bonus',
        amount: 5000,
        note: 'Performance bonus',
        createdBy: hr._id,
      });
    }
  }

  if (attendanceDocs.length) await Attendance.insertMany(attendanceDocs, { ordered: false });
  if (overtimes.length) await OvertimeRequest.insertMany(overtimes, { ordered: false });
  if (leaves.length) await LeaveRequest.insertMany(leaves, { ordered: false });
  log(`Attendance: ${attendanceDocs.length}, OT: ${overtimes.length}, leaves: ${leaves.length}`);
}

async function writePdf() {
  const outDir = path.join(__dirname, '..', 'docs');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'EMS_Test_Credentials.pdf');
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 40, right: 40 } });
    const stream = fs.createWriteStream(outFile);
    doc.pipe(stream);
    const GREEN = '#1B5E3B';
    const ensure = (n = 60) => { if (doc.y > 750 - n) doc.addPage(); };
    const h1 = (t) => { ensure(50); doc.moveDown(0.3); doc.font('Helvetica-Bold').fontSize(14).fillColor(GREEN).text(t); doc.moveDown(0.25); doc.fillColor('#000'); };
    const line = (t) => { ensure(18); doc.font('Helvetica').fontSize(9).fillColor('#222').text(String(t), { width: 515 }); };
    const kv = (rows) => { rows.forEach((r) => line(r)); doc.moveDown(0.12); };

    doc.font('Helvetica-Bold').fontSize(18).fillColor(GREEN).text('Brilliance EMS - Test Credentials', { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#444').text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
    doc.text(`Seeded password: ${PASSWORD}`, { align: 'center' });
    doc.moveDown();

    h1('1. Admin (kept)');
    credentials.admins.forEach((a, i) => kv([`${i + 1}. ${a.name}`, `   Email: ${a.email}  |  ${a.note}`]));
    h1('2. HR (1)');
    credentials.hr.forEach((a, i) => kv([`${i + 1}. ${a.name}`, `   ${a.email} / ${a.password}`, `   Phone: ${a.phone}`]));
    h1('3. Manager (1)');
    credentials.managers.forEach((a, i) => kv([`${i + 1}. ${a.name}`, `   ${a.email} / ${a.password}`, `   Phone: ${a.phone}`]));
    h1('4. Employees (10)');
    credentials.employees.forEach((a, i) => kv([
      `${i + 1}. ${a.name} [${a.empId}]`,
      `   ${a.email} / ${a.password}`,
      `   Phone: ${a.phone} | ${a.designation} | ${a.department}`,
      `   Salary: PKR ${a.salary} | Manager: ${a.manager}`,
    ]));
    h1('5. Candidates (5 + protected gmail)');
    credentials.candidates.forEach((a, i) => kv([
      `${i + 1}. ${a.name}`,
      `   ${a.email} / ${a.password}`,
      `   Phone: ${a.phone || '-'}`,
    ]));
    h1('6. Jobs / Applications');
    credentials.jobs.forEach((j, i) => line(`${i + 1}. ${j.title} (${j.status}) — ${j.salary}`));
    credentials.applications.forEach((a, i) => line(`App ${i + 1}: ${a.candidateName} -> ${a.job} [${a.status}]`));
    h1('7. Summary');
    Object.entries(credentials.summary).forEach(([k, v]) => line(`${k}: ${v}`));
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  return outFile;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  log('Wiping (keep admin + protected candidate)…');
  const { admin, keepCandidate } = await wipeKeepProtected(db);

  log('Seeding org…');
  const { depts, branches } = await seedOrg();

  log('Seeding 1 HR + 1 manager…');
  const { hr, manager } = await seedHrManager(admin, depts, branches);

  log(`Seeding ${EMP_COUNT} employees…`);
  const employees = await seedEmployees(manager, depts, branches, hr);

  log(`Seeding ${CAND_COUNT} candidates (+ protected)…`);
  const candidates = await seedCandidates(keepCandidate);

  log('Jobs + applications…');
  await seedJobsApps(hr, candidates);

  log('Attendance / payroll extras…');
  await seedAttendanceExtras(employees, hr);

  for (const month of PAYROLL_MONTHS) {
    log(`Payroll ${YEAR}-${String(month).padStart(2, '0')}…`);
    await runDynamicPayroll({ month, year: YEAR, processedBy: admin._id });
  }

  credentials.summary = {
    admin: KEEP_ADMIN_EMAIL,
    protectedCandidate: KEEP_CANDIDATE_EMAIL,
    hr: 1,
    managers: 1,
    employees: EMP_COUNT,
    candidates: CAND_COUNT + 1,
    jobs: await Job.countDocuments(),
    applications: await Application.countDocuments(),
    attendance: await Attendance.countDocuments(),
    payslips: await Payslip.countDocuments(),
    password: PASSWORD,
  };

  const pdf = await writePdf();
  const jsonPath = path.join(__dirname, '..', 'docs', 'EMS_Test_Credentials.json');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(credentials, null, 2));
  log('PDF:', pdf);
  log('JSON:', jsonPath);
  log('Summary:', credentials.summary);

  await mongoose.disconnect();
  log('Done.');
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* */ }
  process.exit(1);
});
