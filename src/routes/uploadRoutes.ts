import { Router } from 'express';
import { upload } from '../middlewares/upload';
import { uploadMedia, deleteMedia } from '../controllers/uploadController';

const router = Router();

// Route: POST /api/upload - Accepts "file" or "image" field, uploads to Cloudflare R2
router.post('/', upload.single('file'), uploadMedia);
router.post('/image', upload.single('image'), uploadMedia);

// Route: DELETE /api/upload - Deletes an image from Cloudflare R2 or local storage
router.delete('/', deleteMedia);

export default router;
