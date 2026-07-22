import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    status: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'No authentication token, authorization denied' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET || 'supersecretjwtkeyforaccessnational12345';
    const decoded = jwt.verify(token, secret) as { id: string; username: string; email: string; status: string };
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ message: 'Token is invalid or expired' });
    return;
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.status?.toLowerCase() !== 'admin') {
    res.status(403).json({ message: 'Access denied: Admin role required' });
    return;
  }
  next();
};
