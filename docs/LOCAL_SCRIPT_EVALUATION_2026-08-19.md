# Evaluación del motor local — 2026-08-19

## Alcance

Verificación técnica de salud del proyecto y regeneración de los cinco casos
sintéticos priorizados de `SCRIPT_EVAL_CASES.md` (1, 2, 3, 8 y 9) después de las
correcciones editoriales y de duración aplicadas en `src/lib/scriptEngine.ts`. Esta
nota documenta solamente evidencia técnica reproducible: gates automáticos,
duración, duplicados y cierre. No sustituye la revisión editorial humana ciega
descripta en `SCRIPT_QUALITY_RUBRIC.md`.

Ningún caso usa datos reales; las cinco entradas son sintéticas y no se conectó
ningún proveedor de IA ni servidor externo durante esta evaluación.

## Comandos ejecutados

```bash
npm test
npm run lint
npm run format:check
npm run build
```

## Resultados de las verificaciones

| Comando                | Resultado                     |
| ----------------------- | ------------------------------ |
| `npm test`              | ✅ 97 tests, 12 archivos verdes |
| `npm run lint`          | ✅ sin observaciones            |
| `npm run format:check`  | ✅ sin observaciones            |
| `npm run build`         | ✅ compila y genera `dist/`     |

## Métricas de los cinco casos priorizados

Generados localmente con el motor por reglas (`generateScript` + `validateScriptQuality`),
sin proveedor de IA.

| Caso | Duración objetivo | Duración estimada | Dentro de tolerancia (±1 min) | Segmentos | Duplicados | Cierre final coincide con `buildClosingBlock` | Gates automáticos (`validateScriptQuality`) |
| ---- | ------------------ | ------------------- | ------------------------------ | --------- | ---------- | ----------------------------------------------- | --------------------------------------------- |
| 1 — pausa laboral argentina, primera vez     | 3 min  | 3 min  | ✅ | 14 | 0 | ✅ | `valid: true`, 0 issues |
| 2 — sueño neutro, práctica habitual          | 10 min | 10 min | ✅ | 38 | 0 | ✅ | `valid: true`, 0 issues |
| 3 — autocompasión, experiencia básica        | 5 min  | 5 min  | ✅ | 21 | 0 | ✅ | `valid: true`, 0 issues |
| 8 — recorrido corporal sin respiración profunda | 5 min | 5 min | ✅ | 21 | 0 | ✅ | `valid: true`, 0 issues |
| 9 — mínimo contexto, concentración/atención abierta | 5 min | 5 min | ✅ | 21 | 0 | ✅ | `valid: true`, 0 issues |

Para los cinco casos:

- Ningún segmento de texto se repite (0 duplicados exactos, comparación normalizada).
- Los dos últimos segmentos de cada guion coinciden exactamente con el bloque de
  cierre construido por `buildClosingBlock` para ese momento; no hay texto posterior
  al cierre.
- `usedDetails` sólo contiene identificadores de la allowlist (`moment`,
  `perceivedState`, `recentSituation:present`, `intention`, `experience`, `style`) y
  ninguno incluye fragmentos de texto libre del usuario.
- `validateScriptQuality` no reportó incidencias en ninguno de los cinco casos
  (duración, pausas, autonomía, duplicados de `fullText` y allowlist de detalles).

## Limitaciones explícitas

- **La calidad contemplativa sigue sin validación humana.** Estas métricas cubren
  gates automáticos (duración, duplicados, cierre, privacidad, allowlist). Ninguna
  puntúa la experiencia subjetiva de la práctica: eso requiere la rúbrica de
  `SCRIPT_QUALITY_RUBRIC.md` aplicada por dos revisores humanos ciegos, con un
  umbral mínimo de 85/100 antes de cualquier prueba con personas reales.
- **La voz depende enteramente del navegador y el sistema operativo.** El motor
  genera texto y pausas; la síntesis de voz usa la Web Speech API del dispositivo
  del usuario. No hay voz comercial ni control sobre calidad, disponibilidad de
  variante argentina/neutra o comportamiento en Safari/iOS, que puede ser más
  limitado que en Chrome/Edge de escritorio.

## Trazabilidad

Esta evaluación no modificó código: sólo se ejecutaron los comandos de
verificación y un script de lectura (`generateScript`/`validateScriptQuality`) sobre
los cinco casos sintéticos ya documentados en `SCRIPT_EVAL_CASES.md`. No se
generó audio, no se llamó a ningún proveedor externo y no se persistió ningún dato.
