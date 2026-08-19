#!/usr/bin/env node
/**
 * Servidor local opcional para generación de guiones con IA.
 * La clave API nunca se expone al navegador.
 *
 * Uso: node server/index.mjs
 * Requiere variables en .env (ver .env.example)
 */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAppHandler } from './accountServer.mjs';
import { resolveAllowedOrigins } from './core.mjs';
import { createAccountStore } from './store/createStore.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const PORT = Number(process.env.AI_SERVER_PORT) || 3001;
const API_KEY = process.env.OPENAI_API_KEY || '';
const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function isProductionOrDeploy(env) {
  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  if (nodeEnv === 'production') return true;
  return Boolean(
    env.VERCEL ||
      env.RENDER ||
      env.RAILWAY_ENVIRONMENT ||
      env.FLY_APP_NAME ||
      env.DYNO,
  );
}

function isStrongPepper(value) {
  if (value.length < 32) return false;
  let categories = 0;
  if (/[a-z]/.test(value)) categories += 1;
  if (/[A-Z]/.test(value)) categories += 1;
  if (/[0-9]/.test(value)) categories += 1;
  if (/[^a-zA-Z0-9]/.test(value)) categories += 1;
  return categories >= 3;
}

export function resolveSessionPepper(env = process.env, logger = console) {
  const pepper = typeof env.SESSION_PEPPER === 'string' ? env.SESSION_PEPPER.trim() : '';
  const productionOrDeploy = isProductionOrDeploy(env);
  const devOrTest =
    !productionOrDeploy ||
    (env.NODE_ENV ?? '').toLowerCase() === 'development' ||
    (env.NODE_ENV ?? '').toLowerCase() === 'test' ||
    env.VITEST === 'true';

  if (pepper && isStrongPepper(pepper)) {
    return pepper;
  }

  if (productionOrDeploy) {
    throw new Error('SESSION_PEPPER_REQUIRED_STRONG');
  }

  const ephemeral = randomBytes(32).toString('hex');
  if (devOrTest) {
    logger.warn(
      '[security] SESSION_PEPPER ausente o debil fuera de produccion; se genera uno efimero para esta ejecucion.',
    );
  }
  return ephemeral;
}

function isMainModule() {
  return process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;
}

export async function startServer() {
  const allowedOrigins = resolveAllowedOrigins(process.env);
  const store = await createAccountStore({
    sqlitePath: process.env.ACCOUNT_DB_PATH
      ? resolve(process.cwd(), process.env.ACCOUNT_DB_PATH)
      : undefined,
    fallbackPath: process.env.ACCOUNT_STORE_JSON_PATH
      ? resolve(process.cwd(), process.env.ACCOUNT_STORE_JSON_PATH)
      : undefined,
  });

  const handler = createAppHandler({
    store,
    allowedOrigins,
    sessionPepper: resolveSessionPepper(process.env, console),
    ai: {
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      model: MODEL,
    },
  });

  const server = createServer(handler);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AI server on http://localhost:${PORT}`);
    console.log(`AI enabled: ${Boolean(API_KEY)}`);
    console.log(`Account store: ${store.kind}`);
    console.log(`Account allowed origins: ${Array.from(allowedOrigins).join(', ')}`);
  });

  process.on('SIGINT', () => {
    store.close();
    server.close(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    store.close();
    server.close(() => process.exit(0));
  });

  return { server, store };
}

if (isMainModule()) {
  try {
    await startServer();
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SERVER_BOOT_ERROR';
    console.error(`Server boot failed: ${code}`);
    process.exit(1);
  }
}
