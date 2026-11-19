import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

/**
 * Robust salted PBKDF2-SHA512 password hasher with constant-time verification.
 * Format: pbkdf2$iterations$salt$hash
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 10000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  
  // Backward compatibility for plain demo seed if needed, but we always seed with hash
  if (!storedHash.startsWith('pbkdf2$')) {
    return password === storedHash;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;

  const iterations = parseInt(parts[1], 10);
  const salt = parts[2];
  const expectedHash = parts[3];

  const actualHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  
  try {
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    const actualBuf = Buffer.from(actualHash, 'hex');
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch (err) {
    return false;
  }
}

export function generateToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (err) {
    return null;
  }
}

export function computeSha256(bufferOrString) {
  return crypto.createHash('sha256').update(bufferOrString).digest('hex');
}

export function generateUuid() {
  return crypto.randomUUID();
}
