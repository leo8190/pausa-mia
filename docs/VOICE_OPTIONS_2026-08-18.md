# Opciones de voz verificadas — 2026-08-18

Comparación basada en documentación y catálogos oficiales. Antes de elegir una voz
definitiva hace falta una escucha ciega con argentinos usando el mismo guion.

## Recomendación

- **Prototipo sin costo de consumo:** Azure AI Speech, capa gratuita, con
  `es-AR-ElenaNeural` para Argentina y `es-US-PalomaNeural` como español latino
  aproximadamente neutro.
- **Producción premium:** ElevenLabs `multilingual_v2`; probar `Ignacio` o `Agustín`
  para Argentina y `Antonio` para neutro.
- **Respaldo económico:** Azure o Deepgram Aura-2 con `Antonia` (`es-AR`) y `Selena`
  (`es-419`).
- **Demostración sin crear cuenta:** Web Speech API del navegador; su calidad y
  catálogo dependen del dispositivo.

## Calidad y precio público

| Proveedor | Argentina y neutro | Capa gratuita | Precio publicado aproximado |
|---|---|---:|---:|
| Azure AI Speech | `ElenaNeural`, `TomasNeural`; `PalomaNeural`, `AlonsoNeural` | 500.000 caracteres al mes | 15 dólares por millón de caracteres |
| ElevenLabs | `Ignacio`, `Agustín`, `Malena`; `Antonio` | 10.000 caracteres en modelos expresivos o 20.000 en Flash | Starter 6 dólares al mes; 0,10 dólares por 1.000 caracteres en modelos expresivos y 0,05 en Flash |
| Deepgram Aura-2 | `Antonia` `es-AR`; `Selena` `es-419` | promoción inicial, no capa permanente | 30 dólares por millón de caracteres |
| Google Cloud | no tiene `es-AR`; sí `es-US` y `es-ES` | 1 millón en Chirp 3 HD o Neural2 | 30 dólares por millón en Chirp 3 HD; 16 en Neural2 |
| OpenAI | español, pero sin voz fija `es-AR` y voces optimizadas para inglés | sin cuota monetaria estable publicada | 15 dólares por millón en `tts-1`; 30 en `tts-1-hd` |

Una meditación de cinco minutos suele rondar 4.000 caracteres. Fuera de las capas
gratuitas, eso da aproximadamente 0,06 dólares en Azure, 0,12 en Deepgram, 0,20 en
ElevenLabs Flash o 0,40 en ElevenLabs `multilingual_v2`.

## Fuentes oficiales

- [Voces e idiomas de Azure](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)
- [Precios de Azure Speech](https://azure.microsoft.com/en-us/pricing/details/speech/)
- [Voces argentinas de ElevenLabs](https://elevenlabs.io/text-to-speech/argentine-accent)
- [Modelos de ElevenLabs](https://elevenlabs.io/docs/overview/models)
- [Precios de ElevenLabs](https://elevenlabs.io/pricing/api)
- [Voces de Deepgram](https://developers.deepgram.com/docs/tts-models)
- [Precios de Deepgram](https://deepgram.com/pricing)
- [Voces de Google Cloud](https://cloud.google.com/text-to-speech/docs/voices)
- [Precios de Google Cloud](https://cloud.google.com/text-to-speech/pricing?hl=es-419)
- [Guía de texto a voz de OpenAI](https://developers.openai.com/api/docs/guides/text-to-speech)
- [Precio de OpenAI `tts-1`](https://developers.openai.com/api/docs/models/tts-1)
- [Precio de OpenAI `tts-1-hd`](https://developers.openai.com/api/docs/models/tts-1-hd)

## Privacidad operativa

El proveedor de voz sólo debe recibir el guion final, nunca el cuestionario ni el
diario. Antes de una integración comercial se revisarán retención, uso para mejora de
modelos, región, contrato y derecho de uso de cada voz.

