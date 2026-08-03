import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(
  __dirname,
  '..',
  'Brilliance_Manager_Employee_HR_API_Documentation.pdf'
);

const doc = new PDFDocument({
  margin: 50,
  size: 'A4',
  info: {
    Title: 'Brilliance EMS — Manager / Employee / HR API',
    Author: 'Brilliance Backend',
  },
});

doc.pipe(fs.createWriteStream(outPath));

const pageWidth = doc.page.width - 100;
const AUTH = 'Bearer JWT required';
const HDR_JSON =
  'Content-Type: application/json | Authorization: Bearer <token>';
const HDR_AUTH = 'Authorization: Bearer <token>';
const HDR_MULTI =
  'Content-Type: multipart/form-data | Authorization: Bearer <token>';

function ensureSpace(needed = 80) {
  if (doc.y + needed > doc.page.height - 50) doc.addPage();
}

function h1(text) {
  ensureSpace(40);
  doc.moveDown(0.5);
  doc.fontSize(15).fillColor('#1a365d').text(text);
  doc.moveDown(0.2);
  doc
    .moveTo(50, doc.y)
    .lineTo(50 + pageWidth, doc.y)
    .strokeColor('#2b6cb0')
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.45);
  doc.fillColor('#000');
}

function body(text) {
  ensureSpace(16);
  doc.fontSize(9.5).fillColor('#222').text(text, { width: pageWidth, lineGap: 2 });
  doc.moveDown(0.2);
}

function mono(text) {
  ensureSpace(14);
  doc.font('Courier').fontSize(8).fillColor('#111').text(text, { width: pageWidth });
  doc.font('Helvetica');
}

function endpoint(method, pathStr, info) {
  ensureSpace(100);
  doc.moveDown(0.25);
  const colors = {
    GET: '#276749',
    POST: '#2b6cb0',
    PATCH: '#c05621',
    PUT: '#6b46c1',
    DELETE: '#c53030',
  };
  doc
    .fontSize(10.5)
    .fillColor(colors[method] || '#000')
    .text(`${method}  `, { continued: true })
    .fillColor('#1a202c')
    .text(pathStr);
  doc.moveDown(0.1);
  if (info.auth) doc.fontSize(8.5).fillColor('#4a5568').text(`Auth: ${info.auth}`);
  if (info.roles) doc.fontSize(8.5).fillColor('#4a5568').text(`Roles: ${info.roles}`);
  if (info.perm)
    doc.fontSize(8.5).fillColor('#4a5568').text(`Permission: ${info.perm}`);
  if (info.headers)
    doc.fontSize(8.5).fillColor('#4a5568').text(`Headers: ${info.headers}`);
  if (info.query) doc.fontSize(8.5).fillColor('#4a5568').text(`Query: ${info.query}`);
  if (info.body) {
    doc.fontSize(8.5).fillColor('#2d3748').text('Body (JSON):');
    mono(info.body);
  }
  if (info.formData) {
    doc.fontSize(8.5).fillColor('#2d3748').text('Body (multipart/form-data):');
    mono(info.formData);
  }
  if (info.notes) doc.fontSize(8.5).fillColor('#718096').text(`Note: ${info.notes}`);
  doc.moveDown(0.1);
  doc
    .moveTo(50, doc.y)
    .lineTo(50 + pageWidth, doc.y)
    .strokeColor('#e2e8f0')
    .lineWidth(0.5)
    .stroke();
}

// COVER
doc.fontSize(20).fillColor('#1a365d').text('Brilliance EMS', { align: 'center' });
doc.moveDown(0.2);
doc
  .fontSize(14)
  .fillColor('#2b6cb0')
  .text('Manager · Employee · HR API Documentation', { align: 'center' });
doc.moveDown(0.7);
doc
  .fontSize(10)
  .fillColor('#444')
  .text('Base URL: http://localhost:5000', { align: 'center' });
doc.text('Prefixes: /api/manager  ·  /api/employee  ·  /api/hr  ·  /api/auth', {
  align: 'center',
});
doc.moveDown(0.5);
body(
  'All protected routes need:\n  Authorization: Bearer <jwt_token>\n\n' +
    'Response: { success, message, data }\nError: { success: false, message, errors? }\n\n' +
    'Roles: candidate | employee | manager | hr | admin\n\n' +
    'Domain rules:\n' +
    '• Employee can have multiple managers (primary | secondary)\n' +
    '• At most ONE primary manager per employee\n' +
    '• Manager permissions (HR-controlled): teamManagement, approvals, performance, tasks, reports, communication\n' +
    '• Leave / overtime / expense always include reviewing managerId\n' +
    '• Tasks store managerId + assigneeId'
);

h1('0. Auth (shared)');
endpoint('POST', '/api/auth/login', {
  auth: 'No auth',
  headers: 'Content-Type: application/json',
  body: `{
  "email": "user@example.com",
  "password": "secret12",
  "role": "manager"   // employee | manager | hr | admin | candidate
}`,
  notes: 'Returns data.token + data.user',
});
endpoint('GET', '/api/auth/me', {
  auth: AUTH,
  roles: 'any authenticated',
  headers: HDR_AUTH,
  notes:
    'Employee → managers[] + profileCompletion. Manager → permissions + managerProfile + profileCompletion.',
});

h1('1. Manager APIs — /api/manager');
body('Role: manager. Most routes also need a ManagerProfile permission flag.');

endpoint('GET', '/api/manager/dashboard', {
  auth: AUTH,
  roles: 'manager',
  headers: HDR_AUTH,
  notes: 'teamSize, presentToday, pendingApprovals, openTasks, profileCompletion, permissions',
});

endpoint('GET', '/api/manager/team', {
  auth: AUTH,
  roles: 'manager',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/manager/team', {
  auth: AUTH,
  roles: 'manager',
  perm: 'teamManagement',
  headers: HDR_JSON,
  body: `{
  "employeeId": "<User ObjectId>",
  "relationshipType": "primary"   // optional: primary | secondary (default secondary)
}`,
});
endpoint('DELETE', '/api/manager/team/:employeeId', {
  auth: AUTH,
  roles: 'manager',
  perm: 'teamManagement',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/manager/employees/available', {
  auth: AUTH,
  roles: 'manager',
  perm: 'teamManagement',
  headers: HDR_AUTH,
  notes: 'Employees not yet on MY team (may still have other managers)',
});

endpoint('GET', '/api/manager/tasks', {
  auth: AUTH,
  roles: 'manager',
  perm: 'tasks',
  headers: HDR_AUTH,
  query: 'status?=pending|in_progress|completed',
});
endpoint('POST', '/api/manager/tasks', {
  auth: AUTH,
  roles: 'manager',
  perm: 'tasks',
  headers: HDR_JSON,
  body: `{
  "title": "Ship feature X",
  "description": "Optional details",
  "assigneeId": "<employee UserId>",
  "deadline": "2026-08-20T17:00:00.000Z",
  "priority": "high"   // high | medium | low
}`,
});
endpoint('PATCH', '/api/manager/tasks/:id', {
  auth: AUTH,
  roles: 'manager',
  perm: 'tasks',
  headers: HDR_JSON,
  body: `{
  "title": "...",
  "status": "in_progress",
  "priority": "medium",
  "deadline": "...",
  "assigneeId": "..."
}`,
});
endpoint('DELETE', '/api/manager/tasks/:id', {
  auth: AUTH,
  roles: 'manager',
  perm: 'tasks',
  headers: HDR_AUTH,
  notes: 'Soft-delete',
});

endpoint('GET', '/api/manager/approvals', {
  auth: AUTH,
  roles: 'manager',
  perm: 'approvals',
  headers: HDR_AUTH,
  query: 'type?=leave|overtime|expense & status?=pending|approved|rejected',
});
endpoint('PATCH', '/api/manager/approvals/:type/:id', {
  auth: AUTH,
  roles: 'manager',
  perm: 'approvals',
  headers: HDR_JSON,
  body: `{
  "status": "approved",   // approved | rejected
  "note": "Looks good"    // optional
}`,
  notes: 'type path param = leave | overtime | expense',
});

endpoint('GET', '/api/manager/reviews', {
  auth: AUTH,
  roles: 'manager',
  perm: 'performance',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/manager/reviews', {
  auth: AUTH,
  roles: 'manager',
  perm: 'performance',
  headers: HDR_JSON,
  body: `{
  "employeeId": "<UserId>",
  "period": "2026-Q2",
  "rating": 4,
  "feedback": "Strong delivery",
  "kpis": [
    { "name": "Delivery", "target": "90%", "actual": "95%" }
  ]
}`,
});
endpoint('GET', '/api/manager/reviews/:id/appraisal', {
  auth: AUTH,
  roles: 'manager',
  perm: 'performance',
  headers: HDR_AUTH,
  notes: 'Appraisal payload (PDF later)',
});

endpoint('POST', '/api/manager/announcements', {
  auth: AUTH,
  roles: 'manager',
  perm: 'communication',
  headers: HDR_JSON,
  body: `{
  "title": "Sprint kickoff",
  "body": "Standup at 10 AM"
}`,
  notes: 'audience=team; notifies current team members',
});
endpoint('GET', '/api/manager/announcements', {
  auth: AUTH,
  roles: 'manager',
  perm: 'communication',
  headers: HDR_AUTH,
});
endpoint('POST', '/api/manager/messages', {
  auth: AUTH,
  roles: 'manager',
  perm: 'communication',
  headers: HDR_JSON,
  body: `{
  "toEmployeeId": "<UserId>",
  "title": "Optional",
  "body": "Please update the task status"
}`,
});

endpoint('GET', '/api/manager/reports/overview', {
  auth: AUTH,
  roles: 'manager',
  perm: 'reports',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/manager/reports/attendance', {
  auth: AUTH,
  roles: 'manager',
  perm: 'reports',
  headers: HDR_AUTH,
  notes: 'Mockable aggregate for now',
});
endpoint('GET', '/api/manager/reports/productivity', {
  auth: AUTH,
  roles: 'manager',
  perm: 'reports',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/manager/reports/performance', {
  auth: AUTH,
  roles: 'manager',
  perm: 'reports',
  headers: HDR_AUTH,
});

h1('2. Employee APIs — /api/employee');
body('Role: employee. Requests must target an assigned managerId.');

endpoint('GET', '/api/employee/dashboard', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_AUTH,
  notes: 'managers, pendingTasks, announcements, alerts, profileCompletion',
});
endpoint('GET', '/api/employee/managers', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_AUTH,
  notes: '[{ id, name, relationshipType, department, ... }]',
});

endpoint('GET', '/api/employee/tasks', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_AUTH,
  query: 'managerId? & status?=pending|in_progress|completed',
});
endpoint('PATCH', '/api/employee/tasks/:id/status', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_JSON,
  body: `{
  "status": "in_progress"   // pending | in_progress | completed
}`,
  notes: 'Own tasks only',
});

endpoint('POST', '/api/employee/leave', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_JSON,
  body: `{
  "managerId": "<assigned manager UserId>",
  "type": "annual",          // annual | sick | casual | unpaid | ...
  "from": "2026-08-10",
  "to": "2026-08-12",
  "reason": "Family event",
  "days": 3                  // optional; auto-calculated if omitted
}`,
});
endpoint('GET', '/api/employee/leave', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_AUTH,
  query: 'managerId? & status?',
});

endpoint('POST', '/api/employee/overtime', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_JSON,
  body: `{
  "managerId": "<UserId>",
  "date": "2026-08-05",
  "hours": 2.5,
  "reason": "Release support"
}`,
});
endpoint('GET', '/api/employee/overtime', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_AUTH,
  query: 'managerId? & status?',
});

endpoint('POST', '/api/employee/expenses', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_MULTI,
  formData: `managerId   = <UserId>          (required)
category    = travel|meal|equipment|training|other
title       = Taxi to client
amount      = 2500
date        = 2026-08-01
description = optional
receipt     = file (image/pdf)`,
});
endpoint('GET', '/api/employee/expenses', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_AUTH,
  query: 'managerId? & status?',
});

endpoint('GET', '/api/employee/profile-completion', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_AUTH,
  notes:
    'Returns incomplete: [{ key, title, screen }] for personalInfo, documents, emergencyContact, bankDetails',
});
endpoint('PATCH', '/api/employee/profile-completion/:section', {
  auth: AUTH,
  roles: 'employee',
  headers: HDR_JSON,
  body: `// section = personalInfo | documents | emergencyContact | bankDetails

// personalInfo
{ "name": "...", "phone": "...", "address": { "street","city","country" } }

// emergencyContact
{ "name": "...", "relation": "Brother", "phone": "..." }
// or { "emergencyContacts": [ { name, relation, phone } ] }

// bankDetails
{ "accountTitle": "...", "bankName": "...", "accountNumber": "...", "iban": "..." }

// documents
{ "documents": [ { "name": "CNIC", "url": "..." } ] }`,
});

h1('3. HR APIs — /api/hr');
body('Roles: hr | admin');

endpoint('GET', '/api/hr/dashboard', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/hr/profile-alerts', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  notes: 'Employees/managers with incomplete profile sections',
});

endpoint('GET', '/api/hr/managers', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  query: 'status?=active|inactive & search?',
});
endpoint('POST', '/api/hr/managers', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "name": "Sara Manager",
  "email": "sara.mgr@brilliance.local",
  "password": "Secret12",
  "title": "Engineering Manager",
  "department": "Engineering",
  "phone": "0300...",
  "team": [
    { "employeeId": "<UserId>", "relationshipType": "primary" }
  ],
  "permissions": {
    "teamManagement": true,
    "approvals": true,
    "performance": true,
    "tasks": true,
    "reports": true,
    "communication": true
  }
}`,
});
endpoint('GET', '/api/hr/managers/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  notes: 'id = ManagerProfile _id OR User _id',
});
endpoint('PATCH', '/api/hr/managers/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "title": "...",
  "department": "...",
  "status": "active",
  "name": "...",
  "phone": "...",
  "permissions": { "reports": false },
  "team": [ { "employeeId": "...", "relationshipType": "secondary" } ]
}`,
});
endpoint('POST', '/api/hr/managers/:id/transfer', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "department": "Product",
  "title": "Product Manager"   // optional
}`,
});
endpoint('POST', '/api/hr/managers/:id/deactivate', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "reassignToManagerId": "<UserId>"   // optional — moves team assignments
}`,
});
endpoint('GET', '/api/hr/managers/:id/activity', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/hr/managers/:id/report', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/hr/managers/:id/permissions', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
});
endpoint('PUT', '/api/hr/managers/:id/permissions', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "teamManagement": true,
  "approvals": true,
  "performance": true,
  "tasks": true,
  "reports": false,
  "communication": true
}`,
});

endpoint('POST', '/api/hr/assignments', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "managerId": "<UserId>",
  "employeeId": "<UserId>",
  "relationshipType": "primary"   // primary | secondary
}`,
});
endpoint('PATCH', '/api/hr/assignments/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{ "relationshipType": "secondary" }`,
});
endpoint('DELETE', '/api/hr/assignments/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
});
endpoint('GET', '/api/hr/employees/:id/managers', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
});

h1('4. Quick curl examples');
mono(`# Login as HR
curl -X POST http://localhost:5000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d "{\\"email\\":\\"hr@x.com\\",\\"password\\":\\"...\\",\\"role\\":\\"hr\\"}"

# Create manager
curl -X POST http://localhost:5000/api/hr/managers \\
  -H "Authorization: Bearer $HR_TOKEN" -H "Content-Type: application/json" \\
  -d "{\\"name\\":\\"Mgr\\",\\"email\\":\\"m@x.com\\",\\"password\\":\\"Secret12\\",\\"title\\":\\"EM\\"}"

# Assign primary manager
curl -X POST http://localhost:5000/api/hr/assignments \\
  -H "Authorization: Bearer $HR_TOKEN" -H "Content-Type: application/json" \\
  -d "{\\"managerId\\":\\"...\\",\\"employeeId\\":\\"...\\",\\"relationshipType\\":\\"primary\\"}"

# Employee leave
curl -X POST http://localhost:5000/api/employee/leave \\
  -H "Authorization: Bearer $EMP_TOKEN" -H "Content-Type: application/json" \\
  -d "{\\"managerId\\":\\"...\\",\\"type\\":\\"annual\\",\\"from\\":\\"2026-08-10\\",\\"to\\":\\"2026-08-12\\",\\"reason\\":\\"Trip\\"}"

# Manager approve
curl -X PATCH http://localhost:5000/api/manager/approvals/leave/LEAVE_ID \\
  -H "Authorization: Bearer $MGR_TOKEN" -H "Content-Type: application/json" \\
  -d "{\\"status\\":\\"approved\\",\\"note\\":\\"OK\\"}"`);

doc.moveDown(1);
doc
  .fontSize(8.5)
  .fillColor('#718096')
  .text(
    'Generated for Brilliance EMS FYP — Manager / Employee / HR module. Existing /api/leaves & /api/expenses remain available as legacy domain routes.',
    { align: 'center' }
  );

doc.end();
console.log(`Wrote ${outPath}`);
