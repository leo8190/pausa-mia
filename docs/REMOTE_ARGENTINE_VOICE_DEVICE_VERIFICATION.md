# Verificación de voz argentina remota en dispositivos

Guía práctica. **No afirma compatibilidad universal**: cada fila debe marcarse
sólo tras prueba real en ese dispositivo/navegador.

## Endpoint público activo

El sitio publicado (GitHub Pages) usa
`VITE_ARGENTINE_TTS_ENDPOINT=https://pausa-mia-voz-ar.fly.dev`. El servicio
sólo recibe texto del guion (`POST /v1/tts`) después del consentimiento en la UI
(nunca automático; sólo si Piper local falla o no es compatible). Fly tiene
autostop: cold start posible y hay costo de máquina/egress. Este repo no
despliega ni modifica secretos.

## Prerrequisitos (prueba local)

1. Frontend local con `VITE_ARGENTINE_TTS_ENDPOINT` apuntando al servicio (o el
   sitio publicado, que ya trae el endpoint Fly).
2. `voice-service` en marcha (`ARG_TTS_BACKEND=mock` basta para validar la ruta
   HTTP/UI; `piper` + modelo para calidad de voz).
3. CORS: el origen del frontend debe estar en `ARG_ALLOWED_ORIGINS`.

## Matriz (completar a mano)

| Dispositivo | SO | Navegador | Piper local | Remoto WAV (mock) | Remoto WAV (piper) | Notas | Fecha | Quién |
| ----------- | -- | --------- | ----------- | ----------------- | ------------------ | ----- | ----- | ----- |
| _ej. iPhone_ | iOS _x_ | Safari _x_ | ¿ok / fallo / N/A? | ☐ | ☐ | | | |
| | | Chrome | | ☐ | ☐ | | | |
| _ej. Android_ | | Chrome | | ☐ | ☐ | | | |
| Desktop | macOS | Chrome | | ☐ | ☐ | | | |
| Desktop | macOS | Safari | | ☐ | ☐ | | | |
| Desktop | Windows | Edge | | ☐ | ☐ | | | |

## Checklist por dispositivo

1. Flujo es-AR hasta Reproducción.
2. Si Piper local falla o el navegador no soporta WASM: aparece oferta remota (no
   se activa sola).
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
