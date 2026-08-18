# Evaluación del motor local — 2026-08-18

> **Línea base histórica superada en privacidad.** La copia literal y los
> `usedDetails` inseguros descriptos aquí fueron corregidos y están cubiertos por
> `PRIVACY_FIX_VERIFICATION_2026-08-18.md`. Para la evaluación editorial vigente,
> consultar `SCRIPT_QUALITY_REVIEW_2026-08-18.md`.

## Caso

Caso sintético 1 de `SCRIPT_EVAL_CASES.md`: pausa laboral argentina, estado acelerado,
principiante, respiración natural, tres minutos y una referencia ficticia a varias
reuniones y tareas pendientes.

## Evidencia automática

- Duración estimada: 2,7 minutos para un objetivo de 3.
- Segmentos: 14.
- Variante argentina: consistente en la muestra.
- El validador actual devolvió `valid: true` sin observaciones.

## Hard fail humano

El guion insertó casi completa y literalmente la situación sintética dentro de una
frase, e inmediatamente afirmó que no la repetiría literalmente. Esto incumple el gate
de privacidad y calidad que exige una referencia breve y segura, no un eco del diario.

También se observaron estas brechas:

- `usedDetails` conserva fragmentos textuales de la situación y del contexto, en vez de
  etiquetas seguras y trazables.
- La misma idea aparece como situación reciente y nuevamente como fuente adicional.
- No hay opción explícita de mantener ojos abiertos, cambiar el ancla o detenerse.
- El nivel “primera vez” no produce una adaptación claramente demostrable.
- `validateScriptQuality` no detecta la repetición literal ni la contradicción del texto.

## Resultado

`RECHAZADO`, aunque el puntaje orientativo sin el hard fail sería 77/100.

No está listo para pruebas con relatos personales reales. Antes de continuar, Cursor
debe:

1. Convertir situaciones y diario en referencias categóricas seguras sin copiar frases.
2. Deduplicar contexto semánticamente equivalente.
3. Evitar texto personal dentro de `usedDetails`; usar identificadores de campo o
   descripciones neutras.
4. Integrar gates automáticos de la rúbrica y casos de regresión.
5. Agregar opciones de autonomía y adaptación visible por experiencia.

La muestra fue generada localmente, sin proveedor, clave, publicación ni datos reales.
