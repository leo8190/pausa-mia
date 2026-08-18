# Verificación del cierre de privacidad del guion

Estado: **VALIDADO EN CÓDIGO Y PRUEBAS, SIN API REAL**.

## Resultado independiente

| Verificación | Resultado |
| --- | --- |
| Formato | Aprobado |
| Análisis estático | Aprobado |
| Pruebas | 80 de 80 aprobadas en 11 archivos |
| Compilación de producción | Aprobada |
| Dependencias de producción | 0 vulnerabilidades informadas |

## Cobertura del fallo original

`src/__tests__/scriptPrivacy.test.ts` usa exactamente la situación sintética:

> Tuve varias reuniones seguidas y todavía me quedan tareas

La prueba confirma que:

- la frase completa no aparece en el guion local;
- ninguna secuencia contigua normalizada de cinco palabras aparece;
- `usedDetails` no contiene fragmentos libres;
- un diario seleccionado aporta sólo `context:selected` y nunca su contenido;
- diario no seleccionado y campos excluidos no aparecen;
- una salida simulada del proveedor que copia el texto es rechazada y cae al fallback
  local seguro;
- principiante y habitual reciben instrucciones diferentes;
- cada guion ofrece ojos abiertos, cambiar el ancla o detenerse;
- 3, 5 y 10 minutos quedan dentro de tolerancia en español argentino y neutro.

## Servidor

`server/__tests__/core.test.mjs` confirma:

- lista cerrada de `usedDetails`;
- rechazo de salida sin autonomía;
- rechazo de solapamiento sensible;
- prompt con prohibición de copiar más de tres palabras consecutivas;
- contexto delimitado como dato no confiable;
- duración, pausas, claves exactas, origen, tamaño y errores sanitizados;
- proveedor válido simulado aceptado y proveedor inválido rechazado.

## Límites

No se ejecutó una API real, voz premium, revisión visual ni prueba con personas. Las
pruebas automatizadas demuestran invariantes técnicas; no demuestran calidad humana,
eficacia, intención de pago ni ingreso.
