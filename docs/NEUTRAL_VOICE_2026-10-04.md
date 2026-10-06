# Español neutro — alternativa local — 04/10/2026

Pedido: Leonardo describe la voz neutra pública como robótica. Se confirma en el
código `ba75cb7` que la variante neutra utiliza Web Speech (voz del dispositivo),
mientras la argentina tiene modelo neuronal. Preferir voces Premium/Enhanced ya
estaba implementado, pero no garantiza una buena voz instalada.

## Implementado; no publicado

Rama `codex/neutral-neural-voice-20261004`, checkout reutilizado
`pausa-mia-comentarios-20260924`. El original divergido no recibe código.

- Modelo latinoamericano `es_MX-ald-medium` para español neutro. Versión fija
  `c10ece1aade47bb51c153c893d14e5bf8e5b7117`; 63.201.294 bytes; 22.050 Hz,
  espeak `es-419`. Es una voz mexicana masculina, no argentina ni sin acento.
- Ambas opciones preparan su audio mediante un botón sencillo, sólo después
  de la acción del usuario. Sólo se descargan recursos del motor/modelo; no se
  envía el guion a otro servicio. Caché persistente del modelo, no del texto/audio.
- Se conservan las pausas de 0,9 s, length_scale sereno y reproducción 1x;
  no se ralentiza otra vez ni se reescriben consonantes para disimular errores.
- Modelo, sesión y verificación separados por variante. La apertura se reutiliza
  una sola vez. Cambiar voz cancela el trabajo y descarta respuestas tardías.
- Neutro nunca accede al endpoint argentino. Fallos ofrecen explícitamente otra
  voz instalada; no se vuelve a la voz del dispositivo de forma silenciosa.
- No se modifica voz argentina, servidor, modelos pagos, cuentas, Google, analítica,
  precios, marketing, Android ni iPhone. No compras, renovaciones ni otros despachos.

## Fuentes y límite de derechos

- [MODEL_CARD Ald](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/medium/MODEL_CARD):
  dataset bajo Unlicense y modelo ajustado desde davefx.
- [Dataset](https://huggingface.co/datasets/rmcpantoja/Ald_Mexican_Spanish_speech_dataset):
  identifica a Aldo y declara uso para texto a voz, licencia Unlicense.
- [MODEL_CARD davefx](https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_ES/davefx/medium/MODEL_CARD):
  dataset CC0. El MIT general del repositorio no reemplaza la ficha del dataset.

Esta verificación documenta las licencias publicadas, no acredita por sí misma
un permiso independiente de la persona narradora ni aprueba redistribución comercial
o publicación en tiendas. No se resuelven los gates legales pendientes de ese flujo.
Claude high se descartó como primera opción por procedencia menos clara; no se
confunde la etiqueta high con mayor calidez auditiva.

## Verificación

- 467/467 pruebas, 51 archivos; lint, formato, TypeScript, Vite y diff-check correctos.
  Diez regresiones adicionales y adaptación de expectativas del flujo neutro.
- Pruebas: descarga diferida, modelos aislados, verificación real distinta por
  voz, aborto antes/durante inferencia, cambio de variante, reutilización inicial,
  sin texto remoto/Web Speech automático, error explícito y controles nativos.
- Síntesis real en el navegador integrado con ONNX/WASM: muestra de tres oraciones
  producida en 21,2 s, incluida primera descarga. Texto fijo: «Puedes ir a tu propio
  ritmo. No necesitas hacerlo perfecto. Permite que los hombros descansen, suavemente.»
- Tras el cambio final de código, recarga y modelo ya cacheado, la misma muestra
  se preparó en 2,0 s. Son dos observaciones en esta Mac, no un benchmark universal
  ni una medición de latencia en iPhone.
- No se reprodujo sonido en el host; calidad perceptual pendiente. El resultado
  prueba que produce audio, no que sea más dulce ni que pronuncie perfecto/ritmo bien.
- Preview de desarrollo local (no incluida en el build de publicación):
  `http://127.0.0.1:5192/pausa-mia/docs/neutral-voice-preview.html`.
  La descarga automática del WAV por Browser agotó el plazo; no se repite ese método
  ni se consideró el archivo guardado sin evidencia. El botón normal tampoco
  notificó un evento en ocho segundos, pero se verificó luego el archivo exacto
  en Downloads, creado a las 23:11 ART, y se conservó una copia en visualizaciones.
  WAV PCM s16le, mono, 22.050 Hz, 13,560907 s, 598.080 bytes, SHA-256
  `072a26fb781569fe3ba78f4a16c9768c45a91bb3195021515a14bdb7d8ff92aa`.
  Archivo de entrega:
  `/Users/leonardoapollonio/.codex/visualizations/2026/08/19/01a019db-aad9-73d2-8339-9e30a3d7aa9e/neutral-voice-sample-20261004.wav`.
  No se reprodujo sonido automáticamente ni se eludieron permisos.

## Ajuste tras escucha — 05/10/2026

Leonardo dice que el timbre suena bien, pero está demasiado lento; pide sólo un
pequeño aumento. Se cambia exclusivamente el factor de duración neutro 1,6 → 1,5
durante la síntesis, no la velocidad del reproductor. Argentina permanece en 1,6;
las pausas de 0,9 s, fonemas, modelo, ruido y frecuencia de muestreo no cambian.
La elección independiente de su voz clonada sigue preservada en LEONARDO_VOICE.md;
este candidato no se convierte por este ajuste en la voz definitiva del producto.

469/469 pruebas (51 archivos), lint, formato, build y diff-check correctos. Dos
regresiones nuevas comprueban el factor neutro y la conservación de fonemas y
silencios; se refuerza la separación de factores argentino/neutro en la inferencia.
Muestra real del mismo texto generada en Browser/ONNX/WASM, preparación 2,1 s.
Duración 12,748209 s frente a 13,560907 s de la muestra anterior: aproximadamente
6,4% más rápida para ese texto completo. No es un porcentaje universal por frase.

WAV PCM mono 22.050 Hz, 562.240 bytes, SHA-256
`25d08a1ef5248ba28a5fe222c8bea23c5e42125228ec7f0eeebaaff367bcfa29`.
Artefactos en visualizaciones del chat: `neutral-voice-sample-20261005.wav` y
`neutral-voice-faster-20261005.png`. Se conserva la muestra anterior, sin sobrescribir.
Sin escucha automática, publicación, credenciales, costos ni prueba física iPhone.

## Memoria de las voces — mejora local — 05/10/2026

Pedido posterior de Leonardo: avanzar con lo conveniente. Rama
`codex/voice-memory-20261005`, base `02fd999`. El Map anterior podía retener ambas
sesiones grandes después de alternar. Ahora hay una sola sesión residente y una
cola global desde preparación hasta WAV completo: la voz anterior se libera con
ONNX `release()` únicamente después de que termina toda su inferencia y antes de
cargar otra variante. API confirmada en el SDK instalado 1.18.0, no asumida.

La caché de archivos por URL se conserva, al igual que la verificación histórica
de síntesis por variante. Pedidos simultáneos comparten una carga; los cancelados
en espera no cargan/expulsan modelos. Crear o sintetizar con error no envenena la
cola. Si falla la liberación, se bloquean nuevas cargas locales sin reintentos;
la interfaz explica que recargar pierde la sesión, preserva lectura y ofrece otra
voz sólo tras elección explícita. No se recarga ni descarta información sola.

476/476 pruebas, 51 archivos; lint, formato, TypeScript, build y diff-check
correctos. Seis regresiones nuevas de ciclo/concurrencia y una de error visible,
con servicios simulados. Reset de pruebas asíncrono: espera trabajos y libera antes
de limpiar. Auditor de sólo lectura revisó el diff, sin defectos concretos abiertos.

Sin cambio de modelos, fonemas, cadencias, pausas, guion o permisos. No síntesis
real nueva, escucha, QA físico, publicación, servicios, credenciales ni gasto.
La mejora limita sesiones residentes por código y pruebas; **no acredita una
reducción medida de RAM** ni tiempos reales de cambio de voz en iPhone/Android.
La integración de la voz de Leonardo y el acceso de General se conservan aparte.

## Siguiente fase

Comparar la cadencia ajustada antes de elegir el candidato como voz definitiva,
conservando la elección independiente de voz de Leonardo. Medir memoria/latencia y reproducción en iPhone real,
incluido cambio de variante con una sola sesión residente y caché de archivos.
Si la calidad no alcanza, comparar otro modelo/proveedor sin contratar ni transferir
texto personal hasta resolver costo, licencia y consentimiento. Esta fase local
no acredita entrega en producción ni sustituye el trabajo nativo de los operadores.
