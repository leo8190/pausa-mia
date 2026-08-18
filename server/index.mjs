#!/usr/bin/env node
/**
 * Servidor local opcional para generación de guiones con IA.
 * La clave API nunca se expone al navegador.
 *
 * Uso: node server/index.mjs
 * Requiere variables en .env (ver .env.example)
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiServerHandler } from './core.mjs';

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

const handler = createAiServerHandler({
  apiKey: API_KEY,
  baseUrl: BASE_URL,
  model: MODEL,
});

const server = createServer(handler);

server.listen(PORT, () => {
  console.log(`AI server on http://localhost:${PORT}`);
  console.log(`AI enabled: ${Boolean(API_KEY)}`);
});
