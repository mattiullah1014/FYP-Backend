import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { notFound, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/authRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import trainingRoutes from './routes/trainingRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import assetRoutes from './routes/assetRoutes.js';
import recruitmentRoutes from './routes/recruitmentRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import applicationRoutes from './routes/applicationRoutes.js';
import candidateRoutes from './routes/candidateRoutes.js';
import communicationRoutes from './routes/communicationRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import managerRoutes from './routes/managerRoutes.js';
import employeePortalRoutes from './routes/employeePortalRoutes.js';
import hrRoutes from './routes/hrRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import { UPLOADS_ROOT } from './utils/recruitmentHelpers.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(UPLOADS_ROOT));

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Brilliance EMS API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/employee', employeePortalRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
