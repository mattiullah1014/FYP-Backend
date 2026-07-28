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
| `/api/recruitment` | Jobs, applications, interviews, hire |
| `/api/communication` | Announcements & messages |
| `/api/reports` | Role dashboards |
| `/api/admin` | Users, settings, audit logs |

## Files / Cloudinary

Uploads use Multer + a **Cloudinary stub** (placeholder URLs).  
When ready, set Cloudinary env vars and replace `src/config/cloudinary.stub.js` with the real SDK.

## Notes

- Soft-delete is used for employees (`isDeleted`)
- AI / bonus features from the FYP doc are intentionally not included
- Notifications are logged to the console until email/SMS is wired
