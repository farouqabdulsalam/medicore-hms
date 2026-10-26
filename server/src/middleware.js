import jwt from 'jsonwebtoken';
import { User } from './models.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) return res.status(401).json({ message: 'Account unavailable. Contact an administrator.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired or invalid. Please sign in again.' });
  }
}

export function allow(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    next();
  };
}
