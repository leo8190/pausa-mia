# Servicio remoto opcional — voz argentina (Piper `es_AR-daniela-high`)

Endpoint HTTP pequeño para sintetizar texto a `audio/wav`. El frontend lo ofrece
como alternativa opt-in a descargar el modelo Piper local (WAV estándar). Nunca
lo usa en silencio: requiere `VITE_ARGENTINE_TTS_ENDPOINT` y un consentimiento
explícito.

Este directorio **no despliega nada**. El modelo ONNX (~114 MB) no se versiona
en Git; la imagen Docker lo descarga en el build.

## Endpoints

| Método | Ruta       | Respuesta                                      |
| ------ | ---------- | ---------------------------------------------- |
| GET    | `/health`  | JSON `{ ok, backend, maxTextChars }`           |
| POST   | `/v1/tts`  | Cuerpo JSON `{ "text": "..." }` → `audio/wav`  |

Errores: JSON `{ "error", "code" }` con 4xx/5xx.

## Variables de entorno

Ver `.env.example`.

- `ARG_ALLOWED_ORIGINS` — lista coma-separada de orígenes CORS (p. ej. el Vite
  local). Sin coincidencia → 403.
- `ARG_REQUIRE_ORIGIN` — `true` exige header `Origin` (sin `Origin` → 403). Default
  `false` para desarrollo/tests locales.
- `ARG_TTS_BACKEND` — `mock` (WAV silencioso determinístico, sin modelo) o
  `piper` (binario real + modelo).
- `PIPER_BIN`, `PIPER_MODEL_PATH`, `PIPER_CONFIG_PATH` — sólo con `piper`.
- `ARG_MAX_TEXT_CHARS` — límite por request (default 800; alineado al frontend).
- `ARG_TTS_RATE_LIMIT_PER_MINUTE` — límite por cliente para `POST /v1/tts`
  (ventana de 1 minuto, default 30). Exceso → `429` + `Retry-After`.

Build de imagen (no es runtime): `HF_REVISION` (default `main`) pinnea el
commit de [`rhasspy/piper-voices`](https://huggingface.co/rhasspy/piper-voices).

## Modelo (no versionado)

Voz: `es_AR-daniela-high` de [`rhasspy/piper-voices`](https://huggingface.co/rhasspy/piper-voices)
(archivos del modelo publicados bajo MIT; revisar `MODEL_CARD` y atribuciones del
dataset).

Local (sin Docker):

```bash
cd voice-service
chmod +x scripts/download-model.sh
# Opcional: pin a un commit de Hugging Face
# HF_REVISION=<commit_sha> EXPECTED_ONNX_SHA256=<sha256> ./scripts/download-model.sh
./scripts/download-model.sh
```

Instalá el binario [Piper](https://github.com/rhasspy/piper/releases) o
`pip install piper-tts==1.6.0` y dejá `piper` en el `PATH`, o apuntá `PIPER_BIN`.

## Ejecución local

```bash
cd voice-service
npm install
cp .env.example .env   # ARG_TTS_BACKEND=mock para probar sin modelo
npm test
npm run dev            # http://127.0.0.1:8787
```

Con Piper real:

```bash
# .env
ARG_TTS_BACKEND=piper
PIPER_MODEL_PATH=./models/es_AR-daniela-high.onnx
PIPER_CONFIG_PATH=./models/es_AR-daniela-high.onnx.json
ARG_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
npm run dev
```

Prueba rápida:

```bash
curl -sS http://127.0.0.1:8787/health
curl -sS -X POST http://127.0.0.1:8787/v1/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Respirá despacio."}' \
  -o /tmp/out.wav
file /tmp/out.wav
```

## Frontend

En la raíz del prototipo:

```bash
# .env
VITE_ARGENTINE_TTS_ENDPOINT=http://127.0.0.1:8787
```

Reiniciá `npm run dev`. En `PlaybackStep` (es-AR), con el endpoint configurado,
la alternativa remota aparece junto a Piper local (Piper primero; casilla de
consentimiento **desmarcada**; el botón sigue deshabilitado hasta marcarla).
Sin endpoint, el aviso de configuración faltante aparece sólo si Piper local
falla o el navegador no soporta WASM/ONNX. Sólo tras consentimiento se envía
el texto del guion.

## Docker / Fly.io

Instancia pública activa (no desplegada por este repo):
`https://pausa-mia-voz-ar.fly.dev`. El frontend publicado apunta ahí y sólo
envía texto del guion tras consentimiento. Autostop/costo: cold start posible;
máquina y egress facturan. No modificar secretos ni redesplegar desde aquí.

- `Dockerfile` — Node + `piper-tts==1.6.0` (CLI `piper`) + descarga de
  `es_AR-daniela-high` / `.onnx.json` a `/models` en el build (`ARG HF_REVISION`,
  default `main`). Imagen autosuficiente; sin volumen. Destinada a linux/amd64
  (Fly shared-cpu). El servicio spawnea `piper --model --config --output_raw`.
- `fly.toml.example` — **ejemplo** de `shared-cpu-1x`, **1GB**,
  `auto_stop_machines`, `min_machines_running = 0`. Copiá a `fly.toml`; no es
  configuración activa de este repo.

**Advertencia de costos:** un `fly deploy` real puede generar gasto (máquinas,
egress, cold starts). Este repo **no despliega**. Copiá el ejemplo y desplegá
sólo con autorización explícita y tras revisar la factura estimada de Fly.

## Límites y salud

- Texto máx. `ARG_MAX_TEXT_CHARS` (default 800) y cuerpo HTTP ≤ 16 KiB.
- CORS: sólo orígenes en `ARG_ALLOWED_ORIGINS`. Con `ARG_REQUIRE_ORIGIN=true`,
  requests sin `Origin` también se rechazan con 403.
- Rate limit en memoria para `POST /v1/tts` por cliente (`fly-client-ip`,
  `x-forwarded-for`, fallback `remoteAddress`) con `ARG_TTS_RATE_LIMIT_PER_MINUTE`
  (default 30/min). No aplica a `GET /health` ni a `OPTIONS`.
- `GET /health` — `{ ok, backend, maxTextChars }` sin síntesis.
- Backend `mock`: WAV silencioso determinístico (tests / sin modelo).
- Backend `piper`: CLI `piper` + `es_AR-daniela-high` (en Docker, ya en `/models`).

## Privacidad

El servicio sólo debe recibir el texto del guion. No persistir cuerpos por
defecto. CORS restringe orígenes. El frontend no envía diario, perfil ni fuentes.
