import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createLoginSecretHash,
  parseCookieHeader,
  verifyLoginSecret,
} from '../accountAuth.mjs';

function legacyHash(secret, salt) {
  return createHash('sha256').update(`${salt}:${secret}`).digest('hex');
}

describe('account auth secret hashing', () => {
  it('genera secretos de login con scrypt y valida correctamente', () => {
    const loginSecret = 'ClaveSuperSegura#2026';
    const { hash, salt } = createLoginSecretHash(loginSecret);
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(verifyLoginSecret(loginSecret, hash, salt)).toBe(true);
    expect(verifyLoginSecret('otra-clave', hash, salt)).toBe(false);
  });

  it('mantiene compatibilidad con hashes legacy sha256+salt', () => {
    const salt = 'a0b1c2d3e4f50617';
    const hash = legacyHash('legacy-secret', salt);
    expect(verifyLoginSecret('legacy-secret', hash, salt)).toBe(true);
    expect(verifyLoginSecret('incorrecta', hash, salt)).toBe(false);
  });

  it('ignora cookies mal formadas en lugar de romper el parseo', () => {
    const parsed = parseCookieHeader('meditacion_session=abc%ZZ; theme=dark');
    expect(parsed.meditacion_session).toBe('abc%ZZ');
    expect(parsed.theme).toBe('dark');
  });
});
