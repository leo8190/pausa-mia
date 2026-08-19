import { describe, expect, it } from 'vitest';
import {
  buildAccountApiUrl,
  getAccountApiBaseUrl,
  normalizeAccountApiUrl,
} from '../lib/accountApiUrl';

describe('account api url helpers', () => {
  it('normaliza URL http(s) y remueve slash final', () => {
    expect(normalizeAccountApiUrl('https://api.example.com/')).toBe(
      'https://api.example.com',
    );
    expect(normalizeAccountApiUrl('http://localhost:3001/base/')).toBe(
      'http://localhost:3001/base',
    );
  });

  it('rechaza valores vacíos, protocolos no http y credenciales embebidas', () => {
    expect(normalizeAccountApiUrl('')).toBeNull();
    expect(normalizeAccountApiUrl('   ')).toBeNull();
    expect(normalizeAccountApiUrl('ftp://api.example.com')).toBeNull();
    expect(normalizeAccountApiUrl('https://user:pass@api.example.com')).toBeNull();
  });

  it('resuelve base vacía cuando VITE_ACCOUNT_API_URL no está definida', () => {
    expect(getAccountApiBaseUrl({})).toBe('');
    expect(buildAccountApiUrl('/api/account/status', {})).toBe('/api/account/status');
  });

  it('construye paths absolutos con base normalizada', () => {
    const env = { VITE_ACCOUNT_API_URL: 'https://api.example.com/v1/' };
    expect(getAccountApiBaseUrl(env)).toBe('https://api.example.com/v1');
    expect(buildAccountApiUrl('api/account/status', env)).toBe(
      'https://api.example.com/v1/api/account/status',
    );
  });
});
