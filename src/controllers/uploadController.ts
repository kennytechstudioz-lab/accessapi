import { Request, Response } from 'express';
import { uploadToS3, deleteFromS3 } from '../utils/s3Upload';
import fs from 'fs';
import path from 'path';

/**
 * Controller: Handles media file upload directly to Cloudflare R2 (with local fallback).
 */
export async function uploadMedia(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided in the upload request payload.',
      });
    }

    const fileBuffer =
      req.file.buffer || (req.file.path ? await fs.promises.readFile(req.file.path) : null);

    if (!fileBuffer) {
      return res.status(400).json({
        success: false,
        error: 'Unable to read uploaded file buffer.',
      });
    }

    const hostUrl = `${req.protocol}://${req.get('host')}`;

    // Upload to Cloudflare R2 (or fallback to local disk)
    const publicUrl = await uploadToS3(
      fileBuffer,
      req.file.originalname,
      req.file.mimetype,
      hostUrl
    );

    return res.status(200).json({
      success: true,
      url: publicUrl,
      fileName: req.file.originalname,
      filename: path.basename(publicUrl),
    });
  } catch (err: any) {
    console.error('API Upload Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'An unexpected error occurred while saving the upload.',
    });
  }
}

/**
 * Controller: Removes an image from Cloudflare R2 or local storage given its URL or filename.
 */
export async function deleteMedia(req: Request, res: Response) {
  try {
    const target =
      req.body?.url ||
      req.body?.imageUrl ||
      req.body?.fileName ||
      req.body?.filename;

    if (!target) {
      return res.status(400).json({
        success: false,
        error: 'No image URL or filename provided in request payload.',
      });
    }

    await deleteFromS3(target);

    return res.status(200).json({
      success: true,
      message: 'Media object deleted successfully.',
    });
  } catch (err: any) {
    console.error('API Media Deletion Error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'An unexpected error occurred while deleting media object.',
    });
  }
}
