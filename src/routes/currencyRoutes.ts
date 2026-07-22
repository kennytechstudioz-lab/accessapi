import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  listCurrencies,
  createCurrency,
  updateCurrency,
  deleteCurrency
} from '../controllers/currencyController';

const router = Router();

// Currencies desk
router.get('/', authenticateToken, listCurrencies);
router.post('/', authenticateToken, createCurrency);
router.put('/:id', authenticateToken, updateCurrency);
router.delete('/:id', authenticateToken, deleteCurrency);

export default router;
