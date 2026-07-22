import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  getProfile,
  updateOwnProfile,
  getAccounts,
  getTransactions,
  requestCode,
  performTransfer,
  submitKyc,
  getCards,
  requestCard
} from '../controllers/userController';

const router = Router();

// Profile
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateOwnProfile);

// Accounts
router.get('/accounts', authenticateToken, getAccounts);

// Transactions
router.get('/transactions', authenticateToken, getTransactions);

// Request Code (TAC / IMF / TAX)
router.post('/request-code', authenticateToken, requestCode);

// Perform Transfer
router.post('/transfer', authenticateToken, performTransfer);

// Submit KYC
router.post('/kyc', authenticateToken, submitKyc);

// Get Cards
router.get('/cards', authenticateToken, getCards);

// Request Card
router.post('/cards/request', authenticateToken, requestCard);

export default router;
