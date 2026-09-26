# Voz cálida — 26/09/2026

Pedido directo de Leonardo: voz más calmada, menos robótica, amable y dulce.
Estado: implementación local verificada, sin publicar ni acreditar escucha humana.

## Alcance y separación

- Base pública comprobada `2c28166789ec01f016cf70cfb2ca801ba4bb0732`; rama
  `codex/warm-voice-20260926` en checkout limpio reutilizado
  `pausa-mia-comentarios-20260924`.
- La rama de métricas `codex/product-funnel-20260926` y su commit `e7e7e94`
  permanecen preservados: NO están incluidos en esta entrega. Tampoco L04,
  cuentas/Google, Android o iOS. El repositorio original sucio no recibe código.
- Cursor: su registro canónico no acredita acceso pago vigente; se aplica el
  fallback Codex que Leonardo autorizó cuando no se pueda verificar. No se
  renovó, midió cuota ni generó encargo en otra aplicación.

## Ajustes concretos

1. Piper navegador y remoto: silencio por oración 0.65 → 0.9 segundos. El navegador
   sólo agrega silencio entre oraciones; el CLI lo agrega tras cada oración. Ninguno
   recibe un silencio de apertura. Una oración corta inicial no se subdivide.
2. Se mantienen length_scale1.6, noise0.5/0.3, tono natural y reproducción1x. No se
   alargan más las consonantes, concatenan inferencias ni altera su fonetización.
3. Web Speech: preferir calidad Premium o Enhanced/Mejorada declarada en nombre/URI
   de una voz local ya expuesta; mantener prioridad del acento pedido y resultado
   estable cuando no existe una mejora etiquetada. En reemplazos genéricos se
   conserva la región de la primera candidata antes de comparar calidades. No elegir una nueva voz de red
   por su etiqueta ni descargar nada. Las etiquetas son una heurística; la API no
   certifica que una voz sea más dulce. El dispositivo puede no ofrecerlas.
4. Guion local en ambas variantes: llegada, primera práctica y una indicación de
   respiración con invitaciones más suaves. Se preservan «ritmo», «hacerlo perfecto»,
   preferencias, exclusiones, seguridad y consentimiento. Guiones IA sin cambios.

## Evidencia

- `npm test -- --reporter=dot`: **395/395**, 44 archivos (última suite completa).
- `npm run lint`, `npm run format:check`, `npm run build`: correctos.
- Servicio: **10/10** con ejecutor `tsx` ya instalado en el repositorio original;
  `tsc --noEmit --typeRoots .../voice-service/node_modules/@types -p tsconfig.json`
  correcto. No se instalaron dependencias ni se modificó el repositorio original.
- Regresión PCM: conserva muestras distintas al principio y final del WAV y un
  intervalo de ceros de longitud exacta sólo entre ambas oraciones. Esto comprueba
  ensamblado, no calidad de pronunciación del modelo ni ausencia perceptual de ruido.
- Selección: variantes argentina y neutra, etiquetas nombre/URI, preferencia por
  idioma, sin promoción de una voz remota etiquetada Premium y orden estable.
- Guion: invitaciones ambas variantes, palabras problemáticas intactas y duración
  editorial dentro de tolerancia. La duración real depende de la voz y los nuevos
  silencios añaden 0.25s por frontera (CLI también tras la última oración).
- No se realizaron nuevas peticiones de audio a Fly, síntesis con Piper real,
  escucha, reproducción física, visitas públicas, gastos, push ni despliegue.
- Auditor adicional de sólo lectura: detectó que el ranking inicialmente podía
  cambiar el acento del fallback genérico. Corregido antes de entregar: calidad
  sólo dentro de la misma región original, con dos regresiones adicionales. No
  cambió archivos ni usó proveedores.

## Fuentes consultadas y límite

- [Apple: voces y velocidad](https://support.apple.com/en-ie/111798): existencia
  de calidades distintas instalables; no prueba que Safari exponga todas ellas.
- [Piper: síntesis por oraciones](https://github.com/OHF-Voice/piper1-gpl/blob/main/src/piper/voice.py)
  y [CLI](https://github.com/OHF-Voice/piper1-gpl/blob/main/src/piper/__main__.py):
  controles de duración y silencios, no un control de emoción o dulzura.

La mejora es gradual; NO se afirma un timbre humano nuevo ni una valoración de
calidez aprobada. Próximo paso: entrega específica web/servicio (sin incluir métricas
ni L04) autorizada y escucha comparada en iPhone. Usar un guion sintético fijo con
«ritmo» y «hacerlo perfecto», dos oraciones seguidas y pausa/reanudación. Si el timbre
sigue sin satisfacer, comparar otra voz con consentimiento/costo resueltos antes de
cambiar de proveedor; no contratar por esta nota.
