# Verificación visual y de audio — 2026-08-18

Estado: `VALIDADO` para el prototipo local con datos sintéticos.

## Superficies verificadas

- Cursor Desktop abierto en el workspace `app-meditacion-personalizada` y el chat
  visible `León Developments workspace`.
- Browser de Cursor en escritorio.
- Navegador de prueba con viewport exacto de `390 × 844`.
- Motor local por reglas; no se llamó a proveedores externos ni se activó OAuth.

## Datos sintéticos usados

- Situación reciente: `Tuve varias reuniones seguidas y todavía me quedan tareas`.
- Diario seleccionado: `Hoy terminé una tarea importante y quiero bajar el ritmo.`
- Diario no seleccionado: `CENTINELA_DIARIO_NO_SELECCIONADO`.
- Pausa laboral, estado acelerado, intención de calmar el ritmo, primera vez,
  respiración natural, tres minutos y español argentino.

## Resultados del recorrido

| Comprobación                                                     | Resultado                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Consentimientos inicialmente desmarcados                         | Aprobado                                                      |
| Continuación bloqueada sin consentimiento requerido              | Aprobado                                                      |
| Preferencias opcionales permanecen desmarcadas                   | Aprobado                                                      |
| Cuestionario completo                                            | Aprobado                                                      |
| Diario seleccionado visible y centinela no seleccionado ausente  | Aprobado                                                      |
| Exclusión desde el resumen y restauración                        | Aprobado                                                      |
| Generación local de 3 minutos                                    | Aprobado; estimación de 3,2 minutos dentro de tolerancia      |
| Frase íntima exacta ausente del guion                            | Aprobado                                                      |
| Centinela no seleccionado ausente del guion                      | Aprobado                                                      |
| Opción explícita de abrir los ojos, cambiar el ancla o detenerse | Aprobado                                                      |
| Reproducción, pausa, continuación y detención                    | Aprobado                                                      |
| Fallback de voz argentina informado                              | Aprobado; usa Paulina `es-MX`, sin presentarla como argentina |
| Valoración, intención de repetir y precio hipotético             | Aprobado                                                      |
| Integraciones futuras desactivadas y sin permisos                | Aprobado                                                      |

## Resultado responsive

En `390 × 844`, bienvenida, check-in, resumen, revisión del guion y cierre
registraron:

- ancho interno: `390`;
- sin desborde horizontal;
- cero elementos visibles fuera de los límites laterales;
- sin errores ni advertencias de consola durante el recorrido.

## Hallazgo corregido por Cursor

La selección `Sí`/`No` cambiaba el estado, pero las clases visuales se
contradecían y la opción elegida no quedaba clara. Cursor corrigió:

- un único estado visual mediante `choice-btn.selected`;
- `aria-pressed` en ambas opciones;
- foco visible de teclado;
- pruebas de estado inicial, selección de `Sí` y cambio a `No`.

Verificación independiente posterior:

- formato: aprobado;
- análisis estático: aprobado;
- pruebas: `83/83` en `12` archivos;
- esta cifra corresponde a la auditoría histórica del 2026-08-18; la suite actual
  publicada es de `172` pruebas en `19` archivos (ver `README.md` y la matriz de
  cumplimiento);
- compilación de producción: aprobada;
- prueba manual móvil: `aria-pressed` y clases cambian correctamente entre
  `Sí` y `No`.

## Límites pendientes

- No se validó una voz argentina real o premium; no existe una voz `es-AR`
  instalada en este Mac.
- No se ejecutó una llamada real a un proveedor de inteligencia artificial.
- Faltan revisión humana ciega de guiones, cinco pruebas moderadas y evidencia
  de un pago real autorizado.

## Seguimiento 2026-08-26 — borrado visual de sesión

El camino crítico ítem 5 quedó cubierto en código y pruebas:

- Confirmación explícita en `DeletedStep` (`Borrado confirmado` + checklist).
- `deleteSession` vacía estado, borra `mam-saved-preferences` y cancela todos los
  motores registrados (Web Speech y el `HTMLAudioElement` único de #19).
- Evidencia automática: `src/__tests__/sessionWipe.test.tsx`.
- Evidencia visual: recorrido en navegador con captura de la pantalla de
  confirmación (ver artefacto del PR de borrado visual).
