import multer from 'multer';
import { Request } from 'express';

// Utilize memory storage to hold files in buffer before streaming to Cloudflare R2
const storage = multer.memoryStorage();

/**
 * Configure multer middleware limits, storage type, and filter guidelines.
 */
export const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/pdf' ||
      /\.(jpe?g|png|webp|svg|gif|ico|pdf|docx?)$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, png, webp, svg, gif) and documents (pdf, doc, docx) are allowed.'));
    }
  },
});
