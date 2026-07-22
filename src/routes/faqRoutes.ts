import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq
} from '../controllers/faqController';

const router = Router();

// FAQ desk
router.get('/', listFaqs);
router.post('/', authenticateToken, createFaq);
router.put('/:id', authenticateToken, updateFaq);
router.delete('/:id', authenticateToken, deleteFaq);


export default router;
