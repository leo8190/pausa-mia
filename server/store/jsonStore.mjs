import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

function nowIso() {
  return new Date().toISOString();
}

function emptyState() {
  return {
    users: [],
    sessions: [],
    consents: [],
    linkedAccounts: [],
    contextItems: [],
  };
}

function isNotExpired(record) {
  return !record.expiresAt || record.expiresAt > nowIso();
}

export function createJsonStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  let state = emptyState();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8'));
      state = { ...emptyState(), ...parsed };
    } catch {
      state = emptyState();
    }
  }

  function persist() {
    const tempPath = `${path}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tempPath, path);
  }

  function mapUser(user) {
    return user ? { ...user } : null;
  }

  return {
    kind: 'json',
    close() {},
    createUser({
      displayName = null,
      locale = 'es-AR',
      loginSecretHash,
      loginSecretSalt,
    }) {
      const user = {
        id: randomUUID(),
        createdAt: nowIso(),
        displayName,
        locale,
        status: 'active',
        deletedAt: null,
        loginSecretHash,
        loginSecretSalt,
      };
      state.users.push(user);
      persist();
      return mapUser(user);
    },
    getUserById(id) {
      return mapUser(state.users.find((user) => user.id === id));
    },
    findActiveUserById(id) {
      const user = state.users.find(
        (entry) => entry.id === id && entry.status === 'active' && !entry.deletedAt,
      );
      return mapUser(user);
    },
    createSession({ userId, tokenHash, expiresAt }) {
      const session = {
        id: randomUUID(),
        userId: userId ?? null,
        createdAt: nowIso(),
        expiresAt,
        revokedAt: null,
        tokenHash,
      };
      state.sessions.push(session);
      persist();
      return { ...session };
    },
    getSessionByTokenHash(tokenHash) {
      const session = state.sessions.find((entry) => entry.tokenHash === tokenHash);
      return session ? { ...session } : null;
    },
    revokeSessionByTokenHash(tokenHash) {
      const session = state.sessions.find((entry) => entry.tokenHash === tokenHash);
      if (session && !session.revokedAt) {
        session.revokedAt = nowIso();
        persist();
      }
    },
    revokeSessionById(sessionId) {
      const session = state.sessions.find((entry) => entry.id === sessionId);
      if (session && !session.revokedAt) {
        session.revokedAt = nowIso();
        persist();
      }
    },
    deleteAccount(userId) {
      state.users = state.users.filter((entry) => entry.id !== userId);
      state.sessions = state.sessions.filter((entry) => entry.userId !== userId);
      state.linkedAccounts = state.linkedAccounts.filter(
        (entry) => entry.userId !== userId,
      );
      state.consents = state.consents.filter((entry) => entry.userId !== userId);
      state.contextItems = state.contextItems.filter(
        (entry) => entry.userId !== userId,
      );
      persist();
    },
    createConsent({ userId, provider, purpose, scopes, evidence, expiresAt = null }) {
      const consent = {
        id: randomUUID(),
        userId: userId ?? null,
        linkedAccountId: null,
        provider: provider ?? null,
        purpose,
        scopes: Array.isArray(scopes) ? scopes : [],
        grantedAt: nowIso(),
        revokedAt: null,
        expiresAt,
        evidence,
      };
      state.consents.push(consent);
      persist();
      return { ...consent };
    },
    getConsentById(consentId) {
      const consent = state.consents.find((entry) => entry.id === consentId);
      return consent ? { ...consent } : null;
    },
    listActiveConsents(userId, provider) {
      return state.consents
        .filter(
          (entry) =>
            entry.userId === userId &&
            entry.provider === provider &&
            !entry.revokedAt &&
            isNotExpired(entry),
        )
        .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))
        .map((entry) => ({ ...entry }));
    },
    revokeConsent(consentId, userId, provider) {
      const consent = state.consents.find(
        (entry) =>
          entry.id === consentId &&
          entry.userId === userId &&
          entry.provider === provider &&
          !entry.revokedAt,
      );
      if (!consent) return false;
      consent.revokedAt = nowIso();
      persist();
      return true;
    },
    getProviderState(userId, provider) {
      const linked = state.linkedAccounts
        .filter((entry) => entry.userId === userId && entry.provider === provider)
        .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt))[0];
      if (!linked) return 'disconnected';
      if (linked.status === 'revoked') return 'revoked';
      if (linked.status === 'error') return 'error';
      if (linked.status === 'active') return 'connected';
      return 'disconnected';
    },
    getLinkedAccount(userId, provider) {
      const linked = state.linkedAccounts
        .filter((entry) => entry.userId === userId && entry.provider === provider)
        .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt))[0];
      return linked ? { ...linked } : null;
    },
    listLinkedAccountsByUser(userId) {
      return state.linkedAccounts
        .filter((entry) => entry.userId === userId)
        .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt))
        .map((entry) => ({ ...entry }));
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
      const existing = state.linkedAccounts
        .filter((entry) => entry.userId === userId && entry.provider === provider)
        .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt))[0];
      const linked = existing ?? {
        id: randomUUID(),
        userId,
        provider,
        connectedAt: nowIso(),
      };
      Object.assign(linked, {
        providerAccountRef,
        status,
        scopes: Array.isArray(scopes) ? scopes : [],
        tokenCiphertext,
        tokenKid,
        connectedAt: nowIso(),
        revokedAt: status === 'active' ? null : nowIso(),
        errorMessage,
      });
      if (!existing) state.linkedAccounts.push(linked);
      persist();
      return { ...linked };
    },
    revokeLinkedAccount(userId, provider, errorMessage = null) {
      const linked = state.linkedAccounts
        .filter((entry) => entry.userId === userId && entry.provider === provider)
        .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt))[0];
      if (!linked) return false;
      linked.status = 'revoked';
      linked.revokedAt = nowIso();
      linked.tokenCiphertext = null;
      linked.errorMessage = errorMessage;
      persist();
      return true;
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
      const contextItem = {
        id: randomUUID(),
        userId,
        sessionId,
        sourceType,
        label,
        content,
        selected: Boolean(selected),
        origin,
        createdAt: nowIso(),
      };
      state.contextItems.push(contextItem);
      persist();
      return { ...contextItem };
    },
    listContextItemsByUser(userId) {
      return state.contextItems
        .filter((entry) => entry.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((entry) => ({ ...entry }));
    },
  };
}
