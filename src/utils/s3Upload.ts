import dotenv from 'dotenv';
dotenv.config();

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import path from 'path';
import fs from 'fs';

const PROJECT_NAME = 'access';

// Resolve R2 endpoint, bucket, and public base URL dynamically from env
export function getR2Endpoint(): string {
  const api = process.env.CLOUDFLARE_S3_API || '';
  try {
    const url = new URL(api);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return process.env.CLOUDFLARE_ACCOUNT_ID
      ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : '';
  }
}

export function getR2Bucket(): string {
  const api = process.env.CLOUDFLARE_S3_API || '';
  try {
    return new URL(api).pathname.replace(/^\//, '').split('/')[0] || 'schooling-social';
  } catch {
    return 'schooling-social';
  }
}

export function getPublicBaseUrl(): string {
  return (process.env.CLOUDFLARE_PUBLIC_URL || '').replace(/\/+$/, '');
}

// Resolve local uploads directory at api project root
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Lazy-initialize S3 client
let s3Client: S3Client | null = null;
export function getS3Client(): S3Client | null {
  if (!s3Client) {
    const accessKeyId = process.env.CLOUDFLARE_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env.CLOUDFLARE_SECRETE_ACCESS_KEY || process.env.CLOUDFLARE_SECRET_ACCESS_KEY;
    const endpoint = getR2Endpoint();

    if (accessKeyId && secretAccessKey && endpoint) {
      s3Client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        requestHandler: new NodeHttpHandler({
          httpsAgent: new https.Agent({ autoSelectFamily: false }),
        }),
      });
    }
  }
  return s3Client;
}

function getMimeType(ext: string): string {
  const cleanExt = ext.toLowerCase().replace(/^\./, '');
  switch (cleanExt) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Uploads a file buffer directly to Cloudflare R2 (or fallback to local disk).
 */
export async function uploadToS3(
  fileBuffer: Buffer,
  originalName: string,
  mimeType?: string,
  hostUrl?: string
): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 50);
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const cleanFilename = `${baseName || 'media'}-${uniqueSuffix}${ext || '.png'}`;

  const client = getS3Client();
  const publicBaseUrl = getPublicBaseUrl();
  const bucket = getR2Bucket();

  // 1. Upload to Cloudflare R2 if credentials are provided
  if (client && publicBaseUrl) {
    const key = `${PROJECT_NAME}/uploads/${cleanFilename}`;
    const contentType = mimeType || getMimeType(ext);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000',
      })
    );

    const publicUrl = `${publicBaseUrl}/${key}`;
    console.log(`✓ [R2 Upload] File uploaded to Cloudflare R2: ${publicUrl}`);
    return publicUrl;
  }

  // 2. Fallback to local uploads directory
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  const targetPath = path.join(UPLOAD_DIR, cleanFilename);
  await fs.promises.writeFile(targetPath, fileBuffer);

  const baseUrl =
    process.env.API_BASE_URL ||
    process.env.BASE_URL ||
    hostUrl ||
    `http://localhost:${process.env.PORT || 5009}`;

  const localUrl = `${baseUrl.replace(/\/+$/, '')}/uploads/${cleanFilename}`;
  console.log(`✓ [Local Upload] File saved to disk: ${localUrl}`);
  return localUrl;
}

/**
 * If data is a base64 string (e.g. data:image/png;base64,...), converts it to a buffer
 * and uploads to Cloudflare R2. If it is already an HTTP URL or regular text, returns as-is.
 */
export async function uploadBase64ToS3(
  base64Data: string | undefined | null,
  fileNamePrefix: string = 'upload',
  hostUrl?: string
): Promise<string> {
  if (!base64Data || typeof base64Data !== 'string') {
    return '';
  }

  const trimmed = base64Data.trim();
  // Already a URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Check if it is a data URI: data:[<mediatype>][;base64],<data>
  const match = trimmed.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/s);
  if (match) {
    const mimeType = match[1];
    const rawBase64 = match[2];
    const buffer = Buffer.from(rawBase64, 'base64');
    const ext = mimeType.includes('pdf')
      ? '.pdf'
      : mimeType.includes('png')
      ? '.png'
      : mimeType.includes('webp')
      ? '.webp'
      : mimeType.includes('gif')
      ? '.gif'
      : '.jpg';

    return uploadToS3(buffer, `${fileNamePrefix}${ext}`, mimeType, hostUrl);
  }

  // Raw base64 string check (long string without spaces)
  if (trimmed.length > 200 && /^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    try {
      const buffer = Buffer.from(trimmed, 'base64');
      return uploadToS3(buffer, `${fileNamePrefix}.jpg`, 'image/jpeg', hostUrl);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

/**
 * Extract R2 object key from URL or key string
 */
export function extractR2Key(urlOrKey: string): string | null {
  if (!urlOrKey || typeof urlOrKey !== 'string') return null;
  let clean = urlOrKey.trim();
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    try {
      const u = new URL(clean);
      clean = u.pathname;
    } catch {
      clean = clean.replace(/^https?:\/\/[^\/]+/, '');
    }
  }
  clean = clean.split('?')[0].split('#')[0].replace(/^\/+/, '');
  const bucket = getR2Bucket();
  if (bucket && clean.startsWith(`${bucket}/`)) {
    clean = clean.slice(bucket.length + 1);
  }
  return clean || null;
}

/**
 * Deletes an object from Cloudflare R2 (or fallback local disk).
 */
export async function deleteFromS3(fileUrlOrKey: string): Promise<boolean> {
  if (!fileUrlOrKey || typeof fileUrlOrKey !== 'string') return false;

  const client = getS3Client();
  const bucket = getR2Bucket();

  // If it's a Cloudflare R2 URL or key
  if (
    client &&
    (fileUrlOrKey.includes('.r2.dev') ||
      fileUrlOrKey.includes('r2.cloudflarestorage.com') ||
      fileUrlOrKey.includes(`${PROJECT_NAME}/uploads/`))
  ) {
    const key = extractR2Key(fileUrlOrKey);
    if (key) {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        );
        console.log(`✓ [R2 Delete] Object deleted from Cloudflare R2: ${key}`);
        return true;
      } catch (err) {
        console.error(`✗ [R2 Delete] Error deleting key ${key}:`, err);
        return false;
      }
    }
  }

  // Fallback to local cleanup
  return deleteLocalFile(fileUrlOrKey);
}

/**
 * Deletes a file safely from local uploads directory if present.
 */
export async function deleteLocalFile(fileUrlOrName: string | undefined | null): Promise<boolean> {
  if (!fileUrlOrName || typeof fileUrlOrName !== 'string') return false;

  if (fileUrlOrName.includes('.r2.dev') || fileUrlOrName.includes('r2.cloudflarestorage.com')) {
    return deleteFromS3(fileUrlOrName);
  }

  try {
    let filename = fileUrlOrName;
    if (filename.includes('/uploads/')) {
      filename = filename.substring(filename.lastIndexOf('/uploads/') + '/uploads/'.length);
    }
    filename = path.basename(filename.split('?')[0].split('#')[0]);
    if (!filename || filename === '.' || filename === '..') return false;

    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`✓ [Local Delete] Deleted local file: ${filename}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Local file deletion error:', err);
    return false;
  }
}

// Backwards-compatible aliases
export const uploadToLocal = uploadToS3;
export const saveBufferToUploads = async (buffer: Buffer, originalName: string) => {
  return uploadToS3(buffer, originalName);
};
