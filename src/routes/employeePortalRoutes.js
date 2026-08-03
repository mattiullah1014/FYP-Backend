import express from 'express';
import { body } from 'express-validator';
import * as employeePortalController from '../controllers/employeePortalController.js';
import * as employeeProfileController from '../controllers/employeeProfileController.js';
import * as employeeDocumentsController from '../controllers/employeeDocumentsController.js';
import * as employeeAssetsController from '../controllers/employeeAssetsController.js';
import * as companyPolicyController from '../controllers/companyPolicyController.js';
import * as loanAdvanceController from '../controllers/loanAdvanceController.js';
import * as attendanceRequestController from '../controllers/attendanceRequestController.js';
import * as attendanceDynamic from '../controllers/attendanceDynamicController.js';
import * as payrollController from '../controllers/payrollController.js';
import { protect, authorize } from '../middleware/auth.js';
import upload, { avatarUpload } from '../middleware/upload.js';
import validate from '../middleware/validate.js';
import { ROLES, STAFF_ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(protect);

/* ── Self profile (employee | manager | hr | admin) ───────── */
router.get(
  '/profile',
  authorize(...STAFF_ROLES),
  employeeProfileController.getMyProfile
);
router.put(
  '/profile/avatar',
  authorize(...STAFF_ROLES),
  avatarUpload.single('avatar'),
  employeeProfileController.uploadAvatar
);
router.delete(
  '/profile/avatar',
  authorize(...STAFF_ROLES),
  employeeProfileController.removeAvatar
);
router.patch(
  '/profile',
  authorize(...STAFF_ROLES),
  [
    body('fullName').optional({ values: 'falsy' }).trim().notEmpty(),
    body('name').optional({ values: 'falsy' }).trim().notEmpty(),
    body('phone').optional({ values: 'falsy' }).trim().notEmpty(),
    body('dateOfBirth')
      .optional({ values: 'falsy' })
      .custom((v) => {
        if (Number.isNaN(new Date(v).getTime())) {
          throw new Error('dateOfBirth must be a valid date');
        }
        return true;
      }),
    body('dob')
      .optional({ values: 'falsy' })
      .custom((v) => {
        if (Number.isNaN(new Date(v).getTime())) {
          throw new Error('dob must be a valid date');
        }
        return true;
      }),
    body('gender')
      .optional({ values: 'falsy' })
      .isIn(['Male', 'Female', 'Other', 'Prefer not to say'])
      .withMessage(
        'gender must be Male, Female, Other, or Prefer not to say'
      ),
    body('cnic')
      .optional({ values: 'falsy' })
      .custom((v) => {
        const s = String(v).trim();
        if (!/^\d{5}-\d{7}-\d$/.test(s) && !/^\d{13}$/.test(s)) {
          throw new Error('cnic must match XXXXX-XXXXXXX-X or 13 digits');
        }
        return true;
      }),
    body('address').optional().isObject().withMessage('address must be an object'),
  ],
  validate,
  employeeProfileController.updateMyProfile
);

/* ── Self documents — SAME Employee.documents as HR ───────── */
router.get(
  '/documents',
  authorize(...STAFF_ROLES),
  employeeDocumentsController.listMyDocuments
);
router.post(
  '/documents',
  authorize(...STAFF_ROLES),
  upload.single('file'),
  employeeDocumentsController.uploadMyDocument
);
router.delete(
  '/documents/:docId',
  authorize(...STAFF_ROLES),
  employeeDocumentsController.deleteMyDocument
);

/* ── Self assets — SAME Employee.assets as HR (read-only) ─── */
router.get(
  '/assets',
  authorize(...STAFF_ROLES),
  employeeAssetsController.listMyAssets
);

/* ── Company Policies (read-only) ─────────────────────────── */
router.get(
  '/company-policies',
  authorize(...STAFF_ROLES),
  companyPolicyController.listPolicies
);

/* ── Loan & Advance (staff self) ──────────────────────────── */
router.post(
  '/loans',
  authorize(...STAFF_ROLES),
  [
    body('amount').notEmpty().withMessage('amount is required'),
    body('reason').trim().notEmpty().withMessage('reason is required'),
    body('installments').optional({ values: 'falsy' }),
  ],
  validate,
  loanAdvanceController.createRequest('loan')
);
router.get(
  '/loans',
  authorize(...STAFF_ROLES),
  loanAdvanceController.listMine('loan')
);

router.post(
  '/advances',
  authorize(...STAFF_ROLES),
  [
    body('amount').notEmpty().withMessage('amount is required'),
    body('reason').trim().notEmpty().withMessage('reason is required'),
  ],
  validate,
  loanAdvanceController.createRequest('advance')
);
router.get(
  '/advances',
  authorize(...STAFF_ROLES),
  loanAdvanceController.listMine('advance')
);

/* ── Attendance clock + rules (staff self) ────────────────── */
router.get(
  '/attendance/rules',
  authorize(...STAFF_ROLES),
  attendanceDynamic.getRules
);
router.post(
  '/attendance/clock-in',
  authorize(...STAFF_ROLES),
  attendanceDynamic.clockIn
);
router.post(
  '/attendance/clock-out',
  authorize(...STAFF_ROLES),
  attendanceDynamic.clockOut
);
router.get(
  '/attendance',
  authorize(...STAFF_ROLES),
  attendanceDynamic.listMyAttendance
);

/* ── Attendance Correction & WFH ──────────────────────────── */
router.post(
  '/attendance/corrections',
  authorize(...STAFF_ROLES),
  [
    body('date').notEmpty().withMessage('date is required'),
    body('reason').trim().notEmpty().withMessage('reason is required'),
  ],
  validate,
  attendanceRequestController.createCorrection
);
router.get(
  '/attendance/corrections',
  authorize(...STAFF_ROLES),
  attendanceRequestController.listMyCorrections
);

router.post(
  '/attendance/wfh',
  authorize(...STAFF_ROLES),
  [
    body('date').notEmpty().withMessage('date is required'),
    body('reason').trim().notEmpty().withMessage('reason is required'),
  ],
  validate,
  attendanceRequestController.createWfh
);
router.get(
  '/attendance/wfh',
  authorize(...STAFF_ROLES),
  attendanceRequestController.listMyWfh
);

/* Existing profile-completion stays available to staff for self */
router.get(
  '/profile-completion',
  authorize(...STAFF_ROLES),
  employeePortalController.profileCompletion
);
router.patch(
  '/profile-completion/:section',
  authorize(...STAFF_ROLES),
  employeePortalController.updateProfileSection
);

/* ── Employee portal (employee role only) ─────────────────── */
router.use(authorize(ROLES.EMPLOYEE));

router.get('/dashboard', employeePortalController.dashboard);
router.get('/managers', employeePortalController.listManagers);

router.get('/tasks', employeePortalController.listTasks);
router.patch(
  '/tasks/:id/status',
  [body('status').isIn(['pending', 'in_progress', 'completed'])],
  validate,
  employeePortalController.updateTaskStatus
);

router.post(
  '/leave',
  [
    body('reason').trim().notEmpty().withMessage('reason is required'),
    body('leaveType').optional({ values: 'falsy' }).trim().isString(),
    body('type').optional({ values: 'falsy' }).trim().isString(),
    body('startDate').optional({ values: 'falsy' }),
    body('endDate').optional({ values: 'falsy' }),
    body('from').optional({ values: 'falsy' }),
    body('to').optional({ values: 'falsy' }),
  ],
  validate,
  employeePortalController.createLeave
);
router.get('/leave', employeePortalController.listLeave);

router.post(
  '/overtime',
  [
    body('managerId').notEmpty(),
    body('date').notEmpty(),
    body('hours').notEmpty(),
    body('reason').notEmpty(),
  ],
  validate,
  employeePortalController.createOvertime
);
router.get('/overtime', employeePortalController.listOvertime);

router.post(
  '/expenses',
  upload.single('receipt'),
  [
    body('title').notEmpty().withMessage('title is required'),
    body('amount').notEmpty().withMessage('amount is required'),
    body('date').notEmpty().withMessage('date is required'),
  ],
  validate,
  employeePortalController.createExpense
);
router.get('/expenses', employeePortalController.listExpenses);

/* ── Payroll / Payslips (self) ────────────────────────────── */
router.get('/payroll/payslips', payrollController.myPayslips);
router.get('/payroll/payslips/:id', payrollController.getPayslip);
router.get('/payroll/payslips/:id/pdf', payrollController.downloadPayslipPdf);
router.get('/payroll/summary', payrollController.myPayrollSummary);

export default router;
