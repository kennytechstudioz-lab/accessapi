import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  listCryptoCurrencies,
  getActiveCryptoCurrencies,
  createCryptoCurrency,
  updateCryptoCurrency,
  deleteCryptoCurrency,
  submitCryptoDeposit,
} from '../controllers/cryptoController';

const router = Router();

// Client routes
router.get('/active', authenticateToken, getActiveCryptoCurrencies);
router.post('/deposit', authenticateToken, submitCryptoDeposit);

// Admin routes
router.get('/', authenticateToken, listCryptoCurrencies);
router.post('/', authenticateToken, createCryptoCurrency);
router.put('/:id', authenticateToken, updateCryptoCurrency);
router.delete('/:id', authenticateToken, deleteCryptoCurrency);

export default router;
