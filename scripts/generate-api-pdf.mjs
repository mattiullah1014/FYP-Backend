import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'Brilliance_API_Documentation.pdf');

const doc = new PDFDocument({
  margin: 50,
  size: 'A4',
  info: {
    Title: 'Brilliance EMS API Documentation',
    Author: 'Brilliance Backend',
  },
});

doc.pipe(fs.createWriteStream(outPath));

const pageWidth = doc.page.width - 100;

function ensureSpace(needed = 80) {
  if (doc.y + needed > doc.page.height - 50) {
    doc.addPage();
  }
}

function h1(text) {
  ensureSpace(40);
  doc.moveDown(0.5);
  doc.fontSize(18).fillColor('#1a365d').text(text, { underline: false });
  doc.moveDown(0.3);
  doc
    .moveTo(50, doc.y)
    .lineTo(50 + pageWidth, doc.y)
    .strokeColor('#2b6cb0')
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.6);
  doc.fillColor('#000');
}

function h2(text) {
  ensureSpace(30);
  doc.moveDown(0.4);
  doc.fontSize(13).fillColor('#2c5282').text(text);
  doc.moveDown(0.25);
  doc.fillColor('#000');
}

function body(text) {
  ensureSpace(20);
  doc.fontSize(10).fillColor('#222').text(text, { width: pageWidth, lineGap: 2 });
  doc.moveDown(0.25);
}

function mono(text) {
  ensureSpace(18);
  doc.font('Courier').fontSize(9).fillColor('#111').text(text, { width: pageWidth });
  doc.font('Helvetica');
}

function endpoint(method, path, info) {
  ensureSpace(110);
  doc.moveDown(0.35);

  // method badge line
  const methodColors = {
    GET: '#276749',
    POST: '#2b6cb0',
    PATCH: '#c05621',
    PUT: '#6b46c1',
    DELETE: '#c53030',
  };
  doc
    .fontSize(11)
    .fillColor(methodColors[method] || '#000')
    .text(`${method}  `, { continued: true })
    .fillColor('#1a202c')
    .text(path);
  doc.moveDown(0.15);

  if (info.auth) {
    doc.fontSize(9).fillColor('#4a5568').text(`Auth: ${info.auth}`);
  }
  if (info.roles) {
    doc.fontSize(9).fillColor('#4a5568').text(`Roles: ${info.roles}`);
  }
  if (info.headers) {
    doc.fontSize(9).fillColor('#4a5568').text(`Headers: ${info.headers}`);
  }
  if (info.query) {
    doc.fontSize(9).fillColor('#4a5568').text(`Query: ${info.query}`);
  }
  if (info.body) {
    doc.fontSize(9).fillColor('#2d3748').text('Body (JSON):');
    mono(info.body);
  }
  if (info.formData) {
    doc.fontSize(9).fillColor('#2d3748').text('Body (multipart/form-data):');
    mono(info.formData);
  }
  if (info.notes) {
    doc.fontSize(9).fillColor('#718096').text(`Note: ${info.notes}`);
  }
  doc.moveDown(0.2);
  doc
    .moveTo(50, doc.y)
    .lineTo(50 + pageWidth, doc.y)
    .strokeColor('#e2e8f0')
    .lineWidth(0.5)
    .stroke();
}

const AUTH = 'Bearer JWT required';
const AUTH_OPT = 'Optional Bearer JWT';
const AUTH_NONE = 'No auth';
const HDR_JSON = 'Content-Type: application/json | Authorization: Bearer <token>';
const HDR_JSON_PUB = 'Content-Type: application/json';
const HDR_MULTI = 'Content-Type: multipart/form-data | Authorization: Bearer <token>';
const HDR_AUTH = 'Authorization: Bearer <token>';

// COVER
doc.fontSize(24).fillColor('#1a365d').text('Brilliance EMS', { align: 'center' });
doc.moveDown(0.3);
doc.fontSize(16).fillColor('#2b6cb0').text('API Documentation', { align: 'center' });
doc.moveDown(1);
doc.fontSize(11).fillColor('#444').text('Base URL: http://localhost:5000', { align: 'center' });
doc.text('Stack: Node.js + Express + MongoDB (Mongoose) + JWT', { align: 'center' });
doc.moveDown(0.8);
body(
  'All protected routes need header: Authorization: Bearer <token>\nRoles: candidate | employee | manager | hr | admin\n(RN app may send PascalCase: Candidate, Employee, Manager, HR, Admin — both accepted)\nSuccess response shape: { success, message, data }\nError response shape: { success: false, message, errors? }\nDatabase: brillianceDB'
);
body(
  'Mobile auth flow (Brilliance RN app):\n1. RoleSelectionScreen → pick one of 5 roles\n2. Login / SignUp / Forgot always send that role in the body\n3. Login fails if password is OK but selected role does not match the account role'
);

h1('0. Health');
endpoint('GET', '/health', {
  auth: AUTH_NONE,
  notes: 'Server health check — no body',
});

h1('1. Auth  /api/auth');
body(
  'role is required on register, login, forgot-password, verify-otp, and reset-password.\nAccepted values: candidate | employee | manager | hr | admin (or Candidate | Employee | Manager | HR | Admin).'
);
endpoint('POST', '/api/auth/register', {
  auth: AUTH_NONE,
  headers: HDR_JSON_PUB,
  body: `{
  "name": "Ali Khan",
  "email": "ali@email.com",
  "password": "secret123",
  "phone": "03001234567",
  "role": "Candidate"
}`,
  notes:
    'Creates account with the selected role. Returns { user, token }. If email already exists under another role, returns 409 with that role in the message.',
});
endpoint('POST', '/api/auth/login', {
  auth: AUTH_NONE,
  headers: HDR_JSON_PUB,
  body: `{
  "email": "ali@email.com",
  "password": "secret123",
  "role": "HR"
}`,
  notes:
    'Returns { user, token }. If credentials are valid but role mismatches account, returns 403 e.g. "This account is registered as \'employee\'. Please select that role to login."',
});
endpoint('POST', '/api/auth/forgot-password', {
  auth: AUTH_NONE,
  headers: HDR_JSON_PUB,
  body: `{
  "email": "ali@email.com",
  "role": "Employee"
}`,
  notes:
    'RN Forget step 1. Looks up email + role. Generates 6-digit OTP (10 min). Dev (non-production) returns { otp } in data.',
});
endpoint('POST', '/api/auth/verify-otp', {
  auth: AUTH_NONE,
  headers: HDR_JSON_PUB,
  body: `{
  "email": "ali@email.com",
  "role": "Employee",
  "otp": "482915"
}`,
  notes: 'RN Forget step 2. Validates OTP without consuming it. Returns { verified: true }.',
});
endpoint('POST', '/api/auth/reset-password', {
  auth: AUTH_NONE,
  headers: HDR_JSON_PUB,
  body: `{
  "email": "ali@email.com",
  "role": "Employee",
  "otp": "482915",
  "newPassword": "newSecret123"
}`,
  notes: 'RN Forget step 3. otp required (token alias also accepted). Clears OTP after success.',
});
endpoint('GET', '/api/auth/me', {
  auth: AUTH,
  headers: HDR_AUTH,
  notes: 'Returns current user including role, department, branch, manager.',
});
endpoint('POST', '/api/auth/logout', {
  auth: AUTH,
  headers: HDR_AUTH,
  notes: 'Client should discard token.',
});
endpoint('POST', '/api/auth/change-password', {
  auth: AUTH,
  headers: HDR_JSON,
  body: `{
  "currentPassword": "oldPass",
  "newPassword": "newPass123"
}`,
});
endpoint('PATCH', '/api/auth/2fa', {
  auth: AUTH,
  headers: HDR_JSON,
  body: `{ "enabled": true }`,
  notes: 'Flag only — real OTP/SMS later.',
});

h1('2. Employees  /api/employees');
endpoint('GET', '/api/employees', {
  auth: AUTH,
  roles: 'employee, manager, hr, admin',
  headers: HDR_AUTH,
  query: '?department=&branch=&search=',
});
endpoint('GET', '/api/employees/team/mine', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/employees/:id', {
  auth: AUTH,
  roles: 'staff (self / manager of / hr / admin)',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/employees', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "name": "Sara Ahmed",
  "email": "sara@company.com",
  "password": "ChangeMe123",
  "role": "employee",
  "phone": "03001112233",
  "department": "<deptId>",
  "branch": "<branchId>",
  "manager": "<managerUserId>",
  "designation": "Software Engineer",
  "dateOfJoining": "2026-01-15",
  "address": { "city": "Lahore", "country": "Pakistan" }
}`,
});
endpoint('PATCH', '/api/employees/:id', {
  auth: AUTH,
  roles: 'self: phone/address/emergencyContacts | hr/admin: full',
  headers: HDR_JSON,
  body: `{
  "phone": "03009998877",
  "address": { "city": "Karachi" },
  "emergencyContacts": [
    { "name": "Father", "relation": "father", "phone": "03001110000" }
  ]
}`,
});
endpoint('DELETE', '/api/employees/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  notes: 'Soft delete (isDeleted=true)',
});
endpoint('POST', '/api/employees/:id/documents', {
  auth: AUTH,
  roles: 'self or hr/admin',
  headers: HDR_MULTI,
  formData: `file: <binary>
name: "CNIC"
type: "id"`,
});
endpoint('POST', '/api/employees/:id/photo', {
  auth: AUTH,
  roles: 'self or hr/admin',
  headers: HDR_MULTI,
  formData: `photo: <image file>`,
});

h1('3. Departments & Branches  /api/departments');
endpoint('GET', '/api/departments', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/departments', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "name": "Engineering",
  "code": "ENG",
  "description": "Product engineering",
  "head": "<userId>"
}`,
});
endpoint('PATCH', '/api/departments/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{ "name": "Engineering & IT", "isActive": true }`,
});
endpoint('DELETE', '/api/departments/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  notes: 'Deactivates department',
});
endpoint('GET', '/api/departments/branches/list', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/departments/branches', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "name": "Lahore HQ",
  "code": "LHR",
  "city": "Lahore",
  "country": "Pakistan",
  "phone": "042111222333"
}`,
});
endpoint('PATCH', '/api/departments/branches/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{ "city": "Lahore", "isActive": true }`,
});
endpoint('DELETE', '/api/departments/branches/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
});

h1('4. Attendance  /api/attendance');
endpoint('POST', '/api/attendance/clock-in', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_JSON,
  body: `{ "location": { "lat": 31.52, "lng": 74.35 } }`,
});
endpoint('POST', '/api/attendance/clock-out', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_JSON,
  body: `{
  "location": { "lat": 31.52, "lng": 74.35 },
  "earlyLeaveReason": "Doctor appointment"
}`,
});
endpoint('POST', '/api/attendance/late-reason', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_JSON,
  body: `{
  "date": "2026-07-28",
  "reason": "Traffic jam"
}`,
});
endpoint('GET', '/api/attendance/me', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
  query: '?from=2026-07-01&to=2026-07-31',
});
endpoint('GET', '/api/attendance/team', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_AUTH,
  query: '?from=&to=&employeeId=',
});
endpoint('PATCH', '/api/attendance/:id/adjust', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_JSON,
  body: `{
  "clockIn": "2026-07-28T09:05:00.000Z",
  "clockOut": "2026-07-28T18:00:00.000Z",
  "status": "late",
  "adjustmentNote": "Approved late arrival"
}`,
});
endpoint('GET', '/api/attendance/shifts', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/attendance/shifts', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "name": "General",
  "startTime": "09:00",
  "endTime": "18:00",
  "graceMinutes": 15
}`,
});
endpoint('PATCH', '/api/attendance/shifts/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{ "graceMinutes": 20 }`,
});
endpoint('GET', '/api/attendance/holidays', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/attendance/holidays', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "name": "Independence Day",
  "date": "2026-08-14",
  "type": "public"
}`,
});

h1('5. Leaves  /api/leaves');
endpoint('GET', '/api/leaves/policies', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/leaves/policies', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "name": "Annual Leave",
  "leaveType": "annual",
  "daysPerYear": 14,
  "carryForward": true,
  "description": "Yearly paid leave"
}`,
});
endpoint('PATCH', '/api/leaves/policies/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{ "daysPerYear": 16, "isActive": true }`,
});
endpoint('GET', '/api/leaves/balances/me', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
  query: '?year=2026',
});
endpoint('POST', '/api/leaves/balances', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "employee": "<userId>",
  "leaveType": "annual",
  "year": 2026,
  "allocated": 14
}`,
});
endpoint('POST', '/api/leaves/requests', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_JSON,
  body: `{
  "leaveType": "annual",
  "startDate": "2026-08-01",
  "endDate": "2026-08-03",
  "reason": "Family trip"
}`,
});
endpoint('GET', '/api/leaves/requests/me', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/leaves/requests', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_AUTH,
  query: '?status=pending',
});
endpoint('PATCH', '/api/leaves/requests/:id/review', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_JSON,
  body: `{
  "decision": "approved",
  "note": "OK",
  "escalateToHr": false
}`,
  notes: 'decision: approved | rejected',
});

h1('6. Payroll  /api/payroll');
endpoint('POST', '/api/payroll/structures', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "employee": "<userId>",
  "basic": 80000,
  "allowances": { "housing": 10000, "transport": 5000, "medical": 2000, "other": 0 },
  "deductions": { "tax": 3000, "providentFund": 4000, "loan": 0, "other": 0 },
  "currency": "PKR",
  "effectiveFrom": "2026-01-01"
}`,
});
endpoint('GET', '/api/payroll/structures/:employeeId', {
  auth: AUTH,
  roles: 'staff / hr / admin',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/payroll/run', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "month": 7,
  "year": 2026,
  "bonuses": { "<employeeId>": 5000 }
}`,
});
endpoint('GET', '/api/payroll/runs', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/payroll/payslips/me', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/payroll/payslips/:id', {
  auth: AUTH,
  roles: 'owner or hr/admin',
  headers: HDR_AUTH,
});

h1('7. Performance  /api/performance');
endpoint('POST', '/api/performance/goals', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_JSON,
  body: `{
  "employee": "<userId optional for self>",
  "title": "Improve API coverage",
  "description": "Add remaining module tests",
  "framework": "kpi",
  "targetValue": 100,
  "currentValue": 40,
  "unit": "%",
  "dueDate": "2026-09-30"
}`,
});
endpoint('GET', '/api/performance/goals', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
  query: '?employee=<id>',
});
endpoint('PATCH', '/api/performance/goals/:id', {
  auth: AUTH,
  roles: 'owner / manager / hr / admin',
  headers: HDR_JSON,
  body: `{ "currentValue": 70, "status": "active" }`,
});
endpoint('POST', '/api/performance/reviews', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_JSON,
  body: `{
  "employee": "<userId>",
  "period": "2026-H1",
  "status": "draft"
}`,
});
endpoint('GET', '/api/performance/reviews', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
  query: '?employee=<id>',
});
endpoint('PATCH', '/api/performance/reviews/:id/self-assessment', {
  auth: AUTH,
  roles: 'employee (own review)',
  headers: HDR_JSON,
  body: `{ "selfAssessment": "Completed all assigned OKRs..." }`,
});
endpoint('PATCH', '/api/performance/reviews/:id/complete', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_JSON,
  body: `{
  "managerComments": "Strong performer",
  "rating": 4,
  "promotionRecommendation": "none"
}`,
  notes: 'promotionRecommendation: none | promote | demote',
});

h1('8. Training  /api/training');
endpoint('GET', '/api/training/courses', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/training/courses', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "title": "Workplace Safety",
  "description": "Mandatory safety training",
  "category": "compliance",
  "durationHours": 4,
  "isMandatory": true
}`,
});
endpoint('PATCH', '/api/training/courses/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{ "isActive": true, "durationHours": 5 }`,
});
endpoint('POST', '/api/training/courses/:courseId/enroll', {
  auth: AUTH,
  roles: 'staff (self) / manager (team) / hr',
  headers: HDR_JSON,
  body: `{ "employee": "<optional userId>" }`,
});
endpoint('GET', '/api/training/enrollments/me', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('PATCH', '/api/training/enrollments/:id/progress', {
  auth: AUTH,
  roles: 'owner or hr/admin',
  headers: HDR_JSON,
  body: `{ "progress": 80, "status": "in-progress" }`,
});
endpoint('POST', '/api/training/enrollments/:id/certificate', {
  auth: AUTH,
  roles: 'enrollment owner',
  headers: HDR_MULTI,
  formData: `certificate: <pdf/image file>`,
});
endpoint('GET', '/api/training/reports/completion', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
});

h1('9. Expenses  /api/expenses');
endpoint('POST', '/api/expenses', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_MULTI,
  formData: `title: Client lunch
category: meal
amount: 2500
currency: PKR
description: Meeting with client
expenseDate: 2026-07-20
receipt: <file>`,
  notes: 'category: travel | meal | equipment | training | other',
});
endpoint('GET', '/api/expenses/me', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/expenses', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_AUTH,
  query: '?status=pending',
});
endpoint('PATCH', '/api/expenses/:id/review', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_JSON,
  body: `{
  "decision": "approved",
  "note": "Valid receipt"
}`,
  notes: 'High-value (>=50000) needs HR/Admin',
});

h1('10. Assets  /api/assets');
endpoint('GET', '/api/assets/me', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/assets/team', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/assets/assign', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_JSON,
  body: `{
  "asset": "<assetId>",
  "employee": "<userId>",
  "notes": "New hire laptop"
}`,
});
endpoint('PATCH', '/api/assets/assignments/:id/return-request', {
  auth: AUTH,
  roles: 'assignment owner',
  headers: HDR_AUTH,
});
endpoint('PATCH', '/api/assets/assignments/:id/return', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/assets', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
  query: '?status=available',
});
endpoint('POST', '/api/assets', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "name": "MacBook Pro 14",
  "assetTag": "AST-001",
  "category": "laptop",
  "status": "available",
  "value": 350000
}`,
});
endpoint('PATCH', '/api/assets/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{ "status": "maintenance", "notes": "Battery issue" }`,
});

h1('11. Recruitment  /api/recruitment');
endpoint('GET', '/api/recruitment/jobs', {
  auth: AUTH_OPT,
  headers: HDR_AUTH + ' (optional)',
  query: '?status=active',
  notes: 'Public sees active jobs only. HR/Admin with token can filter.',
});
endpoint('POST', '/api/recruitment/jobs', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "title": "Frontend Developer",
  "description": "Build RN + web UI",
  "department": "<deptId>",
  "branch": "<branchId>",
  "requirements": ["React Native", "2+ years"],
  "employmentType": "full-time",
  "location": "Lahore",
  "salaryRange": { "min": 80000, "max": 120000, "currency": "PKR" },
  "status": "active",
  "closesAt": "2026-08-31"
}`,
});
endpoint('PATCH', '/api/recruitment/jobs/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{ "status": "closed" }`,
});
endpoint('DELETE', '/api/recruitment/jobs/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  notes: 'Sets status to closed',
});
endpoint('POST', '/api/recruitment/jobs/:jobId/apply', {
  auth: AUTH,
  roles: 'candidate',
  headers: HDR_MULTI,
  formData: `coverLetter: I am interested...
resume: <pdf/doc file>`,
});
endpoint('GET', '/api/recruitment/applications/me', {
  auth: AUTH,
  roles: 'candidate',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/recruitment/applications', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  query: '?job=&status=',
});
endpoint('PATCH', '/api/recruitment/applications/:id/status', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "status": "shortlisted",
  "notes": "Strong portfolio"
}`,
  notes: 'status: applied | shortlisted | interview | hired | rejected',
});
endpoint('POST', '/api/recruitment/applications/:id/interviews', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "scheduledAt": "2026-08-05T10:00:00.000Z",
  "mode": "online",
  "location": "Zoom link",
  "interviewers": ["<managerUserId>"],
  "notes": "Technical round"
}`,
});
endpoint('PATCH', '/api/recruitment/interviews/:id', {
  auth: AUTH,
  roles: 'candidate, hr, admin',
  headers: HDR_JSON,
  body: `{
  "action": "cancel"
}
OR
{
  "action": "reschedule",
  "scheduledAt": "2026-08-06T11:00:00.000Z",
  "mode": "phone"
}`,
});
endpoint('POST', '/api/recruitment/interviews/:id/feedback', {
  auth: AUTH,
  roles: 'assigned interviewer / hr / admin',
  headers: HDR_JSON,
  body: `{
  "score": 8,
  "comments": "Good problem solving",
  "recommendation": "hire"
}`,
  notes: 'recommendation: strong-hire | hire | no-hire | strong-no-hire',
});
endpoint('POST', '/api/recruitment/applications/:id/hire', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "role": "employee",
  "department": "<deptId>",
  "branch": "<branchId>",
  "manager": "<managerId>",
  "designation": "Junior Developer",
  "dateOfJoining": "2026-08-15"
}`,
  notes: 'Converts candidate user to employee + employeeId',
});
endpoint('GET', '/api/recruitment/interviews/me', {
  auth: AUTH,
  roles: 'all roles',
  headers: HDR_AUTH,
});

h1('12. Communication  /api/communication');
endpoint('GET', '/api/communication/announcements', {
  auth: AUTH,
  roles: 'all',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/communication/announcements', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_JSON,
  body: `{
  "title": "Office closed Friday",
  "body": "Due to maintenance...",
  "audience": "all",
  "isPinned": true
}`,
  notes: 'audience: all | department | team',
});
endpoint('POST', '/api/communication/messages', {
  auth: AUTH,
  roles: 'all',
  headers: HDR_JSON,
  body: `{
  "recipient": "<userId>",
  "subject": "Leave question",
  "body": "Can I take leave next week?"
}`,
});
endpoint('GET', '/api/communication/messages/inbox', {
  auth: AUTH,
  roles: 'all',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/communication/messages/sent', {
  auth: AUTH,
  roles: 'all',
  headers: HDR_AUTH,
});
endpoint('PATCH', '/api/communication/messages/:id/read', {
  auth: AUTH,
  roles: 'recipient',
  headers: HDR_AUTH,
});

h1('13. Reports  /api/reports');
endpoint('GET', '/api/reports/me', {
  auth: AUTH,
  roles: 'staff',
  headers: HDR_AUTH,
  notes: 'Personal KPI: attendance %, leave usage',
});
endpoint('GET', '/api/reports/team', {
  auth: AUTH,
  roles: 'manager, hr, admin',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/reports/hr', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  notes: 'Hiring funnel, employee counts, payslips',
});

h1('14. Admin  /api/admin');
endpoint('GET', '/api/admin/users', {
  auth: AUTH,
  roles: 'admin only',
  headers: HDR_AUTH,
  query: '?role=employee&includeDeleted=false',
});
endpoint('PATCH', '/api/admin/users/:id/status', {
  auth: AUTH,
  roles: 'admin',
  headers: HDR_JSON,
  body: `{ "isActive": false }`,
});
endpoint('POST', '/api/admin/users/:id/force-password-reset', {
  auth: AUTH,
  roles: 'admin',
  headers: HDR_AUTH,
  notes: 'Audit flag — user uses forgot-password flow',
});
endpoint('PATCH', '/api/admin/users/:id/role', {
  auth: AUTH,
  roles: 'admin',
  headers: HDR_JSON,
  body: `{ "role": "manager" }`,
});
endpoint('DELETE', '/api/admin/users/purge-deleted', {
  auth: AUTH,
  roles: 'admin',
  headers: HDR_AUTH,
  notes: 'Permanently deletes soft-deleted users',
});
endpoint('GET', '/api/admin/settings', {
  auth: AUTH,
  roles: 'admin',
  headers: HDR_AUTH,
});
endpoint('PUT', '/api/admin/settings', {
  auth: AUTH,
  roles: 'admin',
  headers: HDR_JSON,
  body: `{
  "key": "salaryCycle",
  "value": { "day": 28 },
  "description": "Monthly payroll day"
}`,
});
endpoint('GET', '/api/admin/audit-logs', {
  auth: AUTH,
  roles: 'admin',
  headers: HDR_AUTH,
  query: '?limit=100',
});

h1('15. Postman / App tips');
body(
  '1. Always send role with auth endpoints (same role selected in the RN app)\n2. Login → copy data.token and read data.user.role for navigation\n3. In every protected request set Header:\n   Authorization: Bearer <token>\n4. For file uploads use form-data (not raw JSON)\n5. IDs are MongoDB ObjectIds (24 hex chars)\n6. Dates: ISO strings e.g. 2026-07-28 or 2026-07-28T09:00:00.000Z\n7. Forgot password: forgot-password → verify-otp → reset-password (use otp from dev response)'
);
body(
  'Example login success:\n{\n  "success": true,\n  "message": "Login successful",\n  "data": {\n    "user": { "_id": "...", "role": "hr", "name": "...", "email": "..." },\n    "token": "eyJhbGciOi..."\n  }\n}'
);
body(
  'Example role mismatch (403):\n{\n  "success": false,\n  "message": "This account is registered as \'employee\'. Please select that role to login."\n}'
);

doc.end();
console.log('PDF written to', outPath);
