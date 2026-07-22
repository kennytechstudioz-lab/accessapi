import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  listUsers,
  getUserByUsername,
  updateUserDetails,
  deleteUser,
  adjustUserBalance
} from '../controllers/userController';

const router = Router();

// Users Directory
router.get('/', authenticateToken, listUsers);
router.get('/:username', authenticateToken, getUserByUsername);
router.put('/:id', authenticateToken, updateUserDetails);
router.delete('/:id', authenticateToken, deleteUser);
router.put('/:id/balance', authenticateToken, adjustUserBalance);

export default router;
