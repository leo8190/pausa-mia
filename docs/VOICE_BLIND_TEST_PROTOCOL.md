# Protocolo ciego para elegir voces

## Estado

`PREPARADO, NO EJECUTADO`. No contratar proveedores ni compartir texto personal sin
autorización.

## Objetivo

Elegir una voz argentina y una voz de español neutro que funcionen para meditaciones
de 3, 5 y 10 minutos. El nombre, proveedor y precio se ocultan a quienes puntúan.

## Candidatas iniciales

### Argentina

- Azure `ElenaNeural`.
- ElevenLabs `Ignacio` y `Agustín`.
- Deepgram `Antonia`.

### Neutro

- Azure `PalomaNeural`.
- ElevenLabs `Antonio`.
- Deepgram `Selena`.
- Apple `Paulina` únicamente como baseline gratuito local.

La lista no determina ganadores. Si una voz no permite uso comercial o retiene textos
de forma incompatible, queda excluida aunque suene mejor.

## Muestras

Usar exactamente el mismo guion sintético, sin nombres ni situaciones reales:

1. 20 segundos de llegada y respiración natural.
2. 20 segundos con una palabra de pronunciación difícil: `podés`, `sentí`, `atención`,
   `respiración`, `suavemente`.
3. 20 segundos con dos pausas largas y un cierre.

Normalizar volumen; no agregar música ni reverberación. Exportar todos los archivos al
mismo formato y nombrarlos `Voz A`, `Voz B`, etcétera.

## Participantes

- Cinco adultos hispanohablantes.
- Al menos tres argentinos para evaluar rioplatense.
- Auriculares propios, volumen cómodo y orden de voces aleatorio.

## Puntaje — 100

- Naturalidad humana: 25.
- Acento correcto y consistente: 20.
- Calidez sin dramatización: 15.
- Claridad y pronunciación: 15.
- Ritmo y respeto de pausas: 10.
- Fatiga después de tres minutos: 10.
- Preferencia espontánea: 5.

Registrar además cualquier palabra mal pronunciada, respiración artificial, corte,
énfasis extraño o cambio de acento.

## Gate

- Mínimo 80/100 promedio.
- Ninguna candidata con error recurrente de acento o pronunciación.
- La argentina debe ser reconocida como argentina por al menos 4 de 5 sin ver la etiqueta.
- La neutra no debe ser percibida como marcadamente peninsular o regional por más de 1 de 5.
- Antes de contratar: verificar precio vigente, licencia comercial, retención, uso para
  entrenamiento, residencia de datos y posibilidad de borrado.

Si ninguna pasa, el prototipo conserva Web Speech como fallback honesto y no llama
“argentina” a una voz mexicana o española.

## Coste de la prueba

Primero usar demos o capas gratuitas oficiales. Si hiciera falta pagar, detenerse y
pedir autorización indicando proveedor, plan, importe final y renovación.
