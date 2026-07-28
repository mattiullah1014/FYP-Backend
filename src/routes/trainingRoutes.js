import express from 'express';
import * as trainingController from '../controllers/trainingController.js';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';
import { STAFF_ROLES, MANAGEMENT_ROLES, HR_ADMIN } from '../constants/roles.js';

const router = express.Router();
router.use(protect);

router.get('/courses', authorize(...STAFF_ROLES), trainingController.listCourses);
router.post('/courses', authorize(...HR_ADMIN), trainingController.createCourse);
router.patch('/courses/:id', authorize(...HR_ADMIN), trainingController.updateCourse);

router.post(
  '/courses/:courseId/enroll',
  authorize(...STAFF_ROLES),
  trainingController.enroll
);
router.get('/enrollments/me', authorize(...STAFF_ROLES), trainingController.myEnrollments);
router.patch(
  '/enrollments/:id/progress',
  authorize(...STAFF_ROLES),
  trainingController.updateProgress
);
router.post(
  '/enrollments/:id/certificate',
  authorize(...STAFF_ROLES),
  upload.single('certificate'),
  trainingController.uploadCertificate
);
router.get(
  '/reports/completion',
  authorize(...HR_ADMIN),
  trainingController.completionReport
);

export default router;
