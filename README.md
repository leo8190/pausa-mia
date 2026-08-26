# Meditación a Medida

Prototipo web local, en español, que convierte un cuestionario breve y fuentes de
contexto opcionales en una meditación guiada reproducible como audio.

Proyecto separado del canal de YouTube **Mapa de la Meditación**.

## Objetivo de esta fase

Validar si una persona completa un check-in breve, recibe una meditación guiada
realmente personal y estaría dispuesta a pagar por repetir la experiencia.

## Requisitos

- Node.js 18+
- npm 9+

## Comandos

```bash
# Instalar dependencias
npm install

# Desarrollo local (solo frontend)
npm run dev

# Desarrollo con servidor IA local (opcional)
npm run server          # terminal 1
npm run dev             # terminal 2

# Formato
npm run format
npm run format:check

# Análisis estático
npm run lint

# Pruebas (unitarias + flujo React)
npm test

# Compilación de producción
npm run build

# Vista previa del build
npm run preview

# Auditoría de dependencias de producción
npm audit --omit=dev
```

## Flujo implementado

1. **Bienvenida y límites** — bienestar general, no terapia; sin persistencia por defecto.
2. **Consentimiento** — casillas no preseleccionadas; procesamiento sólo con permiso explícito.
3. **Check-in** — momento, estado, intención, experiencia, estilo, duración (3/5/10), voz.
4. **Contexto opcional** — diario manual (hoy/ayer/anteayer), importación local múltiple de texto/JSON/CSV y arrastrar/soltar.
5. **Resumen editable** — quitar cualquier dato; elegir motor local o IA.
6. **Consentimiento IA** — si se elige IA, mostrar campos exactos a transmitir.
7. **Generación** — motor local por reglas o IA vía servidor local con fallback.
8. **Pausa de seguridad** — detector conservador; línea Argentina **0800-999-0091**.
9. **Revisión** — título, motor usado, duración estimada y texto completo.
10. **Reproducción** — voz argentina neuronal real (Piper/ONNX) para es-AR, con
    ruta remota opcional (WAV) tras consentimiento explícito, o fallback a Web
    Speech; Web Speech directo para español neutro.
11. **Cierre** — valoración, repetición deseada y precios hipotéticos (sin checkout).
12. **Borrado** — limpia sesión, preferencias locales y cancela audio en curso;
    muestra confirmación explícita (“Borrado confirmado”) sin dejar check-in,
    diario ni guion en pantalla.

## Arquitectura

```
src/
├── components/          # Pasos del flujo UI
├── hooks/               # useSession, useSpeechPlayer (Web Speech, es-neutro),
│                        # useArgentineVoicePlayer (voz neuronal es-AR local o remota),
│                        # useLocalFileDrop (arrastrar/soltar sin subir archivos)
├── lib/
│   ├── aiTransmissionPayload.ts # Payload mínimo único para vista previa y envío IA
│   ├── checkInSummary.ts        # Valores de resumen sin dependencia circular
│   ├── scriptEngine.ts       # Motor local + validación de calidad
│   ├── scriptProvider.ts     # Interfaz ScriptProvider (local + IA)
│   ├── contextSources.ts     # Diario manual e importación local
│   ├── preferencesStorage.ts # Solo variante, duración y estilo
│   ├── durationEstimator.ts  # Estimación por palabras + pausas
│   ├── situationReference.ts # Referencia breve sin citar literalmente
│   ├── safetyDetector.ts     # Pausa de seguridad
│   ├── voiceService.ts       # Selección de voz Web Speech (sin falsos es-AR)
│   ├── voiceEngine.ts        # Descarga/caché del modelo es-AR y punto único de síntesis
│   ├── piperEngine.ts        # Inferencia Piper real (fonemizador + ONNX Runtime Web + WAV)
│   ├── remoteVoiceService.ts # Cliente POST /v1/tts (vacío en local; Fly en Pages)
│   ├── onlineConnector.ts    # Estado honesto de conectores/OAuth en frontend
│   ├── speechController.ts   # Cancelación global de audio
│   └── session.ts            # Estado de sesión en memoria
├── types/
└── __tests__/           # Unitarias + flujo React

server/
├── core.mjs             # Validadores puros IA (sin escuchar puerto)
├── accountServer.mjs    # Endpoints de cuenta/sesión/conectores + OAuth Google
├── accountAuth.mjs      # Hash de secretos y cookies HttpOnly de sesión
├── connectors.mjs       # Contrato provider-neutral + adaptadores no configurados
├── store/
│   ├── createStore.mjs  # Selección SQLite preferente, fallback JSON portable
│   ├── schema.sql       # Migración/esquema inicial local
│   ├── sqliteStore.mjs  # Implementación SQLite
│   └── jsonStore.mjs    # Implementación local portable (fallback)
└── index.mjs            # Entrypoint del servidor local

voice-service/           # Servicio Piper es-AR; instancia pública en Fly (autostop)
```

## Modos de generación

| Modo      | Descripción                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local** | Siempre disponible. Reglas determinísticas, sin red ni claves.                                                                                                                                                                                                                                         |
| **IA**    | Requiere `npm run server` con `.env` configurado. Consentimiento independiente. Payload mínimo (`operational`, `personal`, `context`) idéntico en vista previa, detalle JSON y solicitud; sin consentimientos en el cuerpo. Fallback local si falla. **Experimental** hasta prueba con proveedor real. |

Copiar `.env.example` a `.env` para probar IA. Sin `OPENAI_API_KEY`, el modo IA queda desactivado.

## Cuentas y sesión (fase local)

El modo invitado se mantiene como camino por defecto. Esta fase agrega cuenta opcional,
sesión server-side local y OAuth Google para `google_calendar` y `google_drive`
(con `social_networks` explícitamente no configurado).

- Persistencia local: SQLite (`server/data/app.db`) cuando `node:sqlite` está
  disponible; fallback JSON portable (`server/data/app-store.json`) si no.
- `server/data/` y archivos de store local se excluyen del repo vía `.gitignore`;
  nunca se versionan.
- Sesiones: cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, expiración 7 días y token
  aleatorio hasheado en store.
- No se guardan secretos en `VITE_*`, ni se exponen credenciales en respuestas.

### Endpoints de cuenta/sesión

- `POST /api/account/register` — crea cuenta opcional y abre sesión.
- `POST /api/account/login` — inicia sesión para una cuenta existente.
- `POST /api/account/logout` — cierra sesión y limpia cookie.
- `DELETE /api/account` — borra cuenta y datos asociados.
- `GET /api/account/status` — estado actual (`guest` o `account`).

### Endpoints de conectores (provider-neutral)

- `GET /api/connectors/providers` — catálogo con estado por proveedor.
- `GET /api/connectors/:provider/status` — estado `disconnected/connected/revoked/error`.
- `POST /api/connectors/:provider/consents` — guarda consentimiento por proveedor.
- `GET /api/connectors/:provider/consents` — lista consentimientos activos.
- `DELETE /api/connectors/:provider/consents/:consentId` — revoca consentimiento.
- `POST /api/connectors/:provider/oauth/start` — inicia OAuth Google con PKCE,
  `state` anti-CSRF de un solo uso y expiración (requiere consentimiento previo).
- `GET /api/connectors/:provider/oauth/callback` — intercambio de `code` sólo en
  backend; nunca expone tokens al navegador.
- `POST /api/connectors/:provider/oauth/revoke` — revoca token en Google y limpia
  secretos locales.
- `POST /api/connectors/:provider/connect` y `.../revoke` — rutas legacy; para
  Google responden `USE_OAUTH_START` / `USE_OAUTH_REVOKE`.

Proveedores incluidos en el contrato inicial: `google_calendar`, `google_drive`,
`social_networks`.

### UI de conectores para cuenta autenticada

En la pantalla de bienvenida (`AccountPanel`), cuando hay sesión autenticada:

- Se muestran `google_calendar` y `google_drive` con estado visible:
  - `connected` -> "Conectada"
  - `disconnected`/`revoked`/`error` -> "Desconectada"
  - `configured=false` -> "No configurado"
- La conexión exige consentimiento explícito por proveedor (casilla desmarcada).
- Antes de abrir Google se registra consentimiento por API:
  `POST /api/connectors/:provider/consents` (propósito + scopes + evidencia).
- Después se llama `POST /api/connectors/:provider/oauth/start` y se abre
  `authorizationUrl` en una pestaña nueva.
- El frontend nunca maneja tokens OAuth ni secretos.

### Variables de entorno nuevas (servidor)

- `ACCOUNT_DB_PATH` — ruta SQLite local.
- `ACCOUNT_STORE_ENGINE` — `json` para forzar fallback portable.
- `ACCOUNT_STORE_JSON_PATH` — ruta del store JSON fallback.
- `ACCOUNT_ALLOWED_ORIGINS` — lista separada por comas para CORS en
  `/api/account*`, `/api/connectors*`, `/api/visit`, `/api/visitors/count`,
  `/api/health` y `/api/generate-script`.
  Si queda vacía usa sólo localhost/127.0.0.1 (puertos 5173/4173). Con cookies
  (`credentials`), `*` se rechaza por seguridad. En Fly el origen publicado es
  `https://leo8190.github.io` (la app vive en `/pausa-mia`).
- `SESSION_PEPPER` — **obligatorio y fuerte en producción/deploy** (mínimo 32
  caracteres con diversidad). En desarrollo/test, si falta o es débil, el servidor
  genera uno efímero con warning y nunca imprime su valor. También se usa para
  hashear el id anónimo del contador de visitantes.
- `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` — credenciales OAuth
  sólo en backend.
- `GOOGLE_OAUTH_REDIRECT_URI_CALENDAR` y `GOOGLE_OAUTH_REDIRECT_URI_DRIVE` — URI de
  callback por proveedor.
- `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY` — clave para cifrado autenticado AES-256-GCM
  de tokens en reposo (`linked_accounts.token_ciphertext`).
- `GOOGLE_OAUTH_TOKEN_ENCRYPTION_KID` — identificador de clave para rotación.

### Deploy del servidor

- Docker reproducible: `server/Dockerfile` (incluye `HEALTHCHECK` sobre
  `/api/health`).
- Guía y redirect URI: `docs/SERVER_OAUTH_DEPLOYMENT.md`.

### Variable de entorno opcional (frontend cuentas)

- `VITE_ACCOUNT_API_URL` — backend de cuentas opcional para frontend (`http(s)` sin
  credenciales embebidas). Si queda vacío, el cliente usa rutas relativas
  (`/api/...`) en el mismo origen. En el sitio publicado apunta a
  `https://pausa-mia-api.fly.dev` y también recibe el ping de visitantes únicos.

### Contador first-party de visitantes únicos

Sin GA/Plausible/Mixpanel ni copy de marketing. Al cargar la app, el cliente genera
(o reutiliza) un UUID anónimo en `localStorage` (`pausa-mia-vid`) y hace
`POST /api/visit` con `{ id }` hacia el API allowlisteado. El servidor guarda sólo
`SHA-256(pepper:id)` en `unique_visitors`; no registra IP, nombres ni contenido de
meditación. El modo demo sin API falla en silencio.

Leer el total (ops; Origin opcional como health; orígenes ajenos → 403):

```bash
curl -sS https://pausa-mia-api.fly.dev/api/visitors/count
# {"uniqueVisitors":N}
```

Con origen allowlisted:

```bash
curl -sS -H 'Origin: https://leo8190.github.io' \
  https://pausa-mia-api.fly.dev/api/visitors/count
```

No inventar ni copiar números de visitas: el valor válido es el que devuelve ese
endpoint (o `COUNT(*)` sobre `unique_visitors` en el volumen Fly `/data/app.db`).

## Motores de voz

La reproducción es independiente del motor de generación del guion. Hay tres motores
de **voz** posibles, evaluados y mostrados en `CheckInStep` y `PlaybackStep` mediante
`voiceEngine.ts` y `VoiceEngineStatus.tsx`:

| Motor                           | Estado                                                       | Cómo funciona                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web Speech API**              | Disponible según navegador/SO                                | Usa las voces instaladas en el dispositivo. Es el único motor para español neutro y el fallback confirmado para es-AR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Neuronal es-AR (Piper/ONNX)** | Real; requiere un gesto explícito ("Preparar voz argentina") | Ejecuta `es_AR-daniela-high` (`rhasspy/piper-voices`, archivos del modelo publicados bajo MIT; revisar también el `MODEL_CARD` y las atribuciones del dataset) enteramente en el navegador: fonemizador Piper (WASM/espeak-ng) + inferencia ONNX Runtime Web + conversión PCM→WAV (`piperEngine.ts`). El modelo (≈114 MB) y su config se descargan sólo al presionar el botón, con progreso visible, y quedan en `Cache Storage` para sesiones futuras. Sobreescribible con `VITE_PIPER_ES_AR_VOICE_URL`/`VITE_PIPER_ES_AR_VOICE_CONFIG_URL` para servir el modelo desde un host propio.                                                            |
| **Remoto es-AR (opcional)**     | Activo en el sitio publicado; nunca automático               | Si `VITE_ARGENTINE_TTS_ENDPOINT` está definido, `PlaybackStep` muestra primero "Usar voz argentina remota" en es-AR (antes que Piper local) para preferir la voz neuronal WAV frente al Web Speech genérico. Opt-in: casilla de consentimiento desmarcada y botón deshabilitado hasta marcarla. Evita descargar el modelo local. El cliente (`remoteVoiceService.ts`) hace `POST { text }` a `VITE_ARGENTINE_TTS_ENDPOINT/v1/tts`. El build de Pages usa `https://pausa-mia-voz-ar.fly.dev`. El servicio (`voice-service/`) usa Piper `es_AR-daniela-high` con `--length_scale` sereno (~1.28; `ARG_TTS_LENGTH_SCALE`). Fly tiene autostop y costo. |

`voiceEngine.getVoiceEngineStatuses()` verifica de forma honesta, en cada dispositivo:

- Si el navegador soporta la Web Speech API (`speechSynthesis`).
- Si el navegador soporta las APIs que un runtime WASM/ONNX necesita (`WebAssembly`,
  `Cache Storage`, `TextDecoder`, `fetch` y `HTMLAudioElement`/`Audio`).
- Si la síntesis neuronal ya produjo realmente un `Blob` de audio **en esta sesión de
  navegador** (`hasVerifiedNeuralVoiceInSession`). Un `HEAD` exitoso al modelo nunca
  alcanza para marcar el motor como "disponible": sólo una inferencia real lo hace.

En `PlaybackStep`, si la variante elegida es es-AR, la interfaz prioriza la voz
neuronal frente al Web Speech del navegador (erres genéricas poco fiables). Con
`VITE_ARGENTINE_TTS_ENDPOINT` configurado, la remota WAV aparece **antes** que
"Preparar voz argentina" local; ambas siguen siendo opt-in. La preparación local
usa `length_scale` × 1.28; el fallback Web Speech es-AR baja rate/pitch y refuerza
`rr` / erre inicial sólo en el texto hablado (el guion visible no cambia). Las
pausas entre frases se alargan un ~12 % en rutas argentinas. Si la preparación o la
reproducción fallan (o el navegador no soporta WASM/ONNX), se muestra el error
explícito y —si hay endpoint— la remota **antes** de "Usar voz del dispositivo
(no es argentina)"; sin endpoint, el aviso de servicio faltante y después la voz
no argentina. Web Speech y el remoto **nunca** se activan automáticamente. Sin
Web Speech (p. ej. español neutro en un navegador sin síntesis), "Reproducir"
queda deshabilitado y aparece "Leer el guion".

Si el navegador bloquea `audio.play()` por una política de autoplay (frecuente en
iOS/Safari), el WAV queda expuesto en un reproductor HTML nativo visible y con un
botón de reintento que requiere un gesto. Así la reproducción no depende de que una
promesa asíncrona conserve el gesto original.

En el check-in y en reproducción también aparece “Compatibilidad de este dispositivo”:
son comprobaciones locales de HTMLAudioElement/WAV, WebAssembly, Cache Storage,
TextDecoder, Web Speech y configuración del endpoint. “Configurado / opt-in” no
significa que el servidor esté disponible; el diagnóstico nunca hace un request ni
incluye guion, diario, perfil o la URL del endpoint. Se puede copiar para comparar
resultados entre celulares y PCs.

### Voz remota (sitio publicado y local)

El sitio publicado incrusta
`VITE_ARGENTINE_TTS_ENDPOINT=https://pausa-mia-voz-ar.fly.dev` en el build de
Pages (`.github/workflows/pages.yml`). Sigue siendo sólo frontend: la UI exige
consentimiento explícito (casilla desmarcada) y, con el endpoint configurado,
muestra la ruta remota en es-AR aunque Piper local esté idle. El servicio recibe
sólo el texto del segmento (`POST /v1/tts`); no diario, perfil ni fuentes.

Esa instancia Fly usa autostop (`min_machines_running = 0`): el primer request
puede tardar por cold start y hay costo de máquina/egress. Este repo no despliega
ni modifica secretos de Fly.

Para desarrollo local (sin tocar el endpoint público):

```bash
# Terminal 1 — servicio (mock sin modelo, o piper con modelo descargado)
cd voice-service && npm install && cp .env.example .env && npm run dev

# Raíz del prototipo — .env
VITE_ARGENTINE_TTS_ENDPOINT=http://127.0.0.1:8787

# Terminal 2
npm run dev
```

Guía de prueba por dispositivo:
`docs/REMOTE_ARGENTINE_VOICE_DEVICE_VERIFICATION.md` (matriz vacía; no asumir
cobertura sin probar). Receta de imagen: `voice-service/README.md` y
`fly.toml.example`.

Independientemente del motor, `voiceService.selectVoice` nunca etiqueta una voz
distinta de `es-AR`/`es_AR` como argentina: si sólo hay `es-MX` u otra variante, el
`fallbackMessage` y el campo `isArgentine: false` lo dejan explícito tanto en la
interfaz como en las pruebas (`voiceService.test.ts`).

## Privacidad y almacenamiento

| Dato                                             | ¿Se guarda?                           | Dónde                                                                        |
| ------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------- |
| Respuestas de sesión (situación, estado, diario) | No por defecto                        | Solo memoria; se borra al cerrar sesión                                      |
| Preferencias (variante, duración, estilo)        | Solo con consentimiento explícito     | `localStorage` del navegador                                                 |
| Transmisión a IA                                 | Solo con consentimiento independiente | Servidor local → proveedor; cuerpo `{ payload }` sin flags de consentimiento |
| Texto del guion a voz remota                     | Solo con consentimiento independiente | `VITE_ARGENTINE_TTS_ENDPOINT` → `POST /v1/tts`; sin diario/perfil/fuentes    |
| Diario completo a IA                             | Nunca                                 | Solo fragmentos seleccionados (máx. 200 chars/campo)                         |
| Coincidencia vista previa / envío                | Sí                                    | Mismo `AiTransmissionPayload`; detalle “Ver datos técnicos exactos”          |

**Borrar sesión** elimina datos en memoria, preferencias guardadas (`mam-saved-preferences`)
y cancela audio activo (Web Speech y el mismo `HTMLAudioElement` de sesión argentina).
La pantalla `Sesión borrada` confirma el resultado con un checklist visible; no es un
reset silencioso.

### Fuentes adicionales

El paso de contexto permite agregar, con selección independiente, archivos locales
exportados por la persona: perfil de Google, calendario de Google, diario/notas y
exportaciones de Instagram, Facebook, X, LinkedIn o TikTok. Se pueden elegir varios
archivos, soltarlos en la zona de importación y, cuando corresponde, leer CSV. Se
interpretan en el navegador, se pueden quitar antes de generar y no se envían a
servidores. Los botones de conexión directa del frontend permanecen deshabilitados por
ahora en este paso; el flujo OAuth real se gestiona desde el panel de cuenta
autenticada en Bienvenida.

### Configuración de producción (frontend)

Variables recomendadas para publicar:

- `VITE_ACCOUNT_API_URL=https://<tu-backend-cuentas>` para cuentas, sesión y conectores.
- `VITE_ARGENTINE_TTS_ENDPOINT=https://<tu-servicio-voz>` para voz es-AR remota opt-in.
- `VITE_BASE_PATH=/` o `/pausa-mia/` según subruta de despliegue.

Ninguna variable `VITE_*` debe incluir secretos (`client_secret`, tokens o claves).

## Pausa de seguridad — Argentina

- Línea nacional: **0800-999-0091** (gratuita, confidencial, 24/7)
- Emergencias inmediatas: **911** o servicios locales
- Fuente oficial: https://www.argentina.gob.ar/node/492429
- No se usa 141 ni 107 como línea general de contención
- No diagnostica ni evalúa riesgo clínico

## Duración estimada

- Ritmo de narración: ~100 palabras/minuto + pausas entre segmentos
- Tolerancia documentada: **±1 minuto** respecto a la duración elegida (3/5/10)
- `estimatedMinutes` se calcula del guion real, no copia la opción elegida

## Verificaciones ejecutadas

| Comando                | Resultado                                                                |
| ---------------------- | ------------------------------------------------------------------------ |
| `npm run format:check` | ✅                                                                       |
| `npm run lint`         | ✅                                                                       |
| `npm test`             | ✅ 203 tests (unitarias + flujo React + servidor mockeado; sin API real) |
| `npm run build`        | ✅                                                                       |
| `voice-service` tests  | ✅ 3 tests (`ARG_TTS_BACKEND=mock`, sin modelo ni deploy)                |
| `npm audit --omit=dev` | (no re-ejecutado en este handoff)                                        |

### Auditoría de motores de voz y modos disponibles (2026-08-19)

- `FutureIntegrations`, `ContextStep`, `scriptProvider`, `AiConsentStep`, `voiceService`
  y `useSpeechPlayer` fueron auditados: las fuentes externas sólo se agregan mediante
  archivos locales con consentimiento por selección y las conexiones OAuth siguen
  desactivadas. `scriptProvider` ya declaraba el motor IA
  como dependiente de un servidor local configurado, con fallback honesto al motor
  local; `SummaryStep` ya deshabilita la opción IA cuando `aiAvailable` es falso.
- Se agregó `voiceEngine.ts` con tres adaptadores explícitos (`web-speech`,
  `neural-piper-es-ar` y `remote-wav-es-ar`) y el panel `VoiceEngineStatusPanel`, visible en el check-in y
  en la reproducción, que reporta disponibilidad real por dispositivo en vez de un
  texto genérico.
- Se agregó el campo `isArgentine` a `VoiceSelection` y la función exportada
  `isArgentineVoice` para que ninguna voz distinta de `es-AR`/`es_AR` pueda
  etiquetarse como argentina, con pruebas dedicadas.
- Se integró la voz neuronal es-AR real (`es_AR-daniela-high`, `rhasspy/piper-voices`,
  archivos del modelo bajo MIT; revisar `MODEL_CARD` para las atribuciones del
  dataset) mediante un adaptador propio (`piperEngine.ts`): fonemizador Piper
  (WASM/espeak-ng, cargado como script clásico), inferencia con ONNX Runtime Web
  (`onnxruntime-web/wasm`) y conversión PCM→WAV en el cliente. Se optó por un
  adaptador propio en vez de `@mintplex-labs/piper-tts-web@1.0.5` porque esa versión
  no incluye `es_AR` en su lista fija de voces y fija la URL del modelo a un espejo de
  terceros (`diffusionstudio/piper-voices`) que, verificado con la API de Hugging Face
  el 2026-08-19, no contiene la carpeta `es/es_AR`. El adaptador acepta cualquier URL
  de modelo `.onnx`/config, con `rhasspy/piper-voices` como valor por defecto
  (confirmado con `HEAD`: 114.199.011 bytes).
- El modelo (≈114 MB) se descarga sólo tras el gesto explícito "Preparar voz
  argentina" en `PlaybackStep`, con progreso visible y caché en `Cache Storage`
  (`loadAndCacheNeuralVoiceModel`). El motor sólo se marca "disponible" después de
  que una síntesis real devuelve un `Blob` de audio en esa sesión de navegador
  (`hasVerifiedNeuralVoiceInSession`); un `HEAD` exitoso nunca es suficiente.
- Si la preparación o la síntesis fallan, `useArgentineVoicePlayer` expone el error
  textual y `PlaybackStep` nunca cae a Web Speech ni al remoto en silencio: Web Speech
  sólo tras "Usar voz del dispositivo (no es argentina)"; remoto sólo tras casilla de
  consentimiento + "Usar voz argentina remota" (visible con `VITE_ARGENTINE_TTS_ENDPOINT`
  configurado aunque Piper local esté idle). Español neutro sigue usando Web Speech
  directamente, sin pasar por Piper.
- Ruta remota: `remoteVoiceService.ts` + modo `remote` en `useArgentineVoicePlayer`
  (HTMLAudioElement + object URLs); si el autoplay es bloqueado, expone controles
  nativos visibles, además de acciones para abrir o descargar el WAV. El chequeo remoto no hace requests automáticos y sólo muestra
  `Opt-in` cuando el endpoint está configurado. Servicio de referencia en
  `voice-service/` (tests con backend `mock`; Piper real documentado, modelo no
  versionado). Verificación por dispositivo:
  `docs/REMOTE_ARGENTINE_VOICE_DEVICE_VERIFICATION.md`.
- Pruebas nuevas: `piperEngine.test.ts` (11 casos: partición de texto en fragmentos,
  codificación WAV/clamping de muestras, descarga con progreso, síntesis con sesión
  ONNX mockeada, incluida la tensor `sid` sólo con `speaker_id_map` no vacío);
  `voiceEngine.test.ts` ampliado (incluye una síntesis neuronal completa de extremo a
  extremo con ONNX Runtime, fonemizador y `fetch` mockeados, que confirma que
  `getVoiceEngineStatuses` sólo pasa a "disponible" tras esa síntesis real); y
  `playbackStep.test.tsx` (alternativa remota visible con endpoint, consentimiento
  requerido y aviso de endpoint ausente sólo tras fallo local). Suite
  frontend: ver tabla de verificaciones arriba.

El modo IA sigue **experimental**: no se ejecutó ninguna llamada real a OpenAI en
esta verificación. Las pruebas de servidor usan `callProvider` mockeado y puerto efímero.
El servidor local valida entrada/salida, restringe orígenes a
`localhost`/`127.0.0.1` en puertos 5173 y 4173 (incluye `/api/health`), limita el
cuerpo a 16 KiB y usa Structured Outputs estrictos cuando el hostname es `api.openai.com`.

### Revisión editorial de casos sintéticos (2026-08-19)

Los cinco casos priorizados de `docs/SCRIPT_EVAL_CASES.md` (1, 2, 3, 8 y 9) se
regeneraron con el motor local: los cinco quedaron **sin segmentos duplicados**,
con el **cierre siempre como los dos últimos segmentos** (sin texto posterior) y
con la **duración estimada dentro de la tolerancia** (±1 minuto) respecto a los 3,
5 o 10 minutos elegidos. Detalle completo en
`docs/LOCAL_SCRIPT_EVALUATION_2026-08-19.md`. La calidad contemplativa subjetiva
sigue pendiente de revisión humana ciega según `docs/SCRIPT_QUALITY_RUBRIC.md`.

## Publicación estática — Pausa Mía

Estado: **publicado y verificado** en
https://leo8190.github.io/pausa-mia/. GitHub Pages publica sólo el frontend estático.
El TTS argentino remoto activo es `https://pausa-mia-voz-ar.fly.dev` (inyectado en
el build; texto del guion sólo tras consentimiento; Fly con autostop/costo).

Lo que quedó listo para publicar el sitio **Pausa Mía** en GitHub Pages:

| Archivo                       | Función                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `vite.config.ts`              | `base` configurable vía `VITE_BASE_PATH`, con `/pausa-mia/` por defecto                               |
| `.gitignore`                  | Excluye `node_modules`, `dist`, `.env`, `*.tsbuildinfo` y artefactos de audio                         |
| `public/.nojekyll`            | Evita que GitHub Pages procese el sitio con Jekyll                                                    |
| `public/manifest.webmanifest` | Manifest instalable (`standalone`, `start_url` `/pausa-mia/`, sin service worker)                     |
| `public/icon.svg`             | Ícono local referencial (sin dependencias externas ni datos personales)                               |
| `.github/workflows/pages.yml` | `npm ci` → `npm run build` (con `VITE_BASE_PATH` y `VITE_ARGENTINE_TTS_ENDPOINT`) → artifact → deploy |

### Base path

El `base` de Vite se toma de `VITE_BASE_PATH` y se normaliza para que siempre tenga
barra inicial y final. Sin variable definida, el build asume `/pausa-mia/`, que
corresponde a un repositorio llamado `pausa-mia` servido en
`https://<usuario>.github.io/pausa-mia/`.

```bash
# Build para otra subruta
VITE_BASE_PATH=/otro-nombre/ npm run build

# Build para dominio propio o raíz del sitio
VITE_BASE_PATH=/ npm run build
```

En el workflow, el valor se puede sobrescribir con una variable de repositorio
`VITE_BASE_PATH` sin editar el YAML. Como el `base` también aplica en desarrollo,
`npm run dev` sirve la app en `http://localhost:5173/pausa-mia/`.

### Instalar como aplicación (móvil / escritorio)

Pausa Mía incluye un **Web App Manifest** para instalarse como shell de lanzamiento
(`display: standalone`). No hay service worker: la instalación no implica modo
offline ni caché de diario, perfil, guion o audio.

1. Abrí https://leo8190.github.io/pausa-mia/ (o `http://localhost:5173/pausa-mia/`
   en desarrollo) en un navegador compatible.
2. **Android (Chrome/Edge):** menú → «Instalar aplicación» / «Agregar a la pantalla
   de inicio».
3. **iOS (Safari):** Compartir → «Agregar a pantalla de inicio».
4. **Escritorio (Chrome/Edge/Chromium):** ícono de instalación en la barra de
   direcciones, o menú → «Instalar Pausa Mía…».

El `start_url` del manifest apunta a `/pausa-mia/`, coherente con el `base` por
defecto de Vite y con GitHub Pages. Los archivos de `public/` se copian a `dist/`
en el build; en desarrollo Vite los sirve bajo la misma base.

**Límite de red / TTS:** la app instalada sigue necesitando red para cargar el
sitio y, si se elige, para descargar el modelo Piper local o usar el TTS argentino
remoto tras consentimiento. Sin conexión no hay reproducción TTS garantizada; el
guion puede leerse en pantalla cuando ya esté generado en la sesión actual.

### Qué queda fuera del sitio publicado actual

- El servidor local de IA (`server/`) no se despliega: Pages sirve sólo archivos estáticos.
- Sin `/api` disponible, `isAvailable()` falla de forma controlada y el sitio publicado
  usa el **motor local por reglas**. La voz argentina Piper sí puede descargarse bajo
  demanda desde el repositorio público del modelo, únicamente después de que la
  persona lo solicita.
- La publicación estática actual todavía no incluye backend de cuentas, OAuth,
  pagos ni analítica. El único envío opcional a un tercero es el texto del guion al
  TTS remoto de Fly, y sólo tras consentimiento explícito.
- Los artefactos de audio de `artifacts/` quedan ignorados por Git y no viajan al build.

### Publicación verificada

El repositorio `pausa-mia` y su workflow de Pages están activos. La URL pública se
verificó después de una ejecución exitosa de GitHub Actions.

## Limitaciones reales

- La calidad de voz depende del SO y navegador; no hay voz comercial incluida.
- **No podemos prometer que funcione en "cualquier celular o PC".** El motor por
  defecto (Web Speech API) depende de lo que cada sistema operativo instale:
  - Windows/Edge/Chrome de escritorio suelen traer voces `es-MX`/`es-ES`; una voz
    `es-AR` real es poco común salvo que el usuario la instale manualmente.
  - Android varía según fabricante y el motor TTS instalado (Google, Samsung, etc.).
  - iOS/Safari expone voces del sistema, pero con comportamiento de `pause`/`resume`
    menos consistente que en escritorio.
  - Navegadores sin `speechSynthesis` (algunos WebViews embebidos, navegadores muy
    antiguos) no reproducen audio en absoluto; la app sigue mostrando el guion para
    lectura.
  - Cuando no hay voz `es-AR` real, la interfaz lo dice explícitamente
    (`fallbackMessage`, `isArgentine: false`) en vez de etiquetar otra voz como
    argentina.
- La voz argentina neuronal es-AR está implementada y se verifica con una síntesis
  real antes de habilitar la reproducción. La primera preparación descarga unos
  114 MB y necesita `WebAssembly`, `Cache Storage`, `TextDecoder`, HTMLAudioElement
  y un navegador moderno. La ruta remota agrega audio WAV estándar y controles
  nativos si el autoplay está bloqueado. **No hay compatibilidad universal:** no se
  puede garantizar que Piper local, Web Speech ni la ruta remota opcional funcionen
  en cualquier celular, PC, WebView o navegador. En fallo, la UI informa la causa;
  Web Speech y el remoto (`VITE_ARGENTINE_TTS_ENDPOINT`) sólo tras
  gesto/consentimiento explícitos — nunca en silencio. Ver matriz vacía en
  `docs/REMOTE_ARGENTINE_VOICE_DEVICE_VERIFICATION.md`.
- El detector de seguridad es conservador por frases, no evalúa riesgo clínico.
- El modo IA requiere servidor local y proveedor configurado; no se incluyen claves. Sigue experimental hasta una prueba real autorizada.
- El backend local ya tiene cuentas opcionales y sesiones seguras, pero el sitio
  publicado todavía no las expone; tampoco hay checkout ni OAuth real. No se envía
  diario/perfil. El sitio publicado apunta a `https://pausa-mia-voz-ar.fly.dev` y
  sólo envía texto del guion tras consentimiento (nunca en silencio; con endpoint la
  oferta remota es visible en es-AR junto a Piper local).
- OAuth quedó activo sólo para `google_calendar` y `google_drive` cuando hay
  variables de entorno configuradas. `social_networks` sigue desactivado.

## Límites del producto

- No es terapia, psicología, tratamiento ni diagnóstico.
- No promete curar, reducir ni resolver condiciones de salud.
- Sólo para mayores de 18 años.
- No reutiliza audio, voces ni credenciales de otros proyectos.

## Licencia

Prototipo de Leonardo Apollonio, bajo la marca comercial **Pausa Mía**, en fase de
prueba pública controlada. **León Developments** es el nombre operativo del equipo,
no una sociedad constituida. No se despliegan
claves, el servidor IA ni OAuth sin configurar primero credenciales y revisión de
seguridad. La voz remota del sitio publicado usa
`https://pausa-mia-voz-ar.fly.dev` (autostop/costo en Fly) y exige consentimiento; en
local el endpoint sigue vacío salvo `.env`.
