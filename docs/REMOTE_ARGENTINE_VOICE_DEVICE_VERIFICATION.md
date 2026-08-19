# Verificación de voz argentina remota en dispositivos

Guía práctica. **No afirma compatibilidad universal**: cada fila debe marcarse
sólo tras prueba real en ese dispositivo/navegador.

## Endpoint público activo

El sitio publicado (GitHub Pages) usa
`VITE_ARGENTINE_TTS_ENDPOINT=https://pausa-mia-voz-ar.fly.dev`. El servicio
sólo recibe texto del guion (`POST /v1/tts`) después del consentimiento en la UI
(nunca automático; con endpoint configurado la oferta es visible junto a Piper
local). Fly tiene
autostop: cold start posible y hay costo de máquina/egress. Este repo no
despliega ni modifica secretos.

## Prerrequisitos (prueba local)

1. Frontend local con `VITE_ARGENTINE_TTS_ENDPOINT` apuntando al servicio (o el
   sitio publicado, que ya trae el endpoint Fly).
2. `voice-service` en marcha (`ARG_TTS_BACKEND=mock` basta para validar la ruta
   HTTP/UI; `piper` + modelo para calidad de voz).
3. CORS: el origen del frontend debe estar en `ARG_ALLOWED_ORIGINS`.

## Matriz (completar a mano)

| Dispositivo    | SO                 | Navegador  | Piper local        | Remoto WAV (mock) | Remoto WAV (piper) | Notas                                                                                            | Fecha      | Quién |
| -------------- | ------------------ | ---------- | ------------------ | ----------------- | ------------------ | ------------------------------------------------------------------------------------------------ | ---------- | ----- |
| _ej. iPhone_   | iOS _x_            | Safari _x_ | ¿ok / fallo / N/A? | ☐                 | ☐                  |                                                                                                  |            |       |
|                |                    | Chrome     |                    | ☐                 | ☐                  |                                                                                                  |            |       |
| _ej. Android_  |                    | Chrome     |                    | ☐                 | ☐                  |                                                                                                  |            |       |
| Desktop        | macOS              | Chrome     |                    | ☐                 | ☐                  |                                                                                                  |            |       |
| Desktop        | macOS              | Safari     |                    | ☐                 | ☐                  |                                                                                                  |            |       |
| Desktop        | Windows            | Edge       |                    | ☐                 | ☐                  |                                                                                                  |            |       |
| In-app Browser | Chromium integrado | Chromium   | N/A no físico      | ✅                | ✅                 | Sitio público; WAV Piper real verificado tras consentimiento; controles y estado remoto visibles | 2026-08-19 | Codex |
| Matriz automatizada | macOS arm64 runtime | Chromium 151 / Firefox 153 / WebKit 26.5 | N/A no físico | N/A | ✅ UI/consentimiento | Smoke público hasta Reproducción: es-AR visible, consentimiento remoto desmarcado y oferta remota visible en los tres motores; no prueba hardware físico ni síntesis en cada motor | 2026-08-19 | Codex |
| Desktop emulado | macOS arm64 runtime | Firefox 153 | N/A no físico | N/A | ✅ fallback manual | Se simuló bloqueo de autoplay, se obtuvo WAV Piper real y el control nativo permaneció utilizable después del gesto manual; no sustituye Firefox físico en cada sistema operativo | 2026-08-19 | Codex |
| Móvil emulado | macOS arm64 runtime | WebKit + iPhone UA (390×844); Chromium + Android UA (412×915) | N/A no físico | N/A | ✅ síntesis + reproducción WAV + fallback manual | Flujo público completo en ambos perfiles: consentimiento, POST TTS Piper real, reproducción y controles nativos tras simular bloqueo de autoplay; no sustituye iPhone/Android físicos ni prueba hardware real | 2026-08-19 | Codex |
| Desktop físico | macOS de trabajo | Safari real | N/A (se probó ruta remota) | N/A | ✅ Piper remoto | Flujo invitado completo en Safari real: es-AR, consentimiento explícito, WAV real, Reproducir, Pausar, Continuar y Detener; no representa iPhone/Android físicos | 2026-08-19 | Codex |

## Checklist por dispositivo

1. Flujo es-AR hasta Reproducción.
2. Con endpoint configurado: la oferta remota está visible junto a Piper local
   (Piper primero; no se activa sola). Sin endpoint: el aviso de configuración
   faltante aparece sólo si Piper local falla o el navegador no soporta WASM.
3. Casilla de consentimiento **desmarcada**; botón "Usar voz argentina remota"
   deshabilitado hasta marcarla.
4. Tras consentimiento: "Reproducir voz argentina remota" obtiene WAV y suena
   (o silencio corto en `mock`).
5. Pausar / Continuar / Detener / Reiniciar funcionan.
6. En DevTools → Network: sólo POST `/v1/tts` con JSON `{ text }` del segmento;
   sin diario, perfil ni fuentes.
7. Sin `VITE_ARGENTINE_TTS_ENDPOINT`: mensaje de configuración faltante, sin
   requests.

## Límites conocidos (no inventar cobertura)

- iOS Safari puede restringir autoplay hasta gesto de usuario (el botón de
  reproducir cubre el gesto).
- Cold start en Fly con autostop puede tardar varios segundos en el primer
  request: documentar latencia medida, no estimada.
- `mock` no valida calidad argentina; sólo la tubería HTTP + UI.
