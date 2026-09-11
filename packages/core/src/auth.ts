// @syndocs
import crypto from 'crypto';

/**
 * Hash a password with a random salt using SHA-256.
 */
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const chosenSalt = salt ?? crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(chosenSalt + ':' + password).digest('hex');
  return { hash, salt: chosenSalt };
}

/**
 * Verify a plaintext password against a stored hash and salt.
 */
export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

/**
 * Generate a simple signed session token for authenticated Web UI editing.
 */
export function generateSessionToken(secret: string): string {
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac('sha256', secret).update(timestamp).digest('hex');
  return Buffer.from(`${timestamp}:${signature}`).toString('base64url');
}

/**
 * Verify that a session token was signed with the given secret and is not expired (24h validity).
 */
export function verifySessionToken(token: string, secret: string, maxAgeMs = 24 * 60 * 60 * 1000): boolean {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const [timestampStr, signature] = raw.split(':');
    if (!timestampStr || !signature) return false;

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) return false;

    const expectedSig = crypto.createHmac('sha256', secret).update(timestampStr).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}
