import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, 'schema.sql');
const require = createRequire(import.meta.url);

function nowIso() {
  return new Date().toISOString();
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function createSqliteStore(dbPath) {
  // Load at runtime through Node's resolver so Vitest/Vite do not rewrite this import.
  const sqlite = require(`node:${'sqlite'}`);
  const { DatabaseSync } = sqlite;
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(readFileSync(schemaPath, 'utf-8'));
  db.exec('PRAGMA foreign_keys = ON;');

  function mapUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      createdAt: row.created_at,
      displayName: row.display_name,
      locale: row.locale,
      status: row.status,
      deletedAt: row.deleted_at,
      loginSecretHash: row.login_secret_hash,
      loginSecretSalt: row.login_secret_salt,
    };
  }

  return {
    kind: 'sqlite',
    close() {
      db.close();
    },
    createUser({
      displayName = null,
      locale = 'es-AR',
      loginSecretHash,
      loginSecretSalt,
    }) {
      const id = randomUUID();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO users (
          id, created_at, display_name, locale, status, login_secret_hash, login_secret_salt
        ) VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      ).run(id, createdAt, displayName, locale, loginSecretHash, loginSecretSalt);

      return this.getUserById(id);
    },
    getUserById(id) {
      const row = db
        .prepare(
          `SELECT id, created_at, display_name, locale, status, deleted_at, login_secret_hash, login_secret_salt
           FROM users WHERE id = ?`,
        )
        .get(id);
      return mapUser(row);
    },
    findActiveUserById(id) {
      const row = db
        .prepare(
          `SELECT id, created_at, display_name, locale, status, deleted_at, login_secret_hash, login_secret_salt
           FROM users
           WHERE id = ? AND status = 'active' AND deleted_at IS NULL`,
        )
        .get(id);
      return mapUser(row);
    },
    createSession({ userId, tokenHash, expiresAt }) {
      const id = randomUUID();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at, token_hash)
         VALUES (?, ?, ?, ?, NULL, ?)`,
      ).run(id, userId ?? null, createdAt, expiresAt, tokenHash);
      return this.getSessionByTokenHash(tokenHash);
    },
    getSessionByTokenHash(tokenHash) {
      const row = db
        .prepare(
          `SELECT id, user_id, created_at, expires_at, revoked_at, token_hash
           FROM sessions WHERE token_hash = ?`,
        )
        .get(tokenHash);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        tokenHash: row.token_hash,
      };
    },
    revokeSessionByTokenHash(tokenHash) {
      const revokedAt = nowIso();
      db.prepare(
        `UPDATE sessions
         SET revoked_at = ?
         WHERE token_hash = ? AND revoked_at IS NULL`,
      ).run(revokedAt, tokenHash);
    },
    revokeSessionById(sessionId) {
      const revokedAt = nowIso();
      db.prepare(
        `UPDATE sessions
         SET revoked_at = ?
         WHERE id = ? AND revoked_at IS NULL`,
      ).run(revokedAt, sessionId);
    },
    deleteAccount(userId) {
      db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    },
    createConsent({ userId, provider, purpose, scopes, evidence, expiresAt = null }) {
      const id = randomUUID();
      const grantedAt = nowIso();
      db.prepare(
        `INSERT INTO consents (
          id, user_id, linked_account_id, provider, purpose, scopes_json,
          granted_at, revoked_at, expires_at, evidence
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?)`,
      ).run(
        id,
        userId ?? null,
        provider ?? null,
        purpose,
        JSON.stringify(scopes ?? []),
        grantedAt,
        expiresAt,
        evidence,
      );
      return this.getConsentById(id);
    },
    getConsentById(consentId) {
      const row = db
        .prepare(
          `SELECT id, user_id, linked_account_id, provider, purpose, scopes_json,
                  granted_at, revoked_at, expires_at, evidence
           FROM consents WHERE id = ?`,
        )
        .get(consentId);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        linkedAccountId: row.linked_account_id,
        provider: row.provider,
        purpose: row.purpose,
        scopes: parseJsonArray(row.scopes_json),
        grantedAt: row.granted_at,
        revokedAt: row.revoked_at,
        expiresAt: row.expires_at,
        evidence: row.evidence,
      };
    },
    listActiveConsents(userId, provider) {
      const rows = db
        .prepare(
          `SELECT id, user_id, linked_account_id, provider, purpose, scopes_json,
                  granted_at, revoked_at, expires_at, evidence
           FROM consents
           WHERE user_id = ? AND provider = ?
             AND revoked_at IS NULL
             AND (expires_at IS NULL OR expires_at > ?)
           ORDER BY granted_at DESC`,
        )
        .all(userId, provider, nowIso());

      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        linkedAccountId: row.linked_account_id,
        provider: row.provider,
        purpose: row.purpose,
        scopes: parseJsonArray(row.scopes_json),
        grantedAt: row.granted_at,
        revokedAt: row.revoked_at,
        expiresAt: row.expires_at,
        evidence: row.evidence,
      }));
    },
    revokeConsent(consentId, userId, provider) {
      const revokedAt = nowIso();
      const result = db
        .prepare(
          `UPDATE consents
           SET revoked_at = ?
           WHERE id = ? AND user_id = ? AND provider = ? AND revoked_at IS NULL`,
        )
        .run(revokedAt, consentId, userId, provider);
      return result.changes > 0;
    },
    getProviderState(userId, provider) {
      const row = db
        .prepare(
          `SELECT status
           FROM linked_accounts
           WHERE user_id = ? AND provider = ?
           ORDER BY connected_at DESC
           LIMIT 1`,
        )
        .get(userId, provider);

      if (!row) return 'disconnected';
      if (row.status === 'revoked') return 'revoked';
      if (row.status === 'error') return 'error';
      if (row.status === 'active') return 'connected';
      return 'disconnected';
    },
    getLinkedAccount(userId, provider) {
      const row = db
        .prepare(
          `SELECT id, user_id, provider, provider_account_ref, status, scopes_json,
                  token_ciphertext, token_kid, connected_at, revoked_at, error_message
           FROM linked_accounts
           WHERE user_id = ? AND provider = ?
           ORDER BY connected_at DESC
           LIMIT 1`,
        )
        .get(userId, provider);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        providerAccountRef: row.provider_account_ref,
        status: row.status,
        scopes: parseJsonArray(row.scopes_json),
        tokenCiphertext: row.token_ciphertext,
        tokenKid: row.token_kid,
        connectedAt: row.connected_at,
        revokedAt: row.revoked_at,
        errorMessage: row.error_message,
      };
    },
    listLinkedAccountsByUser(userId) {
      const rows = db
        .prepare(
          `SELECT id, user_id, provider, provider_account_ref, status, scopes_json,
                  token_ciphertext, token_kid, connected_at, revoked_at, error_message
           FROM linked_accounts
           WHERE user_id = ?
           ORDER BY connected_at DESC`,
        )
        .all(userId);
      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        providerAccountRef: row.provider_account_ref,
        status: row.status,
        scopes: parseJsonArray(row.scopes_json),
        tokenCiphertext: row.token_ciphertext,
        tokenKid: row.token_kid,
        connectedAt: row.connected_at,
        revokedAt: row.revoked_at,
        errorMessage: row.error_message,
      }));
    },
    upsertLinkedAccount({
      userId,
      provider,
      providerAccountRef = null,
      status = 'active',
      scopes = [],
      tokenCiphertext = null,
      tokenKid = null,
      errorMessage = null,
    }) {
      const existing = this.getLinkedAccount(userId, provider);
      const connectedAt = nowIso();
      if (existing) {
        db.prepare(
          `UPDATE linked_accounts
           SET provider_account_ref = ?, status = ?, scopes_json = ?, token_ciphertext = ?,
               token_kid = ?, connected_at = ?, revoked_at = ?, error_message = ?
           WHERE id = ?`,
        ).run(
          providerAccountRef,
          status,
          JSON.stringify(Array.isArray(scopes) ? scopes : []),
          tokenCiphertext,
          tokenKid,
          connectedAt,
          status === 'active' ? null : nowIso(),
          errorMessage,
          existing.id,
        );
        return this.getLinkedAccount(userId, provider);
      }

      const id = randomUUID();
      db.prepare(
        `INSERT INTO linked_accounts (
          id, user_id, provider, provider_account_ref, status, scopes_json,
          token_ciphertext, token_kid, connected_at, revoked_at, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      ).run(
        id,
        userId,
        provider,
        providerAccountRef,
        status,
        JSON.stringify(Array.isArray(scopes) ? scopes : []),
        tokenCiphertext,
        tokenKid,
        connectedAt,
        errorMessage,
      );
      return this.getLinkedAccount(userId, provider);
    },
    revokeLinkedAccount(userId, provider, errorMessage = null) {
      const result = db
        .prepare(
          `UPDATE linked_accounts
           SET status = 'revoked', revoked_at = ?, token_ciphertext = NULL, error_message = ?
           WHERE id = (
             SELECT id FROM linked_accounts
             WHERE user_id = ? AND provider = ?
             ORDER BY connected_at DESC LIMIT 1
           )`,
        )
        .run(nowIso(), errorMessage, userId, provider);
      return result.changes > 0;
    },
    createContextItem({
      userId,
      sessionId = null,
      sourceType,
      label,
      content,
      origin,
      selected = false,
    }) {
      const id = randomUUID();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO context_items (
          id, user_id, session_id, source_type, label, content, selected, origin, discard_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      ).run(
        id,
        userId,
        sessionId,
        sourceType,
        label,
        content,
        selected ? 1 : 0,
        origin,
        createdAt,
      );
      return {
        id,
        userId,
        sessionId,
        sourceType,
        label,
        content,
        selected,
        origin,
        createdAt,
      };
    },
    listContextItemsByUser(userId) {
      const rows = db
        .prepare(
          `SELECT id, user_id, session_id, source_type, label, content, selected, origin, created_at
           FROM context_items
           WHERE user_id = ?
           ORDER BY created_at DESC`,
        )
        .all(userId);
      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        sessionId: row.session_id,
        sourceType: row.source_type,
        label: row.label,
        content: row.content,
        selected: Boolean(row.selected),
        origin: row.origin,
        createdAt: row.created_at,
      }));
    },
  };
}
