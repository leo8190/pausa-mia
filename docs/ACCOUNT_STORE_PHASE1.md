# Account Store Phase 1 (Local)

Fecha: 2026-08-19

Esta fase implementa cuenta/sesión local en servidor Node sin credenciales reales ni
OAuth en producción.

## Motor de persistencia

- Preferido: SQLite local (`node:sqlite`) con esquema en `server/store/schema.sql`.
- Fallback portable: JSON local (`server/store/jsonStore.mjs`) para runtimes sin
  `node:sqlite`.
- Selección en runtime: `server/store/createStore.mjs`.

## Contrato de store

`createAccountStore()` expone un contrato mínimo usado por `accountServer`:

- `createUser`, `getUserById`, `findActiveUserById`
- `createSession`, `getSessionByTokenHash`, `revokeSessionByTokenHash`
- `createConsent`, `listActiveConsents`, `revokeConsent`
- `createContextItem`, `listContextItemsByUser`
- `getProviderState`, `deleteAccount`, `close`

Este contrato desacopla HTTP de almacenamiento para reemplazar local store por
Postgres en la siguiente fase.

## Sustitución por Postgres (siguiente fase)

1. Crear `server/store/postgresStore.mjs` implementando el mismo contrato.
2. Mapear `schema.sql` a migraciones SQL de Postgres (tablas: `users`, `sessions`,
   `consents`, `linked_accounts`, `context_items`).
3. Cambiar `createStore` para elegir Postgres cuando exista `DATABASE_URL`.
4. Mantener hashing de `loginSecret` y de token de sesión en capa de servidor.
5. Mantener cookies `HttpOnly + SameSite` y no exponer secretos al frontend.

## Estado de conectores

Se incorpora un contrato provider-neutral (`server/connectors.mjs`) para:

- `google_calendar`
- `google_drive`
- `social_networks`

Estados visibles: `disconnected`, `connected`, `revoked`, `error`.

Las rutas `connect/revoke` devuelven `CONNECTOR_NOT_CONFIGURED` hasta que existan
credenciales reales y flujo OAuth autorizado.
