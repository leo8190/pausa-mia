# Deploy reproducible del servidor (OAuth Google)

Este documento deja el backend reproducible sin crear credenciales reales.

## Imagen Docker

```bash
docker build -f server/Dockerfile -t pausa-mia-server .
```

```bash
docker run --rm -p 3001:3001 --env-file .env pausa-mia-server
```

Healthcheck incluido: `GET /api/health` con `Origin` permitido.

## Variables obligatorias para OAuth Google

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI_CALENDAR`
- `GOOGLE_OAUTH_REDIRECT_URI_DRIVE`
- `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY` (32 bytes base64 o 64 hex)
- `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KID` (recomendado; default `local-key-v1`)

Sin esas variables, `google_calendar` y `google_drive` quedan no configurados.
`social_networks` permanece no configurado por diseño.

## Redirect URI esperadas

Registrar en Google Cloud Console exactamente las URI de callback del backend:

- Calendar: `https://<tu-dominio>/api/connectors/google_calendar/oauth/callback`
- Drive: `https://<tu-dominio>/api/connectors/google_drive/oauth/callback`

Para local:

- `http://127.0.0.1:3001/api/connectors/google_calendar/oauth/callback`
- `http://127.0.0.1:3001/api/connectors/google_drive/oauth/callback`

## Flujo implementado (backend)

1. `POST /api/connectors/:provider/consents` guarda consentimiento explícito con scopes.
2. `POST /api/connectors/:provider/oauth/start` valida consentimiento activo y devuelve `authorizationUrl`.
3. Google redirige a `/oauth/callback` con `code` + `state`.
4. El backend hace el intercambio de código en servidor con PKCE.
5. Tokens se guardan cifrados con AES-256-GCM en `linked_accounts`.
6. `POST /api/connectors/:provider/oauth/revoke` revoca token en Google y limpia secreto local.

El backend nunca devuelve `access_token`, `refresh_token` ni secretos de cliente al navegador.
