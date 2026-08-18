# Auditoría de la corrección de privacidad del guion

Estado: **INCOMPLETA — no validar como terminada**.

## Lo que ya apareció

- `src/lib/safeUsedDetails.ts` define identificadores cerrados.
- `src/lib/sensitiveOverlap.ts` detecta secuencias normalizadas de cinco palabras y fragmentos de más de treinta caracteres.
- `src/lib/situationReference.ts` ya devuelve una frase categórica sin texto libre.

## Brechas comprobadas en el código actual

1. `buildRecognitionBlock` todavía agrega a `usedDetails`:
   - `perceivedStateOther` escrito por la persona;
   - un fragmento de `recentSituation`;
   - un fragmento del diario o contexto seleccionado;
   - etiquetas descriptivas libres en lugar de identificadores seguros.
2. `buildRecognitionBlock` llama a `buildSituationRecognitionPhrase(situation, variant)`, pero la función ahora recibe solamente `variant`.
3. `validateScriptQuality` importa la validación de identificadores seguros, pero aún debe comprobarse que la aplique y que también valide solapamiento contra todas las entradas sensibles seleccionadas.
4. `server/core.mjs` todavía acepta cualquier cadena no vacía en `usedDetails` y el esquema permite cadenas libres.
5. El prompt del servidor todavía pide “detalles concretos” y no prohíbe expresamente copiar más de tres palabras consecutivas.
6. El servidor todavía no contrasta la salida del proveedor con las entradas sensibles ni implementa el fallback local seguro ante copia.
7. Las pruebas existentes siguen esperando la conducta antigua (`relacionado con`, `momento actual`, `cuerpo apoyado`) y no cubren los casos obligatorios del documento `PENDING_SCRIPT_QUALITY_FIX.md`.

## Criterio de aceptación

No declarar éxito hasta que:

- ningún texto libre aparezca en el guion local ni en `usedDetails`;
- cliente y servidor rechacen identificadores fuera de la lista cerrada;
- una respuesta simulada que copie una entrada sensible sea rechazada y termine en fallback local seguro;
- todos los casos exigidos en `PENDING_SCRIPT_QUALITY_FIX.md` tengan pruebas determinísticas;
- `format:check`, `lint`, `test`, `build` y `npm audit --omit=dev` pasen.
