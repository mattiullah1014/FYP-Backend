# Brilliance EMS Backend

Express + MongoDB (Mongoose) API for the Brilliance Employee Management System.

## Requirements

- Node.js 22+
- MongoDB Atlas or local MongoDB

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and set:

- `MONGODB_URI` — your Mongo connection string
- `JWT_SECRET` — a long random secret

## Run

```bash
# development (nodemon auto-restart)
npm run dev

# production
npm start
```

Health check: `GET http://localhost:5000/health`

## Auth

Most routes need:

```
Authorization: Bearer <token>
```

Roles: `candidate`, `employee`, `manager`, `hr`, `admin`

**Public signup** (`POST /api/auth/register`) allows only `candidate` and `admin`.  
`employee` / `manager` / `hr` are created by Admin/HR (`POST /api/employees`) or via **Select hire** on an application.

### Quick auth flow (role required — matches RN RoleSelection)

1. `POST /api/auth/register` — `{ name, email, password, role }` — creates account under selected role
2. `POST /api/auth/login` — `{ email, password, role }` — JWT if role matches; if 2FA on → `{ requires2FA: true }` + email OTP
3. `POST /api/auth/verify-2fa` — `{ email, role, otp }` — completes login when 2FA is enabled
4. Forgot: `forgot-password` → `verify-otp` → `reset-password` (OTP emailed; each needs `email` + `role`)
5. HR/Admin can also create staff via `POST /api/employees`

Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` in `.env` to deliver emails (Gmail App Password recommended). Without SMTP, OTPs still log to the server console.

## Main API prefixes

| Prefix | Module |
|--------|--------|
| `/api/auth` | Register, login, 2FA OTP, password reset emails |
| `/api/employees` | Profiles, documents, team |
| `/api/departments` | Departments & branches |
| `/api/attendance` | Clock in/out, shifts, holidays |
| `/api/leaves` | Policies, balances, requests |
| `/api/payroll` | Structures, payroll run, payslips |
| `/api/performance` | Goals & reviews |
| `/api/training` | Courses & enrollments |
| `/api/expenses` | Expense claims |
| `/api/assets` | Inventory & assignments |
| `/api/jobs` | Recruitment jobs (Active/Closed) |
| `/api/applications` | Apply, pipeline, interview, select/hire |
| `/api/recruitment` | Legacy shim → same Job/Application flows |
| `/api/manager` | Manager portal (team, tasks, approvals, reports) |
| `/api/employee` | Employee portal (managers, leave, OT, expenses, tasks) |
| `/api/hr` | HR manager CRUD, assignments, permissions, alerts |
| `/api/communication` | Announcements & messages |
| `/api/reports` | Role dashboards |
| `/api/admin` | Users, settings, audit logs |

## Recruitment module (Brilliance Base)

Statuses (exact): `Applied` → `Review` → `Shortlisted` → `Interview` → `Selected`  
Also: `Rejected`, `Withdrawn`. Job status: `Active` | `Closed`.

| Method | Path | Who |
|--------|------|-----|
| POST | `/api/jobs` | hr, admin |
| GET | `/api/jobs` | candidate, manager, hr, admin |
| GET | `/api/jobs/:id` | authenticated (staff/candidate) |
| PATCH | `/api/jobs/:id` | hr, admin |
| PATCH | `/api/jobs/:id/close` | hr, admin |
| POST | `/api/applications` | candidate (multipart `resume`) |
| GET | `/api/applications/me` | candidate |
| GET | `/api/applications` | hr, admin (`jobId`, `status`, `search`) |
| GET | `/api/applications/shortlisted` | hr, admin |
| GET | `/api/applications/job/:jobId` | hr, admin |
| PATCH | `/api/applications/:id/review` | hr, admin |
| PATCH | `/api/applications/:id/shortlist` | hr, admin |
| PATCH | `/api/applications/:id/reject` | hr, admin |
| POST | `/api/applications/:id/schedule-interview` | hr, admin (`Onsite`+location \| `Online`+meetingLink) |
| POST | `/api/applications/:id/reschedule` | candidate (status Interview) |
| POST | `/api/applications/:id/withdraw` | candidate |
| POST | `/api/applications/:id/select` | hr, admin → role `employee` + `Employee` record (`EMP001`) |

Resume files: `uploads/resumes/` served at `/uploads/resumes/...`

Seed sample jobs:

```bash
node scripts/seed-jobs.mjs
```

## Files / Cloudinary

Uploads use Multer. Recruitment resumes are stored on disk under `uploads/`.  
Other modules still use a **Cloudinary stub** (placeholder URLs).  
When ready, set Cloudinary env vars and replace `src/config/cloudinary.stub.js` with the real SDK.

## Notes

- Soft-delete is used for employees (`isDeleted`)
- AI / bonus features from the FYP doc are intentionally not included
- Notifications are logged to the console until email/SMS is wired
- Duplicate apply blocked unless previous application was `Withdrawn`
