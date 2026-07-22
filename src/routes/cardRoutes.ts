import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  listCards,
  approveCard,
  rejectCard
} from '../controllers/cardController';

const router = Router();

// Cards desk
router.get('/', authenticateToken, listCards);
router.put('/:id/approve', authenticateToken, approveCard);
router.put('/:id/reject', authenticateToken, rejectCard);

export default router;
