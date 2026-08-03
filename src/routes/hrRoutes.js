import express from 'express';
import { body } from 'express-validator';
import * as hr from '../controllers/hrManagerController.js';
import * as hrEmp from '../controllers/hrEmployeeController.js';
import * as companyPolicy from '../controllers/companyPolicyController.js';
import * as loanAdvance from '../controllers/loanAdvanceController.js';
import * as attendanceRequest from '../controllers/attendanceRequestController.js';
import * as expenseController from '../controllers/expenseController.js';
import * as attendanceDynamic from '../controllers/attendanceDynamicController.js';
import * as payrollController from '../controllers/payrollController.js';
import { protect, authorize } from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import upload from '../middleware/upload.js';
import { HR_ADMIN } from '../constants/roles.js';

const router = express.Router();

router.use(protect);
router.use(authorize(...HR_ADMIN));

router.get('/dashboard', hr.hrDashboard);
router.get('/profile-alerts', hr.profileAlerts);

router.get('/managers', hr.listManagers);
router.post(
  '/managers',
  [
    body('name').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
  ],
  validate,
  hr.createManager
);
router.get('/managers/:id', hr.getManager);
router.patch('/managers/:id', hr.updateManager);
router.post('/managers/:id/transfer', hr.transferManager);
router.post('/managers/:id/deactivate', hr.deactivateManager);
router.get('/managers/:id/activity', hr.managerActivity);
router.get('/managers/:id/report', hr.managerReport);
router.get('/managers/:id/permissions', hr.getPermissions);
router.put('/managers/:id/permissions', hr.putPermissions);

router.post(
  '/assignments',
  [body('managerId').notEmpty(), body('employeeId').notEmpty()],
  validate,
  hr.createAssignment
);
router.patch('/assignments/:id', hr.updateAssignment);
router.delete('/assignments/:id', hr.deleteAssignment);

/* ── HR Employees ─────────────────────────────────────────── */
router.get('/employees', hrEmp.listEmployees);
router.post(
  '/employees',
  [
    body('name').trim().notEmpty().withMessage('name is required'),
    body('email').isEmail().withMessage('valid email is required'),
    body('phone').trim().notEmpty().withMessage('phone is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('password must be at least 8 characters'),
    body('designation')
      .trim()
      .notEmpty()
      .withMessage('designation is required'),
    body('dateOfJoining')
      .notEmpty()
      .withMessage('dateOfJoining is required')
      .bail()
      .custom((value) => {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) {
          throw new Error('dateOfJoining must be a valid date');
        }
        return true;
      }),
    body('salary')
      .notEmpty()
      .withMessage('salary is required')
      .bail()
      .custom((value) => {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error('salary must be a number greater than 0');
        }
        return true;
      }),
    body('empId').optional({ values: 'falsy' }).trim().isString(),
    body('role').optional({ values: 'falsy' }).trim().isString(),
    body('department').optional({ values: 'falsy' }).trim().isString(),
    body('branch').optional({ values: 'falsy' }).trim().isString(),
    body('manager').optional({ values: 'falsy' }),
    body('applicationId').optional({ values: 'falsy' }).isString(),
  ],
  validate,
  hrEmp.createEmployee
);

router.get('/employees/:id/documents', hrEmp.listDocuments);
router.post(
  '/employees/:id/documents',
  upload.single('file'),
  hrEmp.uploadDocument
);
router.delete(
  '/employees/:id/documents/:docId',
  hrEmp.deleteDocument
);
router.get('/employees/:id/assets', hrEmp.listAssets);
router.post('/employees/:id/assets', hrEmp.addAsset);
router.delete('/employees/:id/assets/:assetId', hrEmp.deleteAsset);
router.get('/employees/:id/managers', hrEmp.employeeManagers);
router.post('/employees/:id/activate', hrEmp.activateEmployee);
router.post('/employees/:id/deactivate', hrEmp.deactivateEmployee);

router.get('/employees/:id', hrEmp.getEmployee);
router.patch('/employees/:id', hrEmp.updateEmployee);
router.delete('/employees/:id', hrEmp.deleteEmployee);

/* ── Company Policies ─────────────────────────────────────── */
router.get('/company-policies', companyPolicy.listPolicies);
router.post(
  '/company-policies',
  [
    body('title').trim().notEmpty().withMessage('title is required'),
    body('body').trim().notEmpty().withMessage('body is required'),
    body('category').optional({ values: 'falsy' }).trim().isString(),
  ],
  validate,
  companyPolicy.createPolicy
);
router.patch(
  '/company-policies/:id',
  [
    body('title').optional({ values: 'falsy' }).trim().notEmpty(),
    body('body').optional({ values: 'falsy' }).trim().notEmpty(),
    body('category').optional({ values: 'falsy' }).trim().isString(),
  ],
  validate,
  companyPolicy.updatePolicy
);
router.delete('/company-policies/:id', companyPolicy.deletePolicy);

// Alias: old stub path → same handlers
router.get('/company-rules', companyPolicy.listPolicies);
router.post('/company-rules', companyPolicy.createPolicy);
router.patch('/company-rules/:id', companyPolicy.updatePolicy);
router.delete('/company-rules/:id', companyPolicy.deletePolicy);

/* ── Loan & Advance approvals ─────────────────────────────── */
router.get('/loans', loanAdvance.listForHr('loan'));
router.patch(
  '/loans/:id/review',
  [
    body('decision')
      .optional()
      .isIn(['approved', 'rejected'])
      .withMessage('decision must be approved or rejected'),
    body('status')
      .optional()
      .isIn(['approved', 'rejected'])
      .withMessage('status must be approved or rejected'),
    body('remarks').optional({ values: 'falsy' }).trim().isString(),
    body('note').optional({ values: 'falsy' }).trim().isString(),
  ],
  validate,
  loanAdvance.reviewRequest('loan')
);

router.get('/advances', loanAdvance.listForHr('advance'));
router.patch(
  '/advances/:id/review',
  [
    body('decision')
      .optional()
      .isIn(['approved', 'rejected'])
      .withMessage('decision must be approved or rejected'),
    body('status')
      .optional()
      .isIn(['approved', 'rejected'])
      .withMessage('status must be approved or rejected'),
    body('remarks').optional({ values: 'falsy' }).trim().isString(),
    body('note').optional({ values: 'falsy' }).trim().isString(),
  ],
  validate,
  loanAdvance.reviewRequest('advance')
);

/* ── Attendance Correction & WFH approvals ────────────────── */
router.get('/attendance/corrections', attendanceRequest.listCorrectionsHr);
router.patch(
  '/attendance/corrections/:id',
  [
    body('decision').optional().isIn(['approved', 'rejected']),
    body('status').optional().isIn(['approved', 'rejected']),
    body('remarks').optional({ values: 'falsy' }).trim().isString(),
    body('note').optional({ values: 'falsy' }).trim().isString(),
  ],
  validate,
  attendanceRequest.reviewCorrectionHr
);

router.get('/attendance/wfh', attendanceRequest.listWfhHr);
router.patch(
  '/attendance/wfh/:id',
  [
    body('decision').optional().isIn(['approved', 'rejected']),
    body('status').optional().isIn(['approved', 'rejected']),
    body('remarks').optional({ values: 'falsy' }).trim().isString(),
    body('note').optional({ values: 'falsy' }).trim().isString(),
  ],
  validate,
  attendanceRequest.reviewWfhHr
);

/* ── Attendance rules + half-day / OT approvals ───────────── */
router.get('/attendance/rules', attendanceDynamic.getRules);
router.patch(
  '/attendance/rules',
  [
    body('workStart').optional({ values: 'falsy' }).trim().isString(),
    body('workEnd').optional({ values: 'falsy' }).trim().isString(),
    body('graceMinutes').optional({ values: 'falsy' }),
    body('halfDayAfter').optional({ values: 'falsy' }).trim().isString(),
    body('overtimeGraceMinutes').optional({ values: 'falsy' }),
    body('overtimeMinMinutes').optional({ values: 'falsy' }),
    body('weekendOffDays').optional(),
    body('allowOffDayClockIn').optional(),
  ],
  validate,
  attendanceDynamic.updateRules
);
router.get('/attendance', attendanceDynamic.listHrRoster);
router.get(
  '/attendance/employee/:id',
  attendanceDynamic.listHrEmployeeAttendance
);
router.get('/attendance/holidays', attendanceDynamic.listHolidaysHr);
router.post(
  '/attendance/holidays',
  [
    body('name').trim().notEmpty(),
    body('date').notEmpty(),
    body('type').optional().isIn(['public', 'company']),
  ],
  validate,
  attendanceDynamic.createHolidayHr
);
router.delete(
  '/attendance/holidays/:id',
  attendanceDynamic.deleteHolidayHr
);
router.get('/attendance/half-day', attendanceDynamic.listHalfDayHr);
router.patch(
  '/attendance/half-day/:id',
  [
    body('decision').optional().isIn(['approved', 'rejected']),
    body('status').optional().isIn(['approved', 'rejected']),
  ],
  validate,
  attendanceDynamic.reviewHalfDayHr
);
router.get('/attendance/overtime', attendanceDynamic.listOvertimeHr);
router.patch(
  '/attendance/overtime/:id',
  [
    body('decision').optional().isIn(['approved', 'rejected']),
    body('status').optional().isIn(['approved', 'rejected']),
  ],
  validate,
  attendanceDynamic.reviewOvertimeHr
);

/* ── Expense claims (HR only) ─────────────────────────────── */
router.get('/expenses', expenseController.listClaims);
router.patch(
  '/expenses/:id',
  [
    body('decision').optional().isIn(['approved', 'rejected']),
    body('status').optional().isIn(['approved', 'rejected']),
    body('remarks').optional({ values: 'falsy' }).trim().isString(),
    body('note').optional({ values: 'falsy' }).trim().isString(),
  ],
  validate,
  expenseController.reviewClaim
);
router.patch(
  '/expenses/:id/review',
  [
    body('decision').optional().isIn(['approved', 'rejected']),
    body('status').optional().isIn(['approved', 'rejected']),
    body('remarks').optional({ values: 'falsy' }).trim().isString(),
    body('note').optional({ values: 'falsy' }).trim().isString(),
  ],
  validate,
  expenseController.reviewClaim
);

/* ── Dynamic Payroll ──────────────────────────────────────── */
router.post('/payroll/generate', payrollController.runPayroll);
router.get('/payroll/runs', payrollController.listPayrollRuns);
router.get('/payroll/payslips', payrollController.listPayslipsHr);
router.get('/payroll/payslips/:id', payrollController.getPayslip);
router.get('/payroll/payslips/:id/pdf', payrollController.downloadPayslipPdf);
router.get(
  '/payroll/employees/:id/components',
  payrollController.getStructure
);
router.patch(
  '/payroll/employees/:id/components',
  payrollController.updateSalaryComponents
);
router.post('/payroll/bonus', payrollController.addBonus);
router.post('/payroll/deductions', payrollController.addDeduction);

export default router;
