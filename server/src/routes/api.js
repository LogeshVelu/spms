import express from 'express';
import authRoutes from '../modules/auth/routes.js';
import studentRoutes from '../modules/students/routes.js';
import companyRoutes from '../modules/companies/routes.js';
import jobRoutes from '../modules/jobs/routes.js';
import applicationRoutes from '../modules/applications/routes.js';
import interviewRoutes from '../modules/interviews/routes.js';
import offerRoutes from '../modules/offers/routes.js';
import analyticsRoutes from '../modules/analytics/routes.js';
import auditRoutes from '../modules/audit/routes.js';
import notificationRoutes from '../modules/notifications/routes.js';
import resumeRoutes from '../modules/resumes/routes.js';

const apiRouter = express.Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/students', studentRoutes);
apiRouter.use('/companies', companyRoutes);
apiRouter.use('/jobs', jobRoutes);
apiRouter.use('/applications', applicationRoutes);
apiRouter.use('/interviews', interviewRoutes);
apiRouter.use('/offers', offerRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/audit', auditRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/resumes', resumeRoutes);

export default apiRouter;
