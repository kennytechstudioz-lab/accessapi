import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  listNotifications,
  postNotification,
  deleteNotification
} from '../controllers/notificationController';

const router = Router();

// Notifications bulletin
router.get('/', authenticateToken, listNotifications);
router.post('/', authenticateToken, postNotification);
router.delete('/:id', authenticateToken, deleteNotification);

export default router;
