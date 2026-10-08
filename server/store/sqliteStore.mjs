import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { FUNNEL_RETENTION_DAYS, FUNNEL_RUN_HOURS } from '../funnel.mjs';

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

export async function createSqliteStore(dbPath, options = {}) {
  // Load at runtime through Node's resolver so Vitest/Vite do not rewrite this import.
  const sqlite = require(`node:${'sqlite'}`);
  const { DatabaseSync } = sqlite;
  if (options.requireExisting) {
    // Check metadata read-only before running migrations: a valid SQLite file
    // from another application must not become a new empty Pausa Mía database.
    const original = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const required = {
        users: ['id', 'locale', 'status', 'login_secret_hash', 'login_secret_salt'],
        sessions: ['id', 'user_id', 'expires_at', 'revoked_at', 'token_hash'],
        linked_accounts: ['id', 'user_id', 'provider', 'token_ciphertext', 'token_kid'],
        consents: ['id', 'user_id', 'provider', 'scopes_json', 'revoked_at'],
        context_items: ['id', 'user_id', 'source_type', 'content', 'origin'],
      };
      const tables = new Set(
        original
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => row.name),
      );
      for (const [table, fields] of Object.entries(required)) {
        if (!tables.has(table)) throw new Error('ACCOUNT_DB_UNEXPECTED_SCHEMA');
        const columns = new Set(
          original
            .prepare(`PRAGMA table_info(${table})`)
            .all()
            .map((row) => row.name),
        );
        if (!fields.every((field) => columns.has(field)))
          throw new Error('ACCOUNT_DB_UNEXPECTED_SCHEMA');
      }
    } finally {
      original.close();
    }
  }
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(readFileSync(schemaPath, 'utf-8'));
  db.exec('PRAGMA foreign_keys = ON;');
  // Startup-only additive migration. Historical events retain missing timing as NULL.
  db.exec('BEGIN IMMEDIATE');
  try {
    const hasElapsedMs = db
      .prepare('PRAGMA table_info(funnel_events)')
      .all()
      .some((column) => column.name === 'elapsed_ms');
    if (!hasElapsedMs) {
      db.exec(
        'ALTER TABLE funnel_events ADD COLUMN elapsed_ms INTEGER CHECK (elapsed_ms IS NULL OR (elapsed_ms >= 0 AND elapsed_ms <= 300000))',
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }

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

  function purgeFunnel(at = nowIso()) {
    const cutoff = new Date(
      Date.parse(at) - FUNNEL_RETENTION_DAYS * 86_400_000,
    ).toISOString();
    db.prepare('DELETE FROM funnel_runs WHERE created_at < ?').run(cutoff);
  }

  purgeFunnel();

  return {
    kind: 'sqlite',
    close() {
      db.close();
    },
    recordFunnelEvent({
      runHash,
      event,
      source,
      qa = false,
      elapsedMs = null,
      at = nowIso(),
    }) {
      purgeFunnel(at);
      if (event === 'entry') {
        const expiresAt = new Date(
          Date.parse(at) + FUNNEL_RUN_HOURS * 3_600_000,
        ).toISOString();
        db.prepare(
          `INSERT OR IGNORE INTO funnel_runs
           (run_hash, source, qa, created_at, expires_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, NULL)`,
        ).run(runHash, source, qa ? 1 : 0, at, expiresAt);
      }
      const run = db
        .prepare('SELECT expires_at, revoked_at FROM funnel_runs WHERE run_hash = ?')
        .get(runHash);
      if (!run || run.revoked_at || at >= run.expires_at) return 'gone';
      const written = db
        .prepare(
          `INSERT OR IGNORE INTO funnel_events
           (run_hash, event_name, day_utc, created_at, elapsed_ms) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(runHash, event, at.slice(0, 10), at, elapsedMs);
      return written.changes === 1 ? 'stored' : 'duplicate';
    },
    revokeFunnelRun(runHash, at = nowIso()) {
      purgeFunnel(at);
      db.exec('BEGIN IMMEDIATE');
      try {
        const expiresAt = new Date(
          Date.parse(at) + FUNNEL_RUN_HOURS * 3_600_000,
        ).toISOString();
        db.prepare(
          `INSERT INTO funnel_runs
           (run_hash, source, qa, created_at, expires_at, revoked_at)
           VALUES (?, 'unattributed', 1, ?, ?, ?)
           ON CONFLICT(run_hash) DO UPDATE SET revoked_at = excluded.revoked_at`,
        ).run(runHash, at, expiresAt, at);
        db.prepare('DELETE FROM funnel_events WHERE run_hash = ?').run(runHash);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    getFunnelReport(at = nowIso()) {
      purgeFunnel(at);
      return db
        .prepare(
          `SELECT e.day_utc AS dayUtc, r.source, e.event_name AS event,
                  COUNT(*) AS count
           FROM funnel_events e JOIN funnel_runs r ON r.run_hash = e.run_hash
           WHERE r.qa = 0 AND r.revoked_at IS NULL
           GROUP BY e.day_utc, r.source, e.event_name
           ORDER BY e.day_utc, r.source, e.event_name`,
        )
        .all();
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
    recordUniqueVisitor(visitorHash) {
      if (typeof visitorHash !== 'string' || visitorHash.length === 0) {
        return { isNew: false };
      }
      const existing = db
        .prepare(
          `SELECT visitor_hash, first_seen_at FROM unique_visitors WHERE visitor_hash = ?`,
        )
        .get(visitorHash);
      if (existing) {
        return { isNew: false, firstSeenAt: existing.first_seen_at };
      }
      const firstSeenAt = nowIso();
      db.prepare(
        `INSERT INTO unique_visitors (visitor_hash, first_seen_at) VALUES (?, ?)`,
      ).run(visitorHash, firstSeenAt);
      return { isNew: true, firstSeenAt };
    },
    countUniqueVisitors() {
      const row = db.prepare(`SELECT COUNT(*) AS total FROM unique_visitors`).get();
      return Number(row?.total ?? 0);
    },
    recordProductEvent(eventName, visitorHash) {
      if (
        typeof eventName !== 'string' ||
        eventName.length === 0 ||
        typeof visitorHash !== 'string' ||
        visitorHash.length === 0
      ) {
        return null;
      }
      const createdAt = nowIso();
      const result = db
        .prepare(
          `INSERT INTO product_events (event_name, visitor_hash, created_at) VALUES (?, ?, ?)`,
        )
        .run(eventName, visitorHash, createdAt);
      return {
        id: Number(result.lastInsertRowid),
        eventName,
        visitorHash,
        createdAt,
      };
    },
    countProductEvents(eventName) {
      if (typeof eventName !== 'string' || eventName.length === 0) return 0;
      const row = db
        .prepare(`SELECT COUNT(*) AS total FROM product_events WHERE event_name = ?`)
        .get(eventName);
      return Number(row?.total ?? 0);
    },
  };
}
