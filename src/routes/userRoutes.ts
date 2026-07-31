import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  getProfile,
  updateOwnProfile,
  lookupAccount,
  setPin,
  changeUserPassword,
  toggle2FA,
  getAccounts,
  getTransactions,
  requestCode,
  validateCode,
  performTransfer,
  submitKyc,
  getCards,
  requestCard
} from '../controllers/userController';
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from '../controllers/notificationController';

const router = Router();

// Profile & Account Lookup
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateOwnProfile);
router.get('/lookup-account', authenticateToken, lookupAccount);

// Notifications
router.get('/notifications', authenticateToken, getUserNotifications);
router.put('/notifications/:id/read', authenticateToken, markNotificationRead);
router.put('/notifications/read-all', authenticateToken, markAllNotificationsRead);

// Security, PIN & Password
router.post('/set-pin', authenticateToken, setPin);
router.post('/change-password', authenticateToken, changeUserPassword);
router.post('/toggle-2fa', authenticateToken, toggle2FA);

// Accounts
router.get('/accounts', authenticateToken, getAccounts);

// Transactions
router.get('/transactions', authenticateToken, getTransactions);

// Request Code (TAC / IMF / TAX)
router.post('/request-code', authenticateToken, requestCode);
router.post('/validate-code', authenticateToken, validateCode);

// Perform Transfer
router.post('/transfer', authenticateToken, performTransfer);

// Submit KYC
router.post('/kyc', authenticateToken, submitKyc);

// Get Cards
router.get('/cards', authenticateToken, getCards);

// Request Card
router.post('/cards/request', authenticateToken, requestCard);

export default router;
