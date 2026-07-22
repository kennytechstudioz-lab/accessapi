import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  getSettings,
  updateSettings
} from '../controllers/settingsController';

const router = Router();

// Settings desk
router.get('/', getSettings);
router.put('/', authenticateToken, updateSettings);


export default router;
