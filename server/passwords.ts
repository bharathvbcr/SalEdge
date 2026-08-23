import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SCRYPT_PREFIX = 'scrypt';

/**
 * Hash a password with scrypt (node:crypto, no external dependency).
 * Format: scrypt$<N>$<saltHex>$<keyHex>
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    return `${SCRYPT_PREFIX}$${SCRYPT_N}$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyScrypt(password: string, stored: string): boolean {
    try {
        const [prefix, nRaw, saltHex, keyHex] = stored.split('$');
        if (prefix !== SCRYPT_PREFIX || !nRaw || !saltHex || !keyHex) return false;
        const salt = Buffer.from(saltHex, 'hex');
        const expected = Buffer.from(keyHex, 'hex');
        const actual = crypto.scryptSync(password, salt, expected.length, {
            N: Number(nRaw),
            r: SCRYPT_R,
            p: SCRYPT_P,
        });
        return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}

/**
 * Verify a password against either a legacy bcrypt hash (transparently
 * migrated on next successful login) or the current scrypt format.
 */
export function isLegacyBcryptHash(storedHash: string): boolean {
    return /^\$2[aby]\$/.test(storedHash);
}

export function verifyPasswordValue(password: string, storedHash: string): boolean {
    if (!password || !storedHash) return false;
    if (isLegacyBcryptHash(storedHash)) {
        return bcrypt.compareSync(password, storedHash);
    }
    return verifyScrypt(password, storedHash);
}
