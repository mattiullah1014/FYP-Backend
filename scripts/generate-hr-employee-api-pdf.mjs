import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(
  __dirname,
  '..',
  'Brilliance_HR_Employee_API_Documentation.pdf'
);

const doc = new PDFDocument({
  margin: 50,
  size: 'A4',
  info: {
    Title: 'Brilliance EMS — HR Employee Module API',
    Author: 'Brilliance Backend',
  },
});

doc.pipe(fs.createWriteStream(outPath));

const pageWidth = doc.page.width - 100;
const AUTH = 'Bearer JWT required';
const ROLES_HR = 'hr | admin';
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

function h2(text) {
  ensureSpace(28);
  doc.moveDown(0.3);
  doc.fontSize(11.5).fillColor('#2c5282').text(text);
  doc.moveDown(0.15);
  doc.fillColor('#000');
}

function body(text) {
  ensureSpace(16);
  doc
    .fontSize(9.5)
    .fillColor('#222')
    .text(text, { width: pageWidth, lineGap: 2 });
  doc.moveDown(0.2);
}

function mono(text) {
  ensureSpace(14);
  doc
    .font('Courier')
    .fontSize(8)
    .fillColor('#111')
    .text(text, { width: pageWidth });
  doc.font('Helvetica');
}

function endpoint(method, pathStr, info) {
  ensureSpace(110);
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
  if (info.auth)
    doc.fontSize(8.5).fillColor('#4a5568').text(`Auth: ${info.auth}`);
  if (info.roles)
    doc.fontSize(8.5).fillColor('#4a5568').text(`Roles: ${info.roles}`);
  if (info.headers)
    doc.fontSize(8.5).fillColor('#4a5568').text(`Headers: ${info.headers}`);
  if (info.params)
    doc.fontSize(8.5).fillColor('#4a5568').text(`Params: ${info.params}`);
  if (info.query)
    doc.fontSize(8.5).fillColor('#4a5568').text(`Query: ${info.query}`);
  if (info.body) {
    doc.fontSize(8.5).fillColor('#2d3748').text('Body (JSON):');
    mono(info.body);
  }
  if (info.formData) {
    doc.fontSize(8.5).fillColor('#2d3748').text('Body (multipart/form-data):');
    mono(info.formData);
  }
  if (info.response) {
    doc.fontSize(8.5).fillColor('#2d3748').text('Success response (data):');
    mono(info.response);
  }
  if (info.notes)
    doc.fontSize(8.5).fillColor('#718096').text(`Note: ${info.notes}`);
  doc.moveDown(0.1);
  doc
    .moveTo(50, doc.y)
    .lineTo(50 + pageWidth, doc.y)
    .strokeColor('#e2e8f0')
    .lineWidth(0.5)
    .stroke();
}

// ── COVER ──────────────────────────────────────────────────
doc.fontSize(20).fillColor('#1a365d').text('Brilliance EMS', {
  align: 'center',
});
doc.moveDown(0.2);
doc
  .fontSize(14)
  .fillColor('#2b6cb0')
  .text('HR Employee Module — API Documentation', { align: 'center' });
doc.moveDown(0.7);
doc
  .fontSize(10)
  .fillColor('#444')
  .text('Base URL: http://localhost:5000  (or Cloudflare tunnel URL)', {
    align: 'center',
  });
doc.text('Prefix: /api/hr/employees  ·  Related: /api/applications', {
  align: 'center',
});
doc.moveDown(0.35);
doc
  .fontSize(9)
  .fillColor('#718096')
  .text(`Generated: ${new Date().toISOString().slice(0, 10)}`, {
    align: 'center',
  });

doc.moveDown(0.8);
body(
  'All routes below require:\n' +
    '  Authorization: Bearer <jwt_token>\n\n' +
    'Allowed roles: hr | admin\n\n' +
    'Standard response:\n' +
    '  { "success": true, "message": "...", "data": { ... } }\n\n' +
    'Error response:\n' +
    '  { "success": false, "message": "...", "errors": ["..."] }\n\n' +
    'Employee :id can be MongoDB _id OR empId (e.g. EMP001).\n' +
    'Soft-delete sets status=Deleted and disables login (User.isActive=false, isDeleted=true).'
);

h1('0. Auth — get JWT');
endpoint('POST', '/api/auth/login', {
  auth: 'No auth',
  headers: 'Content-Type: application/json',
  body: `{
  "email": "hr@brilliance.com",
  "password": "your-password",
  "role": "hr"
}`,
  response: `{
  "token": "<jwt>",
  "user": { "id", "name", "email", "role", ... }
}`,
  notes: 'Use data.token as Bearer token for all HR Employee APIs.',
});

h1('1. Employee object shape (normalized)');
body(
  'Every create / get / update / list item returns this shape inside data.employee or data.employees[]:'
);
mono(`{
  "id": "<Employee MongoId>",
  "name": "Ali Khan",
  "empId": "EMP001",
  "role": "Employee",
  "designation": "Software Engineer",
  "dept": "Engineering",
  "department": "Engineering",
  "joined": "2026-08-01T00:00:00.000Z",
  "dateOfJoining": "2026-08-01T00:00:00.000Z",
  "email": "ali@brilliance.com",
  "phone": "03001234567",
  "status": "Active",          // Active | Inactive | Deleted
  "branch": "Lahore",
  "manager": "Sara Ahmed",
  "managers": [
    { "name": "Sara Ahmed", "relationship": "Primary" }
  ],
  "salary": 85000,
  "address": { "street": "...", "city": "...", "country": "..." },
  "emergencyContact": {
    "name": "...", "phone": "...", "relation": "..."
  },
  "bank": {
    "bankName": "...", "accountNumber": "...", "iban": "..."
  },
  "assets": [
    {
      "id": "...", "name": "Laptop", "tag": "LT-01",
      "status": "Assigned", "assignedOn": "..."
    }
  ],
  "documents": [
    {
      "id": "...", "name": "CNIC.pdf", "type": "cnic",
      "uploadedAt": "...", "url": "/uploads/documents/..."
    }
  ],
  "initial": "AK",
  "userId": "<User MongoId>"
}`);

h1('2. Employees CRUD — /api/hr/employees');

h2('2.1 List employees');
endpoint('GET', '/api/hr/employees', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_AUTH,
  query:
    'department?=string  status?=Active|Inactive|Deleted  search?=string  page?=1  limit?=20',
  response: `{
  "employees": [ /* Employee objects */ ],
  "pagination": {
    "page": 1, "limit": 20, "total": 42, "pages": 3
  }
}`,
  notes:
    'Excludes Deleted by default unless status=Deleted. Also backfills Employee profiles for legacy staff Users.',
});

h2('2.2 Create employee');
endpoint('POST', '/api/hr/employees', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_JSON,
  body: `{
  // ── REQUIRED ──
  "name": "Ali Khan",
  "email": "ali@brilliance.com",
  "phone": "03001234567",
  "password": "TempPass123",      // min 8 characters
  "designation": "Software Engineer",
  "dateOfJoining": "2026-08-01",
  "salary": 85000,                // number > 0

  // ── OPTIONAL ──
  "empId": "EMP010",              // omit → auto EMP001 / EMP002 …
  "role": "employee",             // default: employee
  "department": "Engineering",    // default: "General"
  "branch": "Lahore",             // default: "Head Office"
  "manager": "Sara Ahmed",        // User id | empId | email | name
  "address": { "street": "", "city": "", "country": "" },
  "emergencyContact": { "name": "", "phone": "", "relation": "" },
  "bank": { "bankName": "", "accountNumber": "", "iban": "" },
  "documentName": "Offer Letter",
  "applicationId": "<ApplicationId>"  // marks application Selected
}`,
  response: `{ "employee": { /* full Employee incl. generated empId */ } }`,
  notes:
    'Simplified Add Employee form. Only 7 fields required. empId never required from client. Unique email + empId. Defaults: role=employee, department=General, branch=Head Office.',
});

h2('2.3 Get employee by id / empId');
endpoint('GET', '/api/hr/employees/:id', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_AUTH,
  params: ':id = Mongo _id OR empId (EMP001)',
  response: `{ "employee": { /* full Employee object */ } }`,
});

h2('2.4 Partial update');
endpoint('PATCH', '/api/hr/employees/:id', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_JSON,
  params: ':id = Mongo _id OR empId',
  body: `{
  "name": "Ali Khan Updated",
  "phone": "03001112233",
  "designation": "Senior Engineer",
  "department": "Engineering",
  "branch": "Karachi",
  "role": "employee",
  "dateOfJoining": "2026-07-15",
  "manager": "<manager id or name>",
  "salary": 95000,
  "status": "Active",
  "address": { "street": "...", "city": "...", "country": "..." },
  "emergencyContact": { "name": "...", "phone": "...", "relation": "..." },
  "bank": { "bankName": "...", "accountNumber": "...", "iban": "..." }
}`,
  response: `{ "employee": { /* updated Employee object */ } }`,
  notes:
    'All fields optional. password is NOT accepted here (returns 400). Syncs User + ProfileCompletion bank/emergency where applicable.',
});

h2('2.5 Activate');
endpoint('POST', '/api/hr/employees/:id/activate', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_AUTH,
  params: ':id = Mongo _id OR empId',
  response: `{ "employee": { "status": "Active", ... } }`,
  notes: 'Sets Employee.status=Active, User.isActive=true. Cannot activate Deleted employees.',
});

h2('2.6 Deactivate');
endpoint('POST', '/api/hr/employees/:id/deactivate', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_AUTH,
  params: ':id = Mongo _id OR empId',
  response: `{ "employee": { "status": "Inactive", ... } }`,
  notes: 'Sets Employee.status=Inactive, User.isActive=false (login blocked).',
});

h2('2.7 Soft delete');
endpoint('DELETE', '/api/hr/employees/:id', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_AUTH,
  params: ':id = Mongo _id OR empId',
  response: `{ "employee": { "status": "Deleted", ... } }`,
  notes:
    'Soft-delete: status=Deleted, User.isDeleted=true, isActive=false. Removes manager assignments. Login disabled.',
});

h1('3. Documents — /api/hr/employees/:id/documents');

endpoint('GET', '/api/hr/employees/:id/documents', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_AUTH,
  params: ':id = Mongo _id OR empId',
  response: `{
  "documents": [
    {
      "id": "...",
      "name": "CNIC.pdf",
      "type": "cnic",
      "uploadedAt": "2026-08-03T00:00:00.000Z",
      "url": "/uploads/documents/...."
    }
  ]
}`,
});

endpoint('POST', '/api/hr/employees/:id/documents', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_MULTI,
  params: ':id = Mongo _id OR empId',
  formData: `file          (required) — pdf | doc | docx | jpeg | png | webp  (max 10MB)
type          (optional) — e.g. cnic | contract | other
name          (optional) — display name (defaults to original filename)
documentName  (optional) — alias for name`,
  response: `{
  "document": { "id", "name", "type", "uploadedAt", "url" },
  "documents": [ /* full list */ ]
}`,
  notes:
    'File stored under /uploads/documents/. Also mirrored on User.documents for employee portal.',
});

h1('4. Assets — /api/hr/employees/:id/assets');

endpoint('GET', '/api/hr/employees/:id/assets', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_AUTH,
  params: ':id = Mongo _id OR empId',
  response: `{
  "assets": [
    {
      "id": "...",
      "name": "MacBook Pro",
      "tag": "LT-42",
      "status": "Assigned",
      "assignedOn": "2026-08-01T00:00:00.000Z"
    }
  ]
}`,
});

endpoint('POST', '/api/hr/employees/:id/assets', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_JSON,
  params: ':id = Mongo _id OR empId',
  body: `{
  "name": "MacBook Pro",          // required
  "tag": "LT-42",
  "status": "Assigned",           // optional (default Assigned)
  "assignedOn": "2026-08-01"      // optional (default now)
}`,
  response: `{
  "asset": { "id", "name", "tag", "status", "assignedOn" },
  "assets": [ /* full list */ ]
}`,
});

h1('5. Managers link');

endpoint('GET', '/api/hr/employees/:id/managers', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_AUTH,
  params: ':id = Mongo _id OR empId',
  response: `{
  "managers": [
    { "name": "Sara Ahmed", "relationship": "Primary" },
    { "name": "Bilal Raza", "relationship": "Secondary" }
  ]
}`,
  notes:
    'Uses ManagerEmployeeAssignment. Falls back to User.manager / Employee.manager name if no assignment rows.',
});

h1('6. Hire from interviewed candidate');

endpoint('POST', '/api/applications/:id/select', {
  auth: AUTH,
  roles: ROLES_HR,
  headers: HDR_AUTH,
  params: ':id = Application MongoId',
  response: `{
  "application": { /* status: Selected, ... */ },
  "employee": { /* normalized Employee object */ },
  "user": { /* safe User object */ }
}`,
  notes:
    'Application must be status Interview. Creates/updates Employee + sets User.role=employee. Use returned employee to open Add Employee / profile screens.',
});

h1('7. Common HTTP status codes');
body(
  '200 — Success (GET/PATCH/POST activate|deactivate|DELETE)\n' +
    '201 — Created (POST employee | document | asset)\n' +
    '400 — Validation / business rule (e.g. password on PATCH, wrong application status)\n' +
    '401 — Missing / invalid JWT\n' +
    '403 — Role not hr/admin, or account suspended\n' +
    '404 — Employee / application not found\n' +
    '409 — Email or empId already in use'
);

h1('8. Example cURL');
mono(`# Login
curl -X POST http://localhost:5000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"hr@brilliance.com","password":"secret12","role":"hr"}'

# List employees
curl http://localhost:5000/api/hr/employees?search=Ali&page=1 \\
  -H "Authorization: Bearer <token>"

# Create employee (required fields only)
curl -X POST http://localhost:5000/api/hr/employees \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Ali Khan","email":"ali@brilliance.com","phone":"03001234567","password":"TempPass123","designation":"Software Engineer","dateOfJoining":"2026-08-01","salary":85000}'

# Upload document
curl -X POST http://localhost:5000/api/hr/employees/EMP001/documents \\
  -H "Authorization: Bearer <token>" \\
  -F "file=@./cnic.pdf" \\
  -F "type=cnic" \\
  -F "name=CNIC Front"

# Add asset
curl -X POST http://localhost:5000/api/hr/employees/EMP001/assets \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Laptop","tag":"LT-01","status":"Assigned"}'

# Select interviewed candidate
curl -X POST http://localhost:5000/api/applications/<appId>/select \\
  -H "Authorization: Bearer <token>"`);

doc.moveDown(1);
doc
  .fontSize(9)
  .fillColor('#718096')
  .text(
    'Brilliance EMS — HR Employee Module API · React Native contracts: hrPortalService.js, hrManagerService.js, applicationService.js',
    { align: 'center', width: pageWidth }
  );

doc.end();
console.log(`Wrote ${outPath}`);
