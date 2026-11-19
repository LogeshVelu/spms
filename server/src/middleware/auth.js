import { verifyToken } from '../utils/security.js';
import { db } from '../database/db.js';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.headers.cookie) {
    // Cookie support
    const match = req.headers.cookie.match(/token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required. Token missing.' }
    });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Session expired or token invalid. Please sign in again.' }
    });
  }

  // Load fresh user status from db
  const user = db.get(`SELECT id, email, role, status FROM users WHERE id = ? AND deleted_at IS NULL`, [payload.id]);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User account not found or deactivated.' }
    });
  }

  if (user.status === 'SUSPENDED' || user.status === 'REJECTED') {
    return res.status(403).json({
      success: false,
      error: { code: 'ACCOUNT_INACTIVE', message: `Your account is ${user.status.toLowerCase()}.` }
    });
  }

  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_ROLE',
          message: `Access denied. Required role: [${roles.join(', ')}], your role: '${req.user.role}'`
        }
      });
    }

    next();
  };
}
