# Corrección pendiente del motor de guiones

## Estado — motor local

**Cerrado.** El motor por reglas ya no inserta texto libre de `recentSituation`,
diarios ni fuentes importadas. Tras `#17` y el refuerzo de invariante local, el caso
sintético deja de reproducirse:

Entrada:

> Tuve varias reuniones seguidas y todavía me quedan tareas

Salida (reconocimiento categórico, sin eco del relato):

> Traés una situación reciente que elegiste tener en cuenta. No hace falta nombrarla ni
> resolverla durante esta pausa.

`usedDetails` usa sólo etiquetas seguras (`moment`, `perceivedState`,
`recentSituation:present`, …). La regresión vive en
`src/__tests__/scriptPrivacy.test.ts`
(`PENDING_SCRIPT_QUALITY_FIX: exact synthetic input…`).
`generateScript` lanza `LocalFreeTextLeakError` si algún solapamiento sensible
reapareciera.

## Evidencia histórica del fallo (antes del cierre)

Salida anterior:

> Traés algo reciente a esta pausa, relacionado con Tuve varias reuniones seguidas y
> todavía me quedan tareas. Lo tomamos como contexto, sin interpretarlo ni repetirlo
> literalmente.

El validador devolvía `valid: true` porque no recibía `freeTextSources`.

## Diseño requerido

### Fallback local

El motor por reglas no debe insertar texto libre de `recentSituation`, diarios ni
fuentes importadas. Debe usar sólo señales categóricas y presencia de contexto, por
ejemplo:

> Traés una situación reciente que elegiste tener en cuenta. No hace falta nombrarla ni
> resolverla durante esta pausa.

Puede personalizar con momento, estado categórico, intención, experiencia, estilo,
duración y variante. El contenido libre queda reservado al modo de inteligencia
artificial con consentimiento independiente.

`usedDetails` debe contener etiquetas seguras como `moment`, `perceivedState`,
`recentSituation:present`, `context:selected` o `intention`, nunca fragmentos de texto
personal.

### Salida de inteligencia artificial

- Rechazar cualquier secuencia textual larga copiada del contexto. Como mínimo,
  detectar secuencias exactas normalizadas de cinco palabras o más y fragmentos
  distintivos de más de 30 caracteres.
- El prompt debe prohibir copiar más de tres palabras consecutivas del relato.
- `usedDetails` debe limitarse a identificadores permitidos y realmente transmitidos;
  no aceptar texto libre generado por el modelo.
- Ejecutar el detector antes de mostrar, reproducir o guardar el guion; ante fallo,
  fallback local.

### Autonomía

Cada guion debe incluir al menos una opción clara para mantener ojos abiertos, cambiar
el ancla o detenerse si algo resulta incómodo. No debe asumirse que cerrar los ojos o
focalizar en la respiración es cómodo para todos.

## Pruebas obligatorias

1. La frase sintética completa y cada secuencia de cinco palabras están ausentes del
   guion y de `usedDetails`. ✅ local
2. Un diario seleccionado puede afectar la presencia de contexto, pero su contenido no
   aparece en el fallback local. ✅ local
3. Una fuente no seleccionada y un campo excluido no aparecen en ninguna capa. ✅ local
4. `usedDetails` contiene sólo identificadores de allowlist. ✅ local
5. Una respuesta de proveedor que copia el relato se rechaza y activa fallback. ✅
6. Principiante y habitual producen instrucciones claramente diferentes. ✅
7. Existe una alternativa explícita de autonomía. ✅
8. Duraciones 3, 5 y 10 siguen dentro de tolerancia y ambas variantes son consistentes. ✅

## Gate

No habilitar diarios reales ni pruebas no moderadas hasta que el caso sintético deje de
copiar el relato y el detector falle correctamente ante una salida maliciosa simulada.
El caso sintético local ya está cerrado; mantener el gate de solapamiento en la ruta IA.
