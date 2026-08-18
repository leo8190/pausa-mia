# Revisión editorial del motor local — 2026-08-18

Estado inicial: `REQUIERE CORRECCIÓN`.

Estado actual de implementación: `CORRECCIÓN TÉCNICA COMPLETADA; REVISIÓN
EDITORIAL INDEPENDIENTE PENDIENTE`.

Esta revisión usa únicamente casos sintéticos. Es una revisión asistida por modelo y
no reemplaza los dos revisores humanos ciegos exigidos por la rúbrica.

## Línea base anterior a la corrección de duración

Los cinco casos revisados devolvían `validateScriptQuality.valid = true`, pero la
evaluación editorial encontró diferencias importantes:

| Caso | Seguridad /25 | Personalización /20 | Contemplativa /20 | Lenguaje /15 | Ritmo /10 | Utilidad /10 | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 — Pausa laboral argentina | 24 | 15 | 18 | 14 | 10 | 8 | **89** |
| 2 — Sueño neutro, 10 minutos | 25 | 16 | 10 | 12 | 2 | 3 | **68** |
| 3 — Autocompasión, 5 minutos | 24 | 12 | 14 | 14 | 6 | 7 | **77** |
| 8 — Recorrido corporal sin respiración profunda | 25 | 14 | 14 | 14 | 5 | 8 | **80** |
| 9 — Sin contexto íntimo | 25 | 13 | 15 | 14 | 5 | 7 | **79** |

Los puntajes de calidez, utilidad y calidad contemplativa son juicio editorial
orientativo, no medición automática.

## Evidencia reproducible

- Caso 1: `3,0` minutos, `15` segmentos, sin duplicados y con adaptación explícita
  para primera vez.
- Caso 2: `9,0` minutos, `32` segmentos y dieciocho repeticiones exactas de
  `Sigue con esta práctica, a tu propio ritmo.` después del cierre.
- Caso 2: los catorce segmentos originales quedaron con pausas de `12` segundos.
- Caso 3: `4,1` minutos y `13` segmentos; abstrae el relato, pero la experiencia
  básica no modifica la práctica.
- Caso 8: `4,2` minutos y `14` segmentos; evita respiración y ofrece cuerpo, ojos
  abiertos y detención, pero agrega relleno después de despedirse.
- Caso 9: no inventa intimidad, pero tampoco adapta experiencia básica y termina con
  relleno posterior al cierre.

## Brechas prioritarias

1. Reemplazar el relleno de duración por bloques centrales específicos para cada
   estilo y duración; el cierre debe ser realmente el final.
2. Adaptar el contenido para experiencia básica, no sólo para primera vez y práctica
   habitual; registrar `experience` únicamente cuando cambie el guion.
3. Ampliar el validador para detectar duplicados, relleno, mezcla dialectal y la
   relación entre detalles usados, exclusiones y términos evitados.

## Estado de implementación

- El primer pedido amplio a Cursor se detuvo después de `2 min 16 s`: sólo exploró
  `scriptEngine.ts` y no modificó archivos. No cuenta como implementación.
- Se inició una fase acotada en el workspace visible
  `app-meditacion-personalizada`, chat `León Developments workspace`: eliminar el
  relleno repetido, insertar expansión antes del cierre y cubrir el caso 2.
- Esa segunda ejecución también se detuvo sin modificar archivos. El trabajo no se
  considera implementado.
- Se preparó `CURSOR_DURATION_FIX_SPEC.md` con diseño, alcance y criterios de
  aceptación exactos para reducir la siguiente ejecución a aplicar una solución ya
  definida.
- En el tercer intento se cambió el modelo visible de Cursor a `Claude Opus 5 High`
  y se le indicó implementar únicamente esa especificación. Exploró cinco archivos,
  no modificó ninguno y la ejecución fue detenida. Estado: `BLOQUEADO_TEMPORAL`.
- La ampliación general del validador y la adaptación de experiencia básica quedan
  separadas para una fase posterior.

## Revisión posterior a la corrección de duración

Estado: `REQUIERE SEGUNDA CORRECCIÓN EDITORIAL`.

Se regeneraron localmente los casos 1, 2, 3, 8 y 9, sin proveedor, claves ni datos
reales. Los cinco pasan `validateScriptQuality`, respetan su duración objetivo, no
duplican textos y terminan exactamente en el cierre.

| Caso | Minutos | Segmentos | Duplicados | Pausas de 12 s | Validador |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 — Pausa laboral argentina | 3,0 | 15 | 0 | 0 | válido |
| 2 — Sueño neutro | 10,0 | 33 | 0 | 1 | válido |
| 3 — Autocompasión | 5,0 | 18 | 0 | 0 | válido |
| 8 — Recorrido corporal sin respiración profunda | 5,0 | 19 | 0 | 0 | válido |
| 9 — Sin contexto íntimo | 5,0 | 19 | 0 | 0 | válido |

Una segunda revisión asistida por modelo, deliberadamente estricta, aplicó la rúbrica
editorial completa. No sustituye los dos revisores humanos ciegos requeridos antes de
probar con personas reales.

| Caso | Seguridad /25 | Personalización /20 | Contemplativa /20 | Lenguaje /15 | Ritmo /10 | Utilidad /10 | Total | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 24 | 12 | 14 | 10 | 6 | 8 | **74** | REESCRIBIR |
| 2 | 24 | 13 | 15 | 11 | 7 | 6 | **76** | REESCRIBIR |
| 3 | 24 | 15 | 13 | 10 | 6 | 7 | **75** | REESCRIBIR |
| 8 | 24 | 16 | 15 | 10 | 6 | 8 | **79** | REESCRIBIR |
| 9 | 23 | 13 | 12 | 8 | 6 | 4 | **66** | RECHAZAR |

### Hallazgos editoriales comprobados

- Caso 1: frases como “eso es suficiente contexto para comenzar” y “Eso orienta la
  práctica, sin prometer un resultado” suenan a formulario; la referencia laboral no
  queda integrada naturalmente.
- Caso 2: la expansión se vuelve una colección de cuerpo, sonidos y espacio. El cierre
  “Que el resto del día sea a tu ritmo” contradice el momento antes de dormir.
- Caso 3: la autocompasión ocupa pocos segmentos y luego deriva a orientación sensorial
  genérica; la experiencia básica no modifica la práctica.
- Caso 8: el recorrido corporal principal se comprime en una sola enumeración y la
  frase sobre hombros y cuello que “cargan el día entero” agrega un cliché innecesario.
- Caso 9: “Tu intención para esta pausa es concentrarse” tiene un error de persona;
  “No hace falta elegir un foco” contradice la intención de concentrarse.

### Corrección implementada por Cursor

Cursor actualizó `src/lib/scriptEngine.ts` y sus pruebas focales en el workspace
visible `app-meditacion-personalizada`. La verificación independiente posterior
pasó `format:check`, `lint`, `vitest` y `build`: 12 archivos de prueba y 97 tests
verdes. El cambio integra los datos del check-in como lenguaje natural, adapta la
experiencia básica, mueve la práctica al centro y hace sensible el cierre al momento.

Esto confirma la salud técnica del cambio, pero no sustituye la revisión editorial
ciega ni demuestra todavía un puntaje de 85/100.

### Próxima revisión prioritaria

1. Integrar los datos como lenguaje natural de la meditación, no como lectura de
   campos o metadatos.
2. Mantener las expansiones ligadas al estilo, la intención y el nivel de experiencia;
   incorporar una adaptación real para experiencia básica.
3. Hacer el cierre sensible al momento: sueño, despertar, pausa laboral o momento
   actual; eliminar contradicciones y finales genéricos.
4. Corregir las frases gramaticales de intención y evitar que estilo e intención se
   contradigan.
5. Repetir esta evaluación antes de probar voces o usuarios. El objetivo mínimo sigue
   siendo 85/100 sin gates fallidos.

Conclusión: la arquitectura de duración quedó validada, pero `0/5` muestras alcanzan el
umbral editorial. El prototipo todavía no está listo para una prueba moderada con
personas reales.
