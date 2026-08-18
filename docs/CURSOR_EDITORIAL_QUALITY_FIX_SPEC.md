# Especificación para Cursor — segunda corrección editorial

Estado: `LISTA PARA IMPLEMENTAR`.

## Objetivo

Mantener la corrección de duración ya validada, pero lograr que el guion deje de sonar
como un formulario seguido por un banco de frases. La práctica central, la intención,
el nivel de experiencia y el cierre deben formar un recorrido coherente.

La evidencia completa está en `SCRIPT_QUALITY_REVIEW_2026-08-18.md`: los cinco casos
pasan los controles técnicos, pero obtienen 74, 76, 75, 79 y 66 puntos. Ninguno llega
al umbral editorial de 85.

## Alcance

Modificar solamente:

- `src/lib/scriptEngine.ts`;
- pruebas focales en `src/__tests__/scriptEngine.test.ts` y, sólo si corresponde,
  `src/__tests__/scriptPrivacy.test.ts`.

No cambiar interfaz, servidor, voces, precios, consentimiento, dependencias ni la
arquitectura de duración. No inicializar Git.

## Cambios requeridos

1. **Integración natural de los datos**
   - Eliminar frases de metadatos como “eso es suficiente contexto para comenzar” y
     “Eso orienta la práctica, sin prometer un resultado”.
   - Reconocer momento, estado e intención con lenguaje meditativo natural, sin copiar
     texto libre ni inventar detalles.
   - Usar frases gramaticales específicas por intención. Nunca producir “tu intención
     es concentrarse”.

2. **Adaptación real por experiencia**
   - Mantener primera vez y habitual claramente diferenciadas.
   - Agregar una adaptación concreta para experiencia básica: una guía breve, sin
     explicar desde cero ni asumir dominio avanzado.
   - Incluir `experience` en `usedDetails` solamente cuando esa adaptación aparezca.

3. **Práctica central coherente**
   - Las expansiones deben priorizar el estilo y la intención elegidos, no mezclar
     indiscriminadamente cuerpo, sonidos, espacio y pensamientos.
   - A cinco minutos, la práctica central debe tener al menos cuatro indicaciones
     específicas del estilo o la intención; a diez minutos, al menos ocho.
   - Mantener indicaciones comunes sólo como orientación o regreso, no como relleno.
   - Variar pausas con intención contemplativa; no usar una misma pausa mecánica en
     casi toda la expansión.

4. **Cierre sensible al momento**
   - Antes de dormir: cierre quieto y nocturno; nunca “resto del día”, “retomar” ni una
     activación innecesaria.
   - Al despertar: transición amable hacia el comienzo del día.
   - Pausa laboral: regreso gradual a la jornada sin prometer resolverla.
   - Ahora: cierre neutro y orientado al entorno.
   - El cierre continúa ocupando exactamente los dos últimos segmentos.

## Regresiones editoriales obligatorias

### Caso 1 — pausa laboral argentina

- Voseo consistente y adaptación para primera vez.
- Reconoce jornada, ritmo acelerado e intención sin leer nombres de campos.
- No contiene `contexto para comenzar`, `orienta la práctica` ni copia cinco palabras
  consecutivas del relato sintético.
- Cierre compatible con volver a la jornada.

### Caso 2 — sueño neutro, habitual, diez minutos

- Neutro consistente, sin `relájate` ni argentinismos.
- Al menos ocho indicaciones centrales coherentes con atención abierta y descanso.
- No contiene `resto del día`, `retomar tareas` ni texto posterior al cierre.
- Conserva duración entre 9 y 11 minutos, cero duplicados y menos de la mitad de las
  pausas en 12 segundos.

### Caso 3 — autocompasión, experiencia básica

- Incluye adaptación visible para experiencia básica.
- Al menos cuatro indicaciones específicas de autocompasión o aceptación emocional.
- No copia el relato, asigna culpas ni infiere lo que siente otra persona.
- La expansión no deriva a una lista sensorial genérica.

### Caso 8 — recorrido corporal sin respiración profunda

- No menciona respiración profunda ni equivalentes forzados.
- Recorre al menos tres zonas corporales en indicaciones separadas y progresivas.
- Mantiene ojos abiertos, alternativa de ancla y posibilidad de detenerse.
- Elimina la generalización “hombros y cuello suelen cargar el día entero”.

### Caso 9 — mínimo contexto, concentración y atención abierta

- No inventa detalles íntimos.
- La frase de intención es gramatical y natural.
- Explica cómo una atención amplia puede servir a la concentración; no combina
  “concentrarse” con “no hace falta elegir un foco” sin resolver la contradicción.
- Incluye adaptación para experiencia básica.

## Condiciones que no pueden retroceder

- Duraciones 3, 5 y 10 dentro de tolerancia.
- Cero textos duplicados y cierre siempre al final.
- Privacidad, `usedDetails` cerrado, exclusiones, autonomía y dialecto consistentes.
- Pausas entre 3.000 y 12.000 milisegundos.
- Todos los tests existentes continúan verdes.

## Verificación

Ejecutar:

1. `npm run format:check`
2. `npm run lint`
3. `npm test -- --run`
4. `npm run build`

Después regenerar los casos 1, 2, 3, 8 y 9 y reportar sus textos completos, duración,
segmentos, duplicados, cierre y `usedDetails`. No afirmar que alcanzan 85/100: esa
puntuación se hará en una revisión editorial independiente posterior.
