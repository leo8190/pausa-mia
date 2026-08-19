import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppHandler } from '../accountServer.mjs';
import { createAccountStore } from '../store/createStore.mjs';

const ORIGIN = 'http://localhost:5173';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'meditacion-account-api-'));
}

async function withTestServer(callback) {
  const dir = makeTempDir();
  const store = await createAccountStore({
    fallbackPath: join(dir, 'app-store.json'),
    forceEngine: 'json',
  });
  const handler = createAppHandler({
    store,
    sessionPepper: 'test-pepper',
    ai: { apiKey: '' },
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    await callback({ port, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withTestServerOptions(options, callback) {
  const dir = makeTempDir();
  const store = await createAccountStore({
    fallbackPath: join(dir, 'app-store.json'),
    forceEngine: 'json',
  });
  const handler = createAppHandler({
    store,
    sessionPepper: 'test-pepper',
    ai: { apiKey: '' },
    ...options,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    await callback({ port, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function options(method = 'GET', cookie = '') {
  const headers = { Origin: ORIGIN };
  if (cookie) headers.Cookie = cookie;
  if (method !== 'GET' && method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
  }
  return { method, headers };
}

describe('account server endpoints', () => {
  it('registra cuenta, setea cookie httpOnly y devuelve estado autenticado', async () => {
    await withTestServer(async ({ port }) => {
      const register = await fetch(`http://127.0.0.1:${port}/api/account/register`, {
        ...options('POST'),
        body: JSON.stringify({
          displayName: 'Leonardo',
          locale: 'es-AR',
          loginSecret: 'segura-1234',
        }),
      });
      expect(register.status).toBe(201);
      const setCookie = register.headers.get('set-cookie') ?? '';
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      expect(setCookie).toMatch(/meditacion_session=/i);

      const status = await fetch(`http://127.0.0.1:${port}/api/account/status`, {
        ...options('GET', setCookie),
      });
      expect(status.status).toBe(200);
      const statusBody = await status.json();
      expect(statusBody.authenticated).toBe(true);
      expect(statusBody.user.displayName).toBe('Leonardo');
    });
  });

  it('inicia y cierra sesión sin exponer secreto en respuesta', async () => {
    await withTestServer(async ({ port, store }) => {
      const created = store.createUser({
        displayName: 'Cuenta login',
        locale: 'es-neutro',
        loginSecretHash:
          'fd7f8f4ce7f40c2d4fac4ec6b58b652f9ef57f60d2cf8d95fe1f31b4f484f82d',
        loginSecretSalt: 'manual-salt',
      });
      // Ajuste de hash con el mismo algoritmo del servidor para test determinista.
      const login = await fetch(`http://127.0.0.1:${port}/api/account/login`, {
        ...options('POST'),
        body: JSON.stringify({ userId: created.id, loginSecret: 'wrong' }),
      });
      expect(login.status).toBe(401);

      // Sobrescribe con credencial válida para evitar depender de helpers internos.
      store.deleteAccount(created.id);
      const register = await fetch(`http://127.0.0.1:${port}/api/account/register`, {
        ...options('POST'),
        body: JSON.stringify({
          displayName: 'Cuenta login',
          locale: 'es-neutro',
          loginSecret: 'clave-valida',
        }),
      });
      const registeredBody = await register.json();

      const loginOk = await fetch(`http://127.0.0.1:${port}/api/account/login`, {
        ...options('POST'),
        body: JSON.stringify({
          userId: registeredBody.user.id,
          loginSecret: 'clave-valida',
        }),
      });
      expect(loginOk.status).toBe(200);
      const loginBody = await loginOk.json();
      expect(JSON.stringify(loginBody)).not.toMatch(/loginSecret/i);

      const loginCookie = loginOk.headers.get('set-cookie') ?? '';
      const logout = await fetch(`http://127.0.0.1:${port}/api/account/logout`, {
        ...options('POST', loginCookie),
        body: JSON.stringify({}),
      });
      expect(logout.status).toBe(200);
      expect(logout.headers.get('set-cookie') ?? '').toMatch(/Max-Age=0/);
    });
  });

  it('responde errores de login sin filtrar secreto ni setear cookie', async () => {
    await withTestServer(async ({ port }) => {
      const register = await fetch(`http://127.0.0.1:${port}/api/account/register`, {
        ...options('POST'),
        body: JSON.stringify({
          displayName: 'Login errors',
          locale: 'es-AR',
          loginSecret: 'clave-correcta',
        }),
      });
      const registered = await register.json();

      const wrongPassword = await fetch(`http://127.0.0.1:${port}/api/account/login`, {
        ...options('POST'),
        body: JSON.stringify({
          userId: registered.user.id,
          loginSecret: 'clave-invalida',
        }),
      });
      const unknownUser = await fetch(`http://127.0.0.1:${port}/api/account/login`, {
        ...options('POST'),
        body: JSON.stringify({
          userId: 'no-existe',
          loginSecret: 'clave-invalida',
        }),
      });

      expect(wrongPassword.status).toBe(401);
      expect(unknownUser.status).toBe(401);
      expect(await wrongPassword.json()).toEqual({ error: 'LOGIN_INVALID' });
      expect(await unknownUser.json()).toEqual({ error: 'LOGIN_INVALID' });
      expect(wrongPassword.headers.get('set-cookie')).toBeNull();
      expect(unknownUser.headers.get('set-cookie')).toBeNull();
    });
  });

  it('persiste y revoca consentimientos por proveedor con aislamiento', async () => {
    await withTestServer(async ({ port }) => {
      const registerA = await fetch(`http://127.0.0.1:${port}/api/account/register`, {
        ...options('POST'),
        body: JSON.stringify({
          displayName: 'A',
          locale: 'es-AR',
          loginSecret: 'password-a',
        }),
      });
      const cookieA = registerA.headers.get('set-cookie') ?? '';
      const registerB = await fetch(`http://127.0.0.1:${port}/api/account/register`, {
        ...options('POST'),
        body: JSON.stringify({
          displayName: 'B',
          locale: 'es-AR',
          loginSecret: 'password-b',
        }),
      });
      const cookieB = registerB.headers.get('set-cookie') ?? '';

      const consentA = await fetch(
        `http://127.0.0.1:${port}/api/connectors/google_calendar/consents`,
        {
          ...options('POST', cookieA),
          body: JSON.stringify({
            purpose: 'calendar_freebusy',
            scopes: ['https://www.googleapis.com/auth/calendar.freebusy'],
            evidence: 'Acepto usar disponibilidad de agenda.',
          }),
        },
      );
      expect(consentA.status).toBe(201);
      const consentABody = await consentA.json();

      const listA = await fetch(
        `http://127.0.0.1:${port}/api/connectors/google_calendar/consents`,
        options('GET', cookieA),
      );
      const listB = await fetch(
        `http://127.0.0.1:${port}/api/connectors/google_calendar/consents`,
        options('GET', cookieB),
      );
      expect((await listA.json()).consents).toHaveLength(1);
      expect((await listB.json()).consents).toHaveLength(0);

      const revokeByOther = await fetch(
        `http://127.0.0.1:${port}/api/connectors/google_calendar/consents/${consentABody.consent.id}`,
        options('DELETE', cookieB),
      );
      expect(revokeByOther.status).toBe(404);

      const revokeByOwner = await fetch(
        `http://127.0.0.1:${port}/api/connectors/google_calendar/consents/${consentABody.consent.id}`,
        options('DELETE', cookieA),
      );
      expect(revokeByOwner.status).toBe(200);
    });
  });

  it('expone rutas de conectores en estado not configured', async () => {
    await withTestServer(async ({ port }) => {
      const register = await fetch(`http://127.0.0.1:${port}/api/account/register`, {
        ...options('POST'),
        body: JSON.stringify({
          displayName: 'Conector',
          locale: 'es-neutro',
          loginSecret: 'clave-conector',
        }),
      });
      const cookie = register.headers.get('set-cookie') ?? '';
      const connect = await fetch(
        `http://127.0.0.1:${port}/api/connectors/google_drive/connect`,
        {
          ...options('POST', cookie),
          body: JSON.stringify({}),
        },
      );
      expect(connect.status).toBe(501);
      const payload = await connect.json();
      expect(payload.error).toBe('CONNECTOR_NOT_CONFIGURED');
      expect(payload.details.provider).toBe('google_drive');
    });
  });

  it('borra cuenta, limpia cookie y vuelve a modo invitado', async () => {
    await withTestServer(async ({ port }) => {
      const register = await fetch(`http://127.0.0.1:${port}/api/account/register`, {
        ...options('POST'),
        body: JSON.stringify({
          displayName: 'Borrar',
          locale: 'es-AR',
          loginSecret: 'clave-borrado',
        }),
      });
      const cookie = register.headers.get('set-cookie') ?? '';

      const del = await fetch(
        `http://127.0.0.1:${port}/api/account`,
        options('DELETE', cookie),
      );
      expect(del.status).toBe(200);
      expect(del.headers.get('set-cookie') ?? '').toMatch(/Max-Age=0/);

      const status = await fetch(`http://127.0.0.1:${port}/api/account/status`, {
        ...options('GET', cookie),
      });
      expect(status.status).toBe(200);
      const body = await status.json();
      expect(body.authenticated).toBe(false);
      expect(body.mode).toBe('guest');
    });
  });

  it('aplica CORS con lista ACCOUNT_ALLOWED_ORIGINS separada por comas', async () => {
    await withTestServerOptions(
      {
        allowedOrigins: new Set(['https://app.example.com', 'http://localhost:5173']),
      },
      async ({ port }) => {
        const blocked = await fetch(`http://127.0.0.1:${port}/api/account/status`, {
          headers: { Origin: 'http://evil.example' },
        });
        expect(blocked.status).toBe(403);

        const allowed = await fetch(`http://127.0.0.1:${port}/api/account/status`, {
          headers: { Origin: 'https://app.example.com' },
        });
        expect(allowed.status).toBe(200);
        expect(allowed.headers.get('access-control-allow-origin')).toBe(
          'https://app.example.com',
        );
        expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
      },
    );
  });

  it('rechaza wildcard en rutas con credenciales', async () => {
    await withTestServerOptions(
      {
        allowedOrigins: new Set(['*']),
      },
      async ({ port }) => {
        const preflight = await fetch(
          `http://127.0.0.1:${port}/api/account/register`,
          {
            method: 'OPTIONS',
            headers: {
              Origin: 'https://app.example.com',
              'Access-Control-Request-Method': 'POST',
            },
          },
        );
        expect(preflight.status).toBe(403);

        const request = await fetch(`http://127.0.0.1:${port}/api/account/status`, {
          headers: { Origin: 'https://app.example.com' },
        });
        expect(request.status).toBe(403);
      },
    );
  });
});
