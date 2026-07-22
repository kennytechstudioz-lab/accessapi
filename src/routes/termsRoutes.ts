import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  getTerms,
  updateTerms
} from '../controllers/termsController';

const router = Router();

// Terms & Privacy routes
router.get('/', getTerms);
router.put('/', authenticateToken, updateTerms);

export default router;

