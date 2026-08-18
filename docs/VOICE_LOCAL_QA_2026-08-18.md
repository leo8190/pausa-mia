# Verificación local de voces — 2026-08-18

## Resultado

- Este Mac no tiene instalada ninguna voz con locale `es-AR`.
- La mejor opción femenina disponible para un español latino aproximadamente neutro es `Paulina` (`es-MX`).
- También está disponible `Mónica` (`es-ES`), pero su acento peninsular no corresponde al producto inicial.
- La aplicación debe informar el fallback cuando se pide argentino y no existe una voz `es-AR`; no debe presentar una voz mexicana o española como argentina.

Se generó una muestra local con Paulina a ritmo lento. Es una comprobación funcional gratuita, no la elección de voz de producción.

## Gate pendiente

Para validar la variante argentina hace falta instalar una voz argentina del sistema si Apple la ofrece en este equipo, o escuchar muestras comerciales de Azure `ElenaNeural`, ElevenLabs `Ignacio`/`Agustín` y Deepgram `Antonia`. No se instaló ni contrató nada sin autorización.
