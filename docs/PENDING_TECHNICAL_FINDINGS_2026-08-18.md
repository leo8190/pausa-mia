# Hallazgos técnicos pendientes — 2026-08-18

## Estado verificado (18 ago 2026, Cursor)

| Verificación | Resultado |
| --- | --- |
| `npm run format:check` | Aprobado |
| `npm run lint` | Aprobado |
| `npm test` | Aprobado (pruebas unitarias + servidor mockeado, sin API real) |
| `npm run build` | Aprobado |
| `npm audit --omit=dev` | 0 vulnerabilidades |

## Transmisión a inteligencia artificial — cerrado

- Eliminado `context[].id` del payload; no se usa en servidor ni vista.
- Eliminados flags de consentimiento del cuerpo transmitido; el cliente exige ambos consentimientos antes de enviar.
- Vista amigable y body comparten `buildAiTransmissionData` / `buildAiTransmissionPayload` sin `forPreview`.
- Prueba de coincidencia valida allowlist de claves, ausencia de metadatos ocultos y que todos los valores transmitidos aparecen en la vista o en el JSON exacto (`Ver datos técnicos exactos`).
- Ciclo `aiTransmissionPayload` ↔ `scriptEngine` eliminado: `getCheckInSummaryValue` movido a `checkInSummary.ts`.

## Servidor local — cerrado

- Validadores puros en `server/core.mjs`, importables sin escuchar puerto.
- Rechazo de claves extra en raíz, payload, operational, personal, context y segmentos.
- Validación de duplicados, exceso de campos, enums, longitudes, enteros de pausas y `usedDetails`.
- Pruebas de origen permitido/rechazado en `/api/health` y `/api/generate-script`.
- Prueba de rechazo de cuerpos > 16 KiB con puerto efímero.
- Errores públicos sanitizados; detección OpenAI por hostname `api.openai.com` parseado.
- System prompt declara contexto del usuario como dato no confiable y delimitado.

## Pendiente (no bloquea prototipo local)

- Modo IA **experimental** hasta prueba autorizada con proveedor real y guiones revisados por una persona.
- Este Mac no tiene voz `es-AR` instalada; muestra neutral con `Paulina` (`es-MX`) no debe presentarse como argentina.

## Distinción de pruebas

- **Pruebas automatizadas:** validadores, payload, flujo React, servidor con `callProvider` mockeado y puerto efímero.
- **No ejecutadas:** llamadas reales a OpenAI ni otras APIs externas con clave.
