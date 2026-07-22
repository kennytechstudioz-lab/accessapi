import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import adminUserRoutes from './adminUserRoutes';
import currencyRoutes from './currencyRoutes';
import transactionRoutes from './transactionRoutes';
import cardRoutes from './cardRoutes';
import notificationRoutes from './notificationRoutes';
import faqRoutes from './faqRoutes';
import blogRoutes from './blogRoutes';
import termsRoutes from './termsRoutes';
import settingsRoutes from './settingsRoutes';

import { customDeposit } from '../controllers/transactionController';
import { listNotificationTemplates, createNotificationTemplate, updateNotificationTemplate } from '../controllers/notificationController';
import { listEmailTemplates, createEmailTemplate, updateEmailTemplate } from '../controllers/settingsController';
import { changeAdminPassword } from '../controllers/userController';

const router = Router();

// Sub-routers mapping
router.use('/users', adminUserRoutes);
router.use('/currencies', currencyRoutes);
router.use('/transactions', transactionRoutes);
router.use('/cards', cardRoutes);
router.use('/notifications', notificationRoutes);
router.use('/faq', faqRoutes);
router.use('/blogs', blogRoutes);
router.use('/terms', termsRoutes);
router.use('/settings', settingsRoutes);

// Direct mapping of legacy/unprefixed endpoints
router.post('/deposit', authenticateToken, customDeposit);
router.get('/emails', authenticateToken, listEmailTemplates);
router.post('/emails', authenticateToken, createEmailTemplate);
router.put('/emails/:id', authenticateToken, updateEmailTemplate);
router.get('/notification-templates', authenticateToken, listNotificationTemplates);
router.post('/notification-templates', authenticateToken, createNotificationTemplate);
router.put('/notification-templates/:id', authenticateToken, updateNotificationTemplate);
router.put('/change-password', authenticateToken, changeAdminPassword);

export default router;

