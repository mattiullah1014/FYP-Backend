/**
 * Brilliance EMS — Complete Role Documentation (PDF)
 * Run: node scripts/generateRoleDocsPdf.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'docs');
const OUT_FILE = path.join(
  OUT_DIR,
  'Brilliance_EMS_Complete_Role_Documentation.pdf',
);

fs.mkdirSync(OUT_DIR, { recursive: true });

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 52, bottom: 60, left: 50, right: 50 },
  bufferPages: true,
  autoFirstPage: true,
  info: {
    Title: 'Brilliance EMS — Complete Role Documentation',
    Author: 'Brilliance Base FYP',
    Subject: 'Candidate, Employee, Manager, HR modules',
  },
});

const stream = fs.createWriteStream(OUT_FILE);
doc.pipe(stream);

const GREEN = '#1B5E3B';
const MUTED = '#555555';
const CONTENT_BOTTOM = 750;

const ensureSpace = (need = 70) => {
  if (doc.y > CONTENT_BOTTOM - need) doc.addPage();
};

const h1 = (t) => {
  ensureSpace(70);
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(GREEN).text(t, { underline: false });
  const y = doc.y + 3;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(GREEN).lineWidth(1.2).stroke();
  doc.moveDown(0.55);
  doc.fillColor('#000');
};

const h2 = (t) => {
  ensureSpace(50);
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(GREEN).text(t);
  doc.moveDown(0.2);
  doc.fillColor('#000');
};

const h3 = (t) => {
  ensureSpace(40);
  doc.moveDown(0.15);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#222').text(t);
  doc.moveDown(0.12);
};

const p = (t) => {
  ensureSpace(50);
  doc.font('Helvetica').fontSize(9.5).fillColor('#222').text(t, {
    align: 'left',
    lineGap: 1.5,
    width: 495,
  });
  doc.moveDown(0.2);
};

const bullet = (t) => {
  ensureSpace(28);
  doc.font('Helvetica').fontSize(9.5).fillColor('#222').text(`•  ${t}`, {
    width: 495,
    lineGap: 1.2,
  });
};

const api = (method, route, note = '') => {
  ensureSpace(20);
  const line = note ? `${method}  ${route}  — ${note}` : `${method}  ${route}`;
  doc.font('Courier').fontSize(8.5).fillColor('#111').text(line, { width: 495 });
};

const kv = (k, v) => {
  ensureSpace(24);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111').text(`${k}: `, {
    continued: true,
    width: 495,
  });
  doc.font('Helvetica').fillColor('#333').text(v, { width: 495 });
};

// ─── COVER ───────────────────────────────────────────────
doc.rect(0, 0, doc.page.width, 200).fill(GREEN);
doc.fillColor('#fff').font('Helvetica-Bold').fontSize(24).text('Brilliance Base EMS', 50, 55, {
  width: 495,
});
doc.fontSize(13).font('Helvetica').text('Complete Role Documentation', 50, 90);
doc.fontSize(11).text('Candidate  ·  Employee  ·  Manager  ·  HR', 50, 115);
doc
  .fontSize(9)
  .fillColor('#D7EADF')
  .text('Final Year Project · React Native + Node.js / Express / MongoDB', 50, 145);
doc.fontSize(9).text(`Generated: ${new Date().toLocaleString('en-GB')}`, 50, 162);

doc.fillColor('#000');
doc.y = 230;

p(
  'This document describes every major module delivered in Brilliance EMS for the four primary operational roles: Candidate, Employee, Manager, and HR. For each role it covers navigation, end-to-end user flows, dynamic (API-backed) features, backend endpoints, data models, and known gaps.',
);
p(
  'API base path is /api. The mobile app uses configurable API_BASE_URL. Authentication is JWT Bearer token for all protected routes.',
);

h2('Document Contents');
bullet('1. System Overview & Shared Foundation');
bullet('2. Candidate Module (complete detail)');
bullet('3. Employee Module (complete detail)');
bullet('4. Manager Module (complete detail)');
bullet('5. HR Module (complete detail)');
bullet('6. Cross-Role Workflows');
bullet('7. Known Limitations & Future Work');

// ─── 1 ───────────────────────────────────────────────────
doc.addPage();
h1('1. System Overview & Shared Foundation');

h2('1.1 Architecture');
bullet('Frontend: React Native (Android/iOS) — Brilliance/');
bullet('Backend: Node.js + Express + MongoDB — Brilliance Backend/');
bullet('Auth: JWT (Bearer), optional 2FA, forgot/reset password OTP');
bullet('Roles (API / UI): candidate, employee, manager, hr, admin');
bullet('Uploads served at /uploads (resumes, avatars, documents, payslip PDFs)');

h2('1.2 Shared Auth APIs');
api('POST', '/auth/register', 'Candidate (and Admin) public signup');
api('POST', '/auth/login', 'All roles');
api('POST', '/auth/verify-2fa', 'If 2FA enabled');
api('GET', '/auth/me', 'Session refresh');
api('POST', '/auth/logout');
api('POST', '/auth/change-password');
api('PATCH', '/auth/2fa', 'Enable/disable 2FA');
api('POST', '/auth/forgot-password | verify-otp | reset-password');

h2('1.3 Shared Staff Profile (Employee / Manager / HR / Admin)');
api('GET|PATCH', '/employee/profile');
api('PUT|DELETE', '/employee/profile/avatar');
api('GET|POST|DELETE', '/employee/documents...');
api('GET', '/employee/assets', 'Assigned assets read-only');
api('GET', '/employee/company-policies');
api('GET|PATCH', '/employee/profile-completion...');

h2('1.4 Navigation Model');
p(
  'App.jsx hosts a root Native Stack. After login, role-based Drawer opens Bottom Tabs. Feature screens (ApplicationReview, MTasks, HRApprovalCenter, Payslips, etc.) are registered on the root stack.',
);

// ─── 2 CANDIDATE ─────────────────────────────────────────
doc.addPage();
h1('2. Candidate Module — Complete Detail');

h2('2.1 Purpose');
p(
  'Candidates discover open jobs, submit applications with CV/cover letter, track application status through the recruitment pipeline, and manage a lightweight personal profile. Candidates cannot self-register as staff; hiring converts them to Employee via HR.',
);

h2('2.2 Navigation');
h3('Bottom Tabs (CandidateTabs)');
bullet('Home — CHome.jsx');
bullet('Jobs — CJob.jsx');
bullet('Applications — CApplication.jsx');
bullet('Profile — Profile.jsx');

h3('Drawer');
bullet('Home, Notifications, Settings, Privacy Policy, Terms of Service');

h3('Stack Screens');
bullet('CandidateSetup.jsx — forced when personal profile incomplete');
bullet('JobDetail.jsx, ApplyJob.jsx, ApplicationDetail.jsx');
bullet('EditPersonalInfo.jsx, ChangePassword, TwoFactorAuth, Notifications');

h2('2.3 User Flows');

h3('A. Signup & Setup');
bullet('1. RoleSelection → Sign Up as Candidate');
bullet('2. POST /auth/register creates User with role=candidate');
bullet('3. If incomplete → CandidateSetup (personal info + optional avatar)');
bullet('4. PUT /candidates/me/profile → main app');

h3('B. Browse & Apply');
bullet('1. Jobs tab: GET /jobs?status=Active (RecruitmentContext)');
bullet('2. JobDetail → ApplyJob form (phone, experience, education, salary, LinkedIn, cover letter ≥20 chars)');
bullet('3. Attach resume PDF/DOC → POST /applications multipart → status Applied');
bullet('4. Duplicate apply to same active job blocked (409)');

h3('C. Track Applications');
bullet('GET /applications/me — list own applications');
bullet('Pipeline: Applied → Review → Shortlisted → Interview → Selected | Rejected | Withdrawn');
bullet('Reschedule interview: POST /applications/:id/reschedule');
bullet('Withdraw: POST /applications/:id/withdraw');

h3('D. Profile');
bullet('Avatar upload/remove; edit personal information; password / 2FA in Settings');

h2('2.4 Candidate APIs');
api('GET', '/candidates/me/profile');
api('PUT', '/candidates/me/profile');
api('PUT|DELETE', '/candidates/me/avatar');
api('GET', '/jobs', 'List / filter Active');
api('GET', '/jobs/:id');
api('POST', '/applications', 'Multipart apply');
api('GET', '/applications/me');
api('GET', '/applications/:id');
api('POST', '/applications/:id/reschedule');
api('POST', '/applications/:id/withdraw');

h2('2.5 Key Models');
kv('User', 'role candidate + candidateProfile (personalInfo, avatar, isProfileComplete)');
kv('Job', 'title, dept, location, types, salary, requirements, status Active/Closed');
kv('Application', 'job, candidate, coverLetter, resume, status, interview, reviewNote, rescheduleRequest');

h2('2.6 Dynamic vs Gaps');
bullet('DYNAMIC: jobs, apply, applications list/detail, withdraw, reschedule, profile, avatar, auth');
bullet('GAP: Notifications mostly local; Privacy/Terms are static screens');

// ─── 3 EMPLOYEE ──────────────────────────────────────────
doc.addPage();
h1('3. Employee Module — Complete Detail');

h2('3.1 Purpose');
p(
  'Employees (created by HR hire or Add Employee) use self-service EMS: attendance clock, leave, tasks, overtime, expenses, payslips, loans/advances, performance reviews from managers, company policies, and master profile (personal, emergency, bank, documents, assets).',
);

h2('3.2 Navigation');
h3('Bottom Tabs');
bullet('Home — EHome.jsx | Attendance — EAttendence.jsx | Leave — ELeave.jsx');
bullet('Tasks — ETasks.jsx | Profile — Profile.jsx');

h3('Drawer');
bullet('My Profile, Inbox, Payslips, Overtime, Expenses, Loan & Advance, Performance, Company Policies');

h3('Stack Screens');
bullet('ApplyLeave, AttendanceRequest (Correction + WFH)');
bullet('Payslips, ExpenseClaim, ApplyOvertime, LoanAdvance, EmployeePerformance, CompanyRules');
bullet('EditPersonalInfo, EmergencyContact, Documents, DocumentViewer, BankDetails, AssignedAssets');

h2('3.3 Feature Details');

h3('A. Dashboard');
bullet('GET /employee/dashboard — managers, pending tasks, announcements, alerts, profile completion');
bullet('Quick clock + shortcuts to leave / expense / payslip / attendance');

h3('B. Attendance (dynamic rules)');
bullet('Rules: work start/end, grace, half-day cutoff, OT mins, weekend offs, holidays');
bullet('Clock-in → present / late / half-day pending (HR queue)');
bullet('Clock-out late → OT request for HR');
bullet('Corrections + WFH requests → Manager or HR approve');
bullet('Off days block clock-in unless allowOffDayClockIn');

h3('C. Leave');
bullet('Create + list via POST/GET /employee/leave');
bullet('Manager OR HR can approve/reject');
bullet('GAP: cancel leave + leave balance APIs still TODO');

h3('D. Tasks');
bullet('List assigned tasks; PATCH status pending | in_progress | completed');

h3('E. Overtime / Expenses / Loans');
bullet('Submit OT with reviewing manager → HR Approval Center');
bullet('Expenses with optional receipt → HR review');
bullet('Loans & advances → HR review');

h3('F. Payroll / Payslips');
bullet('List payslips + summary; open PDF from /employee/payroll/payslips/:id/pdf');

h3('G. Performance (dynamic)');
bullet('GET /employee/performance — manager reviews, KPIs, goals, task stats');
bullet('POST self-assessment attached to latest review');
bullet('Views ratings/feedback created in Manager Performance');

h3('H. Master Profile & Policies');
bullet('Personal, emergency, bank, documents, assets; completion %');
bullet('Avatar in Header + Drawer; company policies read-only');

h2('3.4 Employee APIs (summary)');
api('GET', '/employee/dashboard | /managers | /tasks');
api('PATCH', '/employee/tasks/:id/status');
api('POST|GET', '/employee/leave | /overtime | /expenses');
api('GET', '/employee/performance');
api('POST', '/employee/performance/self-assessment');
api('GET', '/employee/payroll/payslips...');
api('POST|GET', '/employee/loans | /advances');
api('GET|POST', '/employee/attendance/rules|clock-in|clock-out|corrections|wfh');

h2('3.5 Key Models');
bullet('Employee, User, ProfileCompletion, ManagerEmployeeAssignment');
bullet('Attendance, AttendanceRules, Correction, WfhRequest, HalfDayRequest, OvertimeRequest');
bullet('LeaveRequest, Task, ExpenseClaim, LoanAdvanceRequest');
bullet('Payslip, PayrollRun, SalaryStructure, PerformanceReview, Goal, CompanyPolicy');

h2('3.6 Dynamic vs Gaps');
bullet('DYNAMIC: dashboard, attendance, leave create/list, tasks, OT, expenses, payslips, loans, performance, policies, profile');
bullet('GAP: Inbox still demo; leave cancel/balance missing; notifications mostly local');

// ─── 4 MANAGER ───────────────────────────────────────────
doc.addPage();
h1('4. Manager Module — Complete Detail');

h2('4.1 Purpose');
p(
  'Managers lead a team via ManagerEmployeeAssignment (primary/secondary). They assign tasks, approve leave/WFH/corrections, write performance reviews, announce/message the team, and view live reports. Capabilities are gated by ManagerProfile.permissions (set by HR).',
);

h2('4.2 Navigation');
h3('Bottom Tabs');
bullet('Home — MHome | Team — MTeam | Approvals — MApproval');
bullet('Reports — MReports | Profile');

h3('Drawer / Stack');
bullet('Tasks (MTasks), Performance (MPerformance), Communication (MCommunicate)');
bullet('EmployeeDetail opened from Team member tap');

h2('4.3 Feature Details');

h3('A. Dashboard');
bullet('Live teamSize, presentToday (attendance snapshot), pendingApprovals, openTasks, permissions');

h3('B. Team');
bullet('List/search team; add from available pool; remove member');
bullet('Open full read-only profile via GET /manager/team/:employeeId');
bullet('Permission: teamManagement');

h3('C. Tasks');
bullet('Create/update/delete tasks for team members (deadline, priority, status)');
bullet('Permission: tasks');

h3('D. Approvals');
bullet('Queues: leave, WFH, correction — approve/reject with remarks');
bullet('Manager can fully decide Leave (same as HR for leave)');
bullet('Does NOT approve expenses, loans, half-day, OT (HR only)');
bullet('Permission: approvals');

h3('E. Performance');
bullet('Create review: employee, period, rating 1–5, feedback, KPIs');
bullet('Saved as completed; employee notified; appears on Employee Performance');
bullet('Permission: performance');

h3('F. Communication');
bullet('Team announcements + direct messages');
bullet('Permission: communication');

h3('G. Reports & Analytics (live)');
bullet('Overview: present/late/absent/on-leave today + pending + open tasks');
bullet('Attendance: present, late, half-day, WFH, leave, absent, clocked-in, on-duty, rate');
bullet('Productivity: tasks completed / in-progress / pending / rate');
bullet('Performance: reviews count + average rating');
bullet('Export PDF button removed');
bullet('Permission: reports');

h2('4.4 Manager APIs');
api('GET', '/manager/dashboard');
api('GET|POST|DELETE', '/manager/team...', 'teamManagement');
api('GET', '/manager/employees/available');
api('GET|POST|PATCH|DELETE', '/manager/tasks...', 'tasks');
api('GET|PATCH', '/manager/approvals...', 'approvals');
api('GET|POST', '/manager/reviews...', 'performance');
api('GET', '/manager/reviews/:id/appraisal');
api('GET|POST', '/manager/announcements | /messages', 'communication');
api('GET', '/manager/reports/overview|attendance|productivity|performance');

h2('4.5 Permissions');
p(
  'ManagerProfile.permissions booleans (default true): teamManagement, approvals, performance, tasks, reports, communication. HR edits via ManagerPermissions screen (GET/PUT /hr/managers/:id/permissions).',
);

h2('4.6 Models');
bullet('ManagerProfile, ManagerEmployeeAssignment, Task, PerformanceReview, Goal');
bullet('Announcement, Message, LeaveRequest, WfhRequest, AttendanceCorrection, Attendance');

h2('4.7 Gaps');
bullet('No Manager recruitment UI (jobs API readable only)');
bullet('Drawer Team Reports may open hybrid Reports.jsx; tab MReports is the live analytics screen');

// ─── 5 HR ────────────────────────────────────────────────
doc.addPage();
h1('5. HR Module — Complete Detail');

h2('5.1 Purpose');
p(
  'HR operates the EMS control plane: employee lifecycle, manager accounts & permissions, recruitment (job → shortlist → interview → hire), attendance rules/roster/approvals, payroll generation, company policies, assets, and multi-queue Approval Center. Admin shares /api/hr on backend (HR_ADMIN); Admin mobile tabs are mostly placeholder.',
);

h2('5.2 Navigation');
h3('Bottom Tabs');
bullet('Home | Employees | Attendance | Recruit | Payroll | Profile');

h3('Drawer');
bullet('Approval Center, Attendance Rules, Company Policies, Managers, Assign Assets, Add Employee');

h3('Stack');
bullet('HRApprovalCenter, HRAttendanceRules, HREmployeeAttendance');
bullet('HRManagers, CreateManager, EditManager, ManagerPermissions, ManagerMonitor');
bullet('AddEmployee, EmployeeDetail, HRAssets, CompanyRules');
bullet('PostJob, ApplicantsPipeline, ApplicationReview, ShortlistedCandidates, ScheduleInterview');

h2('5.3 Feature Details');

h3('A. Employees');
bullet('List/search/paginate; create User+Employee; activate/deactivate; soft-delete');
bullet('Detail tabs: Profile, Salary, Managers, Assets, Documents');
bullet('Hire from candidate via select or AddEmployee with applicationId');

h3('B. Managers');
bullet('Create account + bulk team; edit; transfer; deactivate; permissions; activity/report');

h3('C. Recruitment');
bullet('Post jobs; pipeline by stage; Mark Review / Shortlist / Reject');
bullet('Open CV via Linking; Schedule Interview; Select/Hire → Employee');

h3('D. Attendance');
bullet('Rules (hours, grace, half-day, OT, weekends) + holidays CRUD');
bullet('Live roster of real employees for today');
bullet('Employee history; half-day & OT HR approvals');

h3('E. Approval Center');
bullet('Leave, WFH, Correction, Half-day, OT, Expenses, Loans, Advances');
bullet('Approve/reject with remarks');

h3('F. Payroll');
bullet('Generate run from salary + attendance/LWP + OT + expenses + loans + bonus/deductions');
bullet('Payslip PDF via pdfkit under /uploads/payslips');

h3('G. Policies & Assets');
bullet('Company policies CRUD (employees read-only)');
bullet('Assign/remove assets on employees');

h2('5.4 Key HR APIs');
api('GET|POST|PATCH|DELETE', '/hr/employees...');
api('GET|POST|PATCH...', '/hr/managers... | /hr/assignments');
api('POST|GET|PATCH', '/jobs...');
api('GET|PATCH|POST', '/applications... (review|shortlist|reject|schedule|select)');
api('GET|PATCH', '/hr/attendance/rules | roster | holidays | half-day | overtime | wfh | corrections');
api('GET|PATCH', '/hr/expenses | /hr/loans | /hr/advances');
api('POST|GET', '/hr/payroll/generate | runs | payslips | bonus | deductions');
api('CRUD', '/hr/company-policies');

h2('5.5 Models');
bullet('Employee, User, ManagerProfile, Job, Application');
bullet('AttendanceRules, Holiday, Attendance, HalfDayRequest, OvertimeRequest');
bullet('LeaveRequest, ExpenseClaim, LoanAdvanceRequest, Payslip, PayrollRun, CompanyPolicy');

h2('5.6 Gaps');
bullet('Orphan screens HRLeave/HRExpenses/HRPerformance not in App stack (flows covered elsewhere)');
bullet('Some client TODOs: dashboard/ops, leave calendar, mark-absent');
bullet('Admin UI placeholder despite /api/admin backend');

// ─── 6 CROSS ─────────────────────────────────────────────
doc.addPage();
h1('6. Cross-Role Workflows');

h2('6.1 Hire Path');
bullet('Candidate applies → HR shortlist → interview → Select/Hire (or manual Add Employee)');
bullet('Result: role becomes employee + Employee master record');

h2('6.2 Leave Path');
bullet('Employee submits → Manager Approvals AND HR Approval Center');
bullet('Either Manager or HR can finalize approve/reject');

h2('6.3 WFH / Correction');
bullet('Employee submits → Manager and/or HR review');

h2('6.4 Half-day / OT');
bullet('Auto from clock rules → HR Approval Center only');

h2('6.5 Performance');
bullet('Manager creates review → Employee Performance shows rating/feedback/KPIs');
bullet('Employee optional self-assessment on latest review');

h2('6.6 Payroll');
bullet('HR generate run → Employee Payslips + PDF');

h2('6.7 Expense / Loan / Advance');
bullet('Employee submits → HR review → payroll impact where applicable');

// ─── 7 GAPS ──────────────────────────────────────────────
h1('7. Known Limitations & Future Work');
bullet('Employee Inbox still demo (wire communication inbox)');
bullet('Leave cancel + leave balance APIs missing');
bullet('No dedicated /hr/performance dashboard (manager-driven reviews exist)');
bullet('Admin tabs/audit UI not wired to /api/admin');
bullet('Approval Center documents filter empty');
bullet('Manager/HR analytics PDF export not implemented');
bullet('/hr/dashboard/ops may be incomplete');

h2('7.1 Suggested Test Checklist');
bullet('Candidate: signup → setup → apply with PDF → withdraw/reschedule');
bullet('HR: shortlist/reject/open CV → schedule → hire');
bullet('Employee: clock-in/out → leave → expense → payslip → view manager review');
bullet('Manager: add team → task → approve leave → create performance review → reports');
bullet('HR: attendance rules + roster → OT/half-day approve → generate payroll');

doc.moveDown(1);
doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(
  '— End of Brilliance EMS Complete Role Documentation —',
  { align: 'center', width: 495 },
);

// Footers on all buffered pages
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i += 1) {
  doc.switchToPage(range.start + i);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text(
      `Brilliance Base EMS · Role Documentation · Page ${i + 1} of ${range.count}`,
      50,
      doc.page.height - 40,
      { width: 495, align: 'center', lineBreak: false },
    );
}

doc.end();

await new Promise((resolve, reject) => {
  stream.on('finish', resolve);
  stream.on('error', reject);
});

console.log(`PDF written: ${OUT_FILE}`);
