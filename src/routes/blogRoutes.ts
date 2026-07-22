import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth';
import {
  listBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog
} from '../controllers/blogController';

const router = Router();

// Blogs desk
router.get('/', listBlogs);
router.get('/:id', getBlogById);
router.post('/', authenticateToken, createBlog);
router.put('/:id', authenticateToken, updateBlog);
router.delete('/:id', authenticateToken, deleteBlog);

export default router;

