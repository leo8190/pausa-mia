# Especificación ejecutable para Cursor — duración sin relleno

Estado: `LISTA PARA IMPLEMENTAR`.

## Problema probado

El caso 2 de `SCRIPT_EVAL_CASES.md` produce 32 segmentos y 9,0 minutos, pero repite
dieciocho veces el mismo texto después de los dos segmentos de cierre. El algoritmo
actual primero escala casi todas las pausas a 12 segundos y luego agrega un filler al
final. `validateScriptQuality` lo considera válido.

## Alcance de esta fase

Modificar únicamente:

- `src/lib/scriptEngine.ts`;
- `src/__tests__/scriptEngine.test.ts` o un nuevo test focalizado.

No modificar servidor, interfaz, voces, precios, proveedores, dependencias ni límites
de pausas.

## Diseño requerido

1. Separar la composición en `núcleo`, `expansión` y `cierre`.
2. El cierre se concatena una sola vez y siempre ocupa los dos últimos segmentos.
3. Reemplazar el filler infinito por un conjunto finito de indicaciones únicas:
   - indicaciones comunes de orientación, contacto, sonido y regreso;
   - indicaciones específicas para cada estilo;
   - ambas variantes lingüísticas escritas explícitamente.
4. Para completar la duración:
   - estimar siempre `núcleo + expansión actual + cierre`;
   - agregar una indicación candidata por vez hasta alcanzar el rango;
   - si falta poco tiempo, distribuir pausas adicionales en incrementos pequeños entre
     segmentos del núcleo y la expansión, sin alterar el cierre;
   - respetar 3.000–12.000 milisegundos;
   - no escalar todas las pausas indiscriminadamente al máximo.
5. Si se agota el conjunto de indicaciones antes de llegar a la tolerancia, fallar de
   forma explícita en desarrollo; nunca volver a repetir texto.
6. Mantener el texto íntimo completamente fuera de las indicaciones de expansión.

## Criterios obligatorios del caso 2

Entrada sintética:

- antes de dormir;
- estado disperso;
- intención descansar;
- práctica habitual;
- atención abierta;
- 10 minutos;
- español neutro;
- evitar `relájate`.

Salida:

- duración estimada entre 9 y 11 minutos;
- cero textos de segmento duplicados;
- cero `vos`, `podés`, `notá`, `volvé`, `seguí`, `llevá` o `permití`;
- no contiene `relájate`;
- adaptación explícita a práctica habitual;
- los dos últimos textos coinciden exactamente con `buildClosingBlock` para ese caso;
- ningún texto posterior al cierre;
- menos de la mitad de los segmentos con pausa de 12.000 milisegundos;
- `validateScriptQuality` válido.

## Regresión general mínima

Para duraciones 3, 5 y 10, ambas variantes y los cuatro estilos:

- dentro de tolerancia;
- tres a cuarenta segmentos;
- cero textos duplicados;
- cada pausa dentro de rango;
- `fullText` coincide con los segmentos;
- el cierre sigue siendo el final.

## Verificación final

1. `npm run format:check`
2. `npm run lint`
3. `npm test -- --run`
4. `npm run build`
5. Ejecutar el caso 2 y reportar duración, cantidad de segmentos, cantidad de
   duplicados, proporción de pausas máximas y los dos últimos segmentos.

