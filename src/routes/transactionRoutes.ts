import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  listTransactions,
  resolveTransaction,
  injectTransaction
} from '../controllers/transactionController';

const router = Router();

// Transactions ledger
router.get('/', authenticateToken, listTransactions);
router.put('/:id/resolve', authenticateToken, resolveTransaction);
router.post('/', authenticateToken, injectTransaction);

export default router;
