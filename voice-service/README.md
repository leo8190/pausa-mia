# Servicio remoto opcional — voz argentina (Piper `es_AR-daniela-high`)

Endpoint HTTP pequeño para sintetizar texto a `audio/wav` cuando el motor Piper
**local en el navegador** no es compatible o falla. El frontend nunca lo usa en
silencio: requiere `VITE_ARGENTINE_TTS_ENDPOINT` y un consentimiento explícito.

Este directorio **no despliega nada**. No incluye el modelo ONNX (~114 MB).

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
- `ARG_TTS_BACKEND` — `mock` (WAV silencioso determinístico, sin modelo) o
  `piper` (binario real + modelo).
- `PIPER_BIN`, `PIPER_MODEL_PATH`, `PIPER_CONFIG_PATH` — sólo con `piper`.
- `ARG_MAX_TEXT_CHARS` — límite por request (default 800; alineado al frontend).

## Modelo (no versionado)

Voz: `es_AR-daniela-high` de [`rhasspy/piper-voices`](https://huggingface.co/rhasspy/piper-voices)
(archivos del modelo publicados bajo MIT; revisar `MODEL_CARD` y atribuciones del
dataset).

```bash
cd voice-service
chmod +x scripts/download-model.sh
# Opcional: pin a un commit de Hugging Face
# HF_REVISION=<commit_sha> EXPECTED_ONNX_SHA256=<sha256> ./scripts/download-model.sh
./scripts/download-model.sh
```

Instalá el binario [Piper](https://github.com/rhasspy/piper/releases) en el `PATH`
o apuntá `PIPER_BIN`.

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

Reiniciá `npm run dev`. En `PlaybackStep` (es-AR), si Piper local falla o el
navegador no soporta WASM/ONNX, aparecerá la opción remota con casilla de
consentimiento **desmarcada**. Sólo entonces se envía el texto del guion.

## Docker / Fly.io (ejemplo, no desplegado)

- `Dockerfile` — build Node; volumen `/models` para el ONNX (el binario del
  modelo **no** se incluye en la imagen).
- `fly.toml.example` — `shared-cpu-1x`, 512 MB, `auto_stop_machines`,
  `min_machines_running = 0` para reducir costo en reposo.

**Advertencia de costos:** un `fly deploy` real puede generar gasto (máquinas,
volumen, egress, cold starts). Este repo **no despliega**. Copiá el ejemplo,
montá el modelo y el binario Piper, y desplegá sólo con autorización explícita
y tras revisar la factura estimada de Fly.

## Límites y salud

- Texto máx. `ARG_MAX_TEXT_CHARS` (default 800) y cuerpo HTTP ≤ 16 KiB.
- CORS: sólo orígenes en `ARG_ALLOWED_ORIGINS` (sin Origin, p. ej. `curl`, se
  permite para pruebas locales).
- `GET /health` — `{ ok, backend, maxTextChars }` sin síntesis.
- Backend `mock`: WAV silencioso determinístico (tests / sin modelo).
- Backend `piper`: requiere binario + `es_AR-daniela-high` descargado a mano.

## Privacidad

El servicio sólo debe recibir el texto del guion. No persistir cuerpos por
defecto. CORS restringe orígenes. El frontend no envía diario, perfil ni fuentes.
