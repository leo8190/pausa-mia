# Auditoría del prototipo — 2026-08-18

## Estado

`EN VALIDACIÓN`. La corrección de privacidad del guion quedó verde en código y pruebas.
El prototipo todavía no debe presentarse como probado con usuarios, validado con un
proveedor de inteligencia artificial real ni monetizado.

## Última verificación vigente

Ejecutada el 18 de agosto de 2026 después de los cambios parciales de privacidad:

| Verificación | Resultado |
| --- | --- |
| `npm run format:check` | Aprobado |
| `npm run lint` | Aprobado |
| `npm test -- --run` | 80 aprobadas de 80 |
| `npm run build` | Aprobado |
| `npm audit --omit=dev` | 0 vulnerabilidades |

La validación se ejecutó después del cambio final de Cursor. Incluye once pruebas de
privacidad del guion y catorce del servidor, sin llamadas a APIs reales.

## Evidencia de la primera implementación

- La instalación de dependencias terminó correctamente.
- El control de formato falló en 15 archivos.
- El análisis estático falló por tres símbolos sin usar.
- Las pruebas terminaron con 19 aprobadas y 9 fallidas.
- La compilación de producción falló.
- La instalación informó 5 vulnerabilidades de dependencias: 3 moderadas, 1 alta y 1 crítica. No se aplicó una corrección forzada.

## Snapshot verde anterior — reemplazado

Esta evidencia corresponde a una versión anterior y ya no describe el árbol actual:

| Verificación | Resultado |
| --- | --- |
| `npm run format:check` | Aprobada |
| `npm run lint` | Aprobada |
| `npm test` | 56 aprobadas de 56 |
| `npm run build` | Aprobada |
| `npm audit --omit=dev` | 0 vulnerabilidades |

Cursor corrigió el payload mínimo de IA, endureció el servidor local, amplió la validación de guiones y eliminó los avisos `act` en las pruebas de flujo React. El modo de inteligencia artificial no fue ejecutado con un proveedor real autorizado.

La revisión visual no pudo comenzar porque el navegador interno no logró adjuntar la página local en dos intentos acotados. No se cambió de superficie ni se siguió reintentando.

## Brechas encontradas en la primera versión

- El guion es determinístico: todavía no existe generación real con inteligencia artificial.
- Google, redes sociales y diario histórico sólo aparecen como posibilidades futuras.
- Las duraciones de 3, 5 y 10 minutos no están calibradas por palabras y pausas.
- El recurso 141 se presentó incorrectamente como ayuda general; corresponde a consumos problemáticos.
- La opción de guardar preferencias no implementa persistencia real.
- Pausar entre segmentos puede dejar la reproducción detenida.
- El texto íntimo ingresado puede repetirse de forma demasiado literal.
- La generación no vuelve a comprobar todos los consentimientos necesarios.

## Corrección delegada a Cursor

Cursor recibió una corrección integral con estos requisitos:

1. Dejar formato, análisis, pruebas y compilación en verde.
2. Usar para orientación en salud mental el recurso oficial nacional `0800-999-0091`, y `911` ante peligro inmediato; retirar 141 y 107 como líneas generales.
3. Aplicar consentimiento granular en la generación, persistir sólo preferencias no sensibles cuando la persona lo autorice y borrar sesión, almacenamiento y audio juntos.
4. Evitar copiar literalmente relatos íntimos y validar la calidad y duración real del guion.
5. Incorporar una interfaz de proveedor de guiones con motor local y un adaptador opcional compatible con OpenAI detrás de un servidor local, sin claves en el navegador, con vista previa exacta de lo que se transmitiría, consentimiento independiente, validación y fallback local.
6. Permitir contexto manual y archivos locales `.txt` o `.json`, con fecha, procedencia, selección granular, límites y uso exclusivo de la sesión. Las conexiones OAuth deben seguir desactivadas hasta implementarse de verdad.
7. Mantener ambas variantes de voz, feedback y precios hipotéticos sin cobro.

No se autorizaron llamadas pagas, publicación, cuentas, claves, OAuth ni una corrección destructiva de dependencias.

La tarea `meditacion-a-medida-cierre-verificacion-20260818` quedó encolada sin ser reclamada, pero los archivos dejados por la sesión principal ya resolvieron sus seis fallas. Después se delegó a Cursor `meditacion-a-medida-privacidad-ia-cierre-20260818` para corregir la transmisión mínima, endurecer el servidor, usar salidas estructuradas cuando corresponda y eliminar los avisos de pruebas. Una tarea enviada no equivale a una entrega terminada.

## Hallazgo de privacidad — cerrado en código (modo IA sigue experimental)

Cursor implementó un payload tipado (`AiTransmissionPayload`) en
`src/lib/aiTransmissionPayload.ts` con `buildAiTransmissionData` (vista previa) y
`buildAiTransmissionPayload` (envío tras consentimiento). La vista previa, el detalle
“Ver datos técnicos exactos”, el `fetch` del navegador y las pruebas con valores
centinela usan el mismo objeto serializado (`{ payload }` sin consentimientos ni
`context.id` ni `personal.field`). No se envía `checkIn` crudo, listas `excluded`,
`summaryExcluded`, `avoidTopics` ni contenido completo de fuentes; cada fragmento se
recorta a 200 caracteres.

El servidor local (`server/core.mjs` + `server/index.mjs`):

- Permite sólo orígenes locales explícitos en `/api/health` y `/api/generate-script`.
- Limita el cuerpo a 16 KiB durante streaming (probado con puerto efímero).
- Valida claves exactas, rechaza extras, duplicados y rangos en payload y salida.
- Valida segmentos, pausas enteras 3000–12000 ms, duración ±1 min, `fullText`
  consistente, `usedDetails` y filtros de seguridad.
- Usa Structured Outputs con JSON Schema estricto cuando el hostname parseado es
  `api.openai.com`.
- System prompt trata el contexto del usuario como dato no confiable y delimitado.
- Sanitiza errores al cliente; no devuelve respuestas del proveedor ni textos íntimos.

**El modo IA sigue experimental** hasta una prueba autorizada con proveedor real.
Las pruebas automatizadas no usan API real; el proveedor se mockea en tests de servidor.

## Gates pendientes

1. Ejecutar revisión visual y funcional completa en navegador cuando la página local pueda adjuntarse.
2. Escuchar y comparar voces reales en macOS y móvil.
3. Probar con cinco personas y registrar intención de pago; `PAGADO` requiere dinero acreditado.
4. Prueba end-to-end con OpenAI real autorizada por Leonardo (fuera de este entorno).
