/**
 * Optional AES-256-GCM encryption for per-workspace Repull API keys.
 *
 * If ENCRYPTION_KEY is set (32-byte base64), keys are encrypted at rest.
 * If unset, keys are stored as plaintext — fine for local dev, not for prod.
 *
 * Format on disk: `v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>`
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const ENC_PREFIX = 'v1:';

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be a 32-byte base64 string (got ${buf.length} bytes)`);
  }
  return buf;
}

export function encryptApiKey(plaintext: string): { value: string; encrypted: boolean } {
  const key = getKey();
  if (!key) return { value: plaintext, encrypted: false };
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    value: `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`,
    encrypted: true,
  };
}

export function decryptApiKey(stored: string, isEncrypted: boolean): string {
  if (!isEncrypted) return stored;
  if (!stored.startsWith(ENC_PREFIX)) {
    throw new Error('Stored API key is marked encrypted but does not have the v1: prefix');
  }
  const key = getKey();
  if (!key) {
    throw new Error('Stored API key is encrypted but ENCRYPTION_KEY is not set');
  }
  const [, ivB64, tagB64, ctB64] = stored.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
