# Evaluación del motor local — 2026-08-26

## Alcance

Corrección editorial focal del motor por reglas (`src/lib/scriptEngine.ts`) tras
confirmar que las frases de formulario históricas (`suficiente contexto para
comenzar`, `orienta la práctica`) ya no aparecían, pero el caso 9 seguía
combinando meta de experiencia, foco estrecho y relleno de postura dentro de una
práctica de atención abierta.

Esta nota documenta evidencia técnica reproducible. No puntúa 85/100: esa
revisión editorial independiente queda pendiente.

## Cambios aplicados

- Intención `concentrarse` + estilo `atencion-abierta`: reconocimiento, puente e
  indicaciones de concentración usan el campo amplio como apoyo, no “un solo
  punto”.
- Experiencia básica: deja de sonar a metadato de formulario; guía breve dentro
  de la práctica.
- Con poco contexto (5 min sin estado/situación): se omite el asentamiento
  genérico que alargaba el preámbulo.
- Pausa laboral + situación presente: reconocimiento categórico ligado a la
  jornada, sin copiar texto libre.
- Orientación común de atención abierta: campo/escucha en lugar de mandíbula o
  columna genéricas.
- Neutro: se eliminó un `tú` de español de España.

## Verificación

```bash
npm run format:check
npm run lint
npm test -- --run
npm run build
```

| Comando | Resultado |
| --- | --- |
| `npm run format:check` | ✅ |
| `npm run lint` | ✅ |
| `npm test -- --run` | ✅ 253 tests |
| `npm run build` | ✅ |

## Casos priorizados (sintéticos)

| Caso | Minutos | Segmentos | Duplicados | Cierre final | `validateScriptQuality` |
| --- | ---: | ---: | ---: | --- | --- |
| 1 | 3 | 14 | 0 | sí | válido |
| 2 | 10 | 37 | 0 | sí | válido |
| 3 | 5 | 21 | 0 | sí | válido |
| 8 | 5 | 21 | 0 | sí | válido |
| 9 | 5 | 20 | 0 | sí | válido |

Caso 9: `usedDetails` = `moment`, `experience`, `intention`, `style`. No inventa
intimidad; no contiene las frases de formulario conocidas ni “elige un solo
apoyo”.
