import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(
  __dirname,
  '..',
  'Brilliance_Recruitment_API_Documentation.pdf'
);

const doc = new PDFDocument({
  margin: 50,
  size: 'A4',
  info: {
    Title: 'Brilliance Base — Recruitment API Documentation',
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
  doc.fontSize(16).fillColor('#1a365d').text(text);
  doc.moveDown(0.25);
  doc
    .moveTo(50, doc.y)
    .lineTo(50 + pageWidth, doc.y)
    .strokeColor('#2b6cb0')
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor('#000');
}

function h2(text) {
  ensureSpace(28);
  doc.moveDown(0.35);
  doc.fontSize(12).fillColor('#2c5282').text(text);
  doc.moveDown(0.2);
  doc.fillColor('#000');
}

function body(text) {
  ensureSpace(18);
  doc.fontSize(10).fillColor('#222').text(text, { width: pageWidth, lineGap: 2 });
  doc.moveDown(0.2);
}

function mono(text) {
  ensureSpace(16);
  doc.font('Courier').fontSize(8.5).fillColor('#111').text(text, {
    width: pageWidth,
  });
  doc.font('Helvetica');
}

function endpoint(method, pathStr, info) {
  ensureSpace(120);
  doc.moveDown(0.3);

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
    .text(pathStr);
  doc.moveDown(0.12);

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
  if (info.response) {
    doc.fontSize(9).fillColor('#2d3748').text('Success response (shape):');
    mono(info.response);
  }
  if (info.notes) {
    doc.fontSize(9).fillColor('#718096').text(`Note: ${info.notes}`);
  }

  doc.moveDown(0.15);
  doc
    .moveTo(50, doc.y)
    .lineTo(50 + pageWidth, doc.y)
    .strokeColor('#e2e8f0')
    .lineWidth(0.5)
    .stroke();
}

const AUTH = 'Bearer JWT required';
const HDR_JSON =
  'Content-Type: application/json | Authorization: Bearer <token>';
const HDR_MULTI =
  'Content-Type: multipart/form-data | Authorization: Bearer <token>';
const HDR_AUTH = 'Authorization: Bearer <token>';

// ========== COVER ==========
doc
  .fontSize(22)
  .fillColor('#1a365d')
  .text('Brilliance Base', { align: 'center' });
doc.moveDown(0.25);
doc
  .fontSize(15)
  .fillColor('#2b6cb0')
  .text('Recruitment Module — API Documentation', { align: 'center' });
doc.moveDown(0.8);
doc
  .fontSize(10)
  .fillColor('#444')
  .text('Base URL: http://localhost:5000  (or your ngrok / tunnel URL)', {
    align: 'center',
  });
doc.text('Prefixes: /api/jobs  ·  /api/applications', { align: 'center' });
doc.moveDown(0.6);
body(
  'Auth header (all endpoints below):\n  Authorization: Bearer <jwt_token>\n\nRoles: candidate | employee | manager | hr | admin\nSuccess: { success: true, message, data }\nError:   { success: false, message, errors? }\n\nApplication status (exact strings):\n  Applied → Review → Shortlisted → Interview → Selected\n  Also: Rejected | Withdrawn\n\nJob status: Active | Closed\n\nPublic signup allows only candidate | admin.\nHR / employee / manager accounts are created by Admin/HR or via Select hire.'
);

h1('1. Business flow (frontend match)');
body(
  '1. HR posts a Job (Active) → appears in Candidate jobs list\n' +
    '2. Candidate applies → Application status = Applied\n' +
    '3. HR marks Review / Shortlisted / Rejected\n' +
    '4. Shortlisted list → HR schedules interview (Onsite | Online)\n' +
    '5. Candidate may request reschedule (note) or withdraw\n' +
    '6. After interview HR Select → User.role = employee + Employee record (EMP001)\n' +
    '   or Reject → Rejected'
);

h1('2. Jobs API — /api/jobs');

endpoint('POST', '/api/jobs', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "title": "Junior Frontend Developer",          // required
  "company": "Brilliance Base",                  // optional, default Brilliance Base
  "department": "Engineering",                   // required enum:
    // Engineering | Developer | Manager | Design | Product | HR | Finance | Marketing
  "location": "Lahore, PK",                      // required
  "types": ["Full-time"],                        // required ≥1:
    // Full-time | Part-time | Contract | Internship
  "salaryMin": 60000,                            // optional number
  "salaryMax": 90000,                            // optional number
  "currency": "PKR",                             // optional, default USD
  "description": "At least 30 characters...",    // required min 30
  "requirements": [                              // required string[] (or newline string)
    "1+ year React Native",
    "REST APIs"
  ],
  "skills": ["React Native", "JS"],              // optional string[]
  "closesAt": "2026-09-30T00:00:00.000Z",        // optional ISO date
  "branch": "Lahore HQ"                          // optional string
}`,
  response: `{ "success": true, "message": "Job posted", "data": { "job": { ...enriched } } }`,
  notes:
    'Enriched job includes type (types joined), salaryDisplay, applicantsCount, postedAt.',
});

endpoint('GET', '/api/jobs', {
  auth: AUTH,
  roles: 'candidate, manager, hr, admin',
  headers: HDR_AUTH,
  query:
    'status? (candidates default Active) | search? | department? | page? | limit?',
  response: `{ "success": true, "data": { "jobs": [...], "pagination": { page, limit, total, pages } } }`,
});

endpoint('GET', '/api/jobs/:id', {
  auth: AUTH,
  roles: 'candidate, employee, manager, hr, admin',
  headers: HDR_AUTH,
  response: `{ "success": true, "data": { "job": { ... } } }`,
});

endpoint('PATCH', '/api/jobs/:id', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "title": "...",
  "department": "Design",
  "location": "...",
  "types": ["Full-time", "Contract"],
  "requirements": ["..."],
  "description": "...",
  "salaryMin": 70000,
  "salaryMax": 100000,
  "currency": "PKR",
  "status": "Active",   // or Closed
  "closesAt": "...",
  "branch": "..."
}`,
  notes: 'Send only fields to update.',
});

endpoint('PATCH', '/api/jobs/:id/close', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  body: '(none)',
  notes: 'Sets job.status = Closed',
  response: `{ "success": true, "message": "Job closed", "data": { "job": { ... } } }`,
});

h1('3. Applications API — Candidate');

endpoint('POST', '/api/applications', {
  auth: AUTH,
  roles: 'candidate',
  headers: HDR_MULTI,
  formData: `jobId          = <Job ObjectId>          (required)
phone         = 03001234567
experience    = 2 years
education     = BS Computer Science
expectedSalary= 80000
linkedin      = https://linkedin.com/in/...   (optional)
coverLetter   = min 20 characters             (required)
resume        = file (pdf | doc | docx)       (optional if profile resume exists)`,
  response: `{ "success": true, "message": "Application submitted", "data": { "application": { status: "Applied", ... } } }`,
  notes:
    'candidateName / candidateEmail auto-filled from User. Duplicate apply blocked unless previous was Withdrawn. Resume saved under /uploads/resumes/...',
});

endpoint('GET', '/api/applications/me', {
  auth: AUTH,
  roles: 'candidate',
  headers: HDR_AUTH,
  response: `{ "success": true, "data": { "applications": [ { job: { title, company, ... }, status, interview?, ... } ] } }`,
});

endpoint('GET', '/api/applications/:id', {
  auth: AUTH,
  roles: 'candidate (own only), hr, admin',
  headers: HDR_AUTH,
  notes: 'Candidate may only fetch own application.',
});

endpoint('POST', '/api/applications/:id/reschedule', {
  auth: AUTH,
  roles: 'candidate (own)',
  headers: HDR_JSON,
  body: `{
  "note": "Please move to next week after 3 PM"
}`,
  notes: 'Allowed only when status === Interview. Sets rescheduleRequest.',
});

endpoint('POST', '/api/applications/:id/withdraw', {
  auth: AUTH,
  roles: 'candidate (own)',
  headers: HDR_AUTH,
  body: '(none)',
  notes: 'status → Withdrawn. Blocked if already Selected.',
});

h1('4. Applications API — HR / Admin pipeline');

endpoint('GET', '/api/applications', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  query: 'jobId? | status? | search? (name/email) | page? | limit?',
  response: `{ "success": true, "data": { "applications": [...], "pagination": {...} } }`,
});

endpoint('GET', '/api/applications/shortlisted', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  notes: 'Returns status in [Shortlisted, Interview]',
});

endpoint('GET', '/api/applications/job/:jobId', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  notes: 'All applications for one job (pipeline list).',
});

endpoint('PATCH', '/api/applications/:id/review', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "note": "Looks promising"   // optional → reviewNote
}`,
  notes: 'status → Review. Allowed only from Applied.',
});

endpoint('PATCH', '/api/applications/:id/shortlist', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "note": "Strong portfolio"  // optional
}`,
  notes: 'status → Shortlisted. Allowed from Applied or Review.',
});

endpoint('PATCH', '/api/applications/:id/reject', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `{
  "note": "Not a fit for this role"  // optional
}`,
  notes: 'status → Rejected. Not allowed if Selected or Withdrawn.',
});

endpoint('POST', '/api/applications/:id/schedule-interview', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_JSON,
  body: `// Online
{
  "mode": "Online",
  "datetime": "2026-08-15T10:00:00.000Z",
  "meetingLink": "https://meet.example.com/abc",
  "note": "Be ready 5 mins early"              // optional
}

// Onsite
{
  "mode": "Onsite",
  "datetime": "2026-08-15T10:00:00.000Z",
  "location": "Brilliance HQ, Lahore — Floor 3",
  "note": "Bring CNIC"                         // optional
}`,
  response: `application.status = "Interview"
application.interview.message auto-built, e.g.:
  "Your interview is scheduled Online on Aug 15, 2026, 3:00 PM. Meeting link: https://..."`,
  notes:
    'Allowed from Shortlisted or Interview (reschedule). Clears rescheduleRequest. Onsite requires location; Online requires meetingLink.',
});

endpoint('POST', '/api/applications/:id/select', {
  auth: AUTH,
  roles: 'hr, admin',
  headers: HDR_AUTH,
  body: '(none)',
  response: `{
  "success": true,
  "message": "Candidate selected and hired",
  "data": {
    "application": { "status": "Selected", ... },
    "employee": { "empId": "EMP001", "designation": "<job.title>", ... },
    "user": { "role": "employee", ... }
  }
}`,
  notes:
    'Allowed only when status === Interview. Transaction: Application Selected + User.role=employee + create Employee (EMP001 style).',
});

h1('5. Resume / static files');
body(
  'Uploaded resumes are stored on disk under uploads/resumes/ and served as:\n' +
    '  GET http://localhost:5000/uploads/resumes/<filename>\n' +
    'Allowed MIME: application/pdf, application/msword, ' +
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document\n' +
    'Max size: 10 MB (multer).'
);

h1('6. Related auth (recruitment context)');
endpoint('POST', '/api/auth/register', {
  auth: 'No auth',
  headers: 'Content-Type: application/json',
  body: `{
  "name": "Ali Khan",
  "email": "ali@example.com",
  "password": "secret12",
  "phone": "0300...",
  "role": "candidate"   // ONLY candidate | admin for public signup
}`,
  notes: 'employee | manager | hr → 403 from public register.',
});

endpoint('POST', '/api/auth/login', {
  auth: 'No auth',
  headers: 'Content-Type: application/json',
  body: `{
  "email": "ali@example.com",
  "password": "secret12",
  "role": "candidate"   // must match account role
}`,
  response: `{ "success": true, "data": { "user": {...}, "token": "<jwt>" } }`,
});

h1('7. Quick curl examples');
mono(`# Login (HR)
curl -X POST http://localhost:5000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d "{\\"email\\":\\"hr@example.com\\",\\"password\\":\\"...\\",\\"role\\":\\"hr\\"}"

# List Active jobs (Candidate)
curl http://localhost:5000/api/jobs \\
  -H "Authorization: Bearer $CAND_TOKEN"

# Apply with resume
curl -X POST http://localhost:5000/api/applications \\
  -H "Authorization: Bearer $CAND_TOKEN" \\
  -F "jobId=JOB_ID" \\
  -F "coverLetter=I am excited to apply for this role at Brilliance Base." \\
  -F "phone=03001234567" \\
  -F "experience=2 years" \\
  -F "education=BS CS" \\
  -F "expectedSalary=80000" \\
  -F "resume=@./cv.pdf"

# Schedule Online interview
curl -X POST http://localhost:5000/api/applications/APP_ID/schedule-interview \\
  -H "Authorization: Bearer $HR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d "{\\"mode\\":\\"Online\\",\\"datetime\\":\\"2026-08-15T10:00:00.000Z\\",\\"meetingLink\\":\\"https://meet.example.com/x\\"}"

# Select / hire
curl -X POST http://localhost:5000/api/applications/APP_ID/select \\
  -H "Authorization: Bearer $HR_TOKEN"`);

h1('8. Seed sample jobs');
body('Run:  npm run seed:jobs\nCreates sample Active jobs for UI testing.');

doc.moveDown(1);
doc
  .fontSize(9)
  .fillColor('#718096')
  .text(
    'Generated for Brilliance Base FYP — Recruitment module. Prefer /api/jobs and /api/applications. Legacy /api/recruitment is a shim.',
    { align: 'center' }
  );

doc.end();

console.log(`Wrote ${outPath}`);
