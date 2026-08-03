import express from 'express';
import * as payrollController from '../controllers/payrollController.js';
import { protect, authorize } from '../middleware/auth.js';
import { STAFF_ROLES, HR_ADMIN } from '../constants/roles.js';

const router = express.Router();
router.use(protect);

router.post('/structures', authorize(...HR_ADMIN), payrollController.upsertStructure);
router.get(
  '/structures/:employeeId',
  authorize(...STAFF_ROLES, ...HR_ADMIN),
  payrollController.getStructure
);
router.post('/run', authorize(...HR_ADMIN), payrollController.runPayroll);
router.get('/runs', authorize(...HR_ADMIN), payrollController.listPayrollRuns);
router.get('/payslips/me', authorize(...STAFF_ROLES), payrollController.myPayslips);
router.get(
  '/payslips/:id/pdf',
  authorize(...STAFF_ROLES, ...HR_ADMIN),
  payrollController.downloadPayslipPdf
);
router.get(
  '/payslips/:id',
  authorize(...STAFF_ROLES, ...HR_ADMIN),
  payrollController.getPayslip
);

export default router;
