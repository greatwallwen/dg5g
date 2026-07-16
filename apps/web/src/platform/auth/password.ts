import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'scrypt';
const FORMAT_VERSION = 'v1';
const SALT_BYTES = 16;
const DEFAULT_PARAMETERS = {
  N: 16_384,
  r: 8,
  p: 1,
  keyLength: 32,
} as const;
const MAX_N = 65_536;
const MAX_R = 16;
const MAX_P = 4;
const MAX_KEY_BYTES = 64;
const MAX_CPU_COST = 524_288;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const SCRYPT_MEMORY_OVERHEAD_BYTES = 1024 * 1024;

interface ScryptParameters {
  N: number;
  r: number;
  p: number;
  keyLength: number;
  maxmem: number;
}

export function hashPassword(password: string): string {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Password must be a non-empty string.');
  }

  const salt = randomBytes(SALT_BYTES);
  const parameters = validateParameters(
    DEFAULT_PARAMETERS.N,
    DEFAULT_PARAMETERS.r,
    DEFAULT_PARAMETERS.p,
    DEFAULT_PARAMETERS.keyLength,
  );
  if (!parameters) throw new Error('Default scrypt parameters are invalid.');
  const derivedKey = deriveKey(password, salt, parameters);
  return [
    ALGORITHM,
    FORMAT_VERSION,
    parameters.N,
    parameters.r,
    parameters.p,
    parameters.keyLength,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  if (typeof password !== 'string' || typeof encodedHash !== 'string') return false;

  try {
    const parts = encodedHash.split('$');
    if (parts.length !== 8 || parts[0] !== ALGORITHM || parts[1] !== FORMAT_VERSION) return false;

    const N = parseInteger(parts[2]);
    const r = parseInteger(parts[3]);
    const p = parseInteger(parts[4]);
    const keyLength = parseInteger(parts[5]);
    if (N === undefined || r === undefined || p === undefined || keyLength === undefined) {
      return false;
    }
    const parameters = validateParameters(N, r, p, keyLength);
    if (!parameters) return false;

    const salt = decodeBase64Url(parts[6], SALT_BYTES);
    const expectedKey = decodeBase64Url(parts[7], parameters.keyLength);
    if (!salt || !expectedKey) return false;

    const actualKey = deriveKey(password, salt, parameters);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

function deriveKey(password: string, salt: Buffer, parameters: ScryptParameters): Buffer {
  return scryptSync(password, salt, parameters.keyLength, {
    N: parameters.N,
    r: parameters.r,
    p: parameters.p,
    maxmem: parameters.maxmem,
  });
}

function parseInteger(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function validateParameters(
  N: number,
  r: number,
  p: number,
  keyLength: number,
): ScryptParameters | undefined {
  if (N < DEFAULT_PARAMETERS.N || N > MAX_N || !Number.isInteger(Math.log2(N))) return undefined;
  if (r < DEFAULT_PARAMETERS.r || r > MAX_R) return undefined;
  if (p < 1 || p > MAX_P) return undefined;
  if (keyLength < DEFAULT_PARAMETERS.keyLength || keyLength > MAX_KEY_BYTES) return undefined;
  if (N * r * p > MAX_CPU_COST) return undefined;

  const estimatedMemory = 128 * N * r;
  const maxmem = estimatedMemory + SCRYPT_MEMORY_OVERHEAD_BYTES;
  if (!Number.isSafeInteger(maxmem) || maxmem > MAX_MEMORY_BYTES) return undefined;
  return { N, r, p, keyLength, maxmem };
}

function decodeBase64Url(value: string, expectedBytes: number): Buffer | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== expectedBytes || decoded.toString('base64url') !== value) return undefined;
  return decoded;
}
