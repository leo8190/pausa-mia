# Meditación a Medida

Prototipo web local, en español, que convierte un cuestionario breve y fuentes de
contexto opcionales en una meditación guiada reproducible como audio.

Proyecto separado del canal de YouTube **Mapa de la Meditación**.

## Objetivo de esta fase

Validar si una persona completa un check-in breve, recibe una meditación guiada
realmente personal y estaría dispuesta a pagar por repetir la experiencia.

## Requisitos

- Node.js 18+
- npm 9+

## Comandos

```bash
# Instalar dependencias
npm install

# Desarrollo local (solo frontend)
npm run dev

# Desarrollo con servidor IA local (opcional)
npm run server          # terminal 1
npm run dev             # terminal 2

# Formato
npm run format
npm run format:check

# Análisis estático
npm run lint

# Pruebas (unitarias + flujo React)
npm test

# Compilación de producción
npm run build

# Vista previa del build
npm run preview

# Auditoría de dependencias de producción
npm audit --omit=dev
```

## Flujo implementado

1. **Bienvenida y límites** — bienestar general, no terapia; sin persistencia por defecto.
2. **Consentimiento** — casillas no preseleccionadas; procesamiento sólo con permiso explícito.
3. **Check-in** — momento, estado, intención, experiencia, estilo, duración (3/5/10), voz.
4. **Contexto opcional** — diario manual (hoy/ayer/anteayer), importación local texto/JSON.
5. **Resumen editable** — quitar cualquier dato; elegir motor local o IA.
6. **Consentimiento IA** — si se elige IA, mostrar campos exactos a transmitir.
7. **Generación** — motor local por reglas o IA vía servidor local con fallback.
8. **Pausa de seguridad** — detector conservador; línea Argentina **0800-999-0091**.
9. **Revisión** — título, motor usado, duración estimada y texto completo.
10. **Reproducción** — Web Speech API con voz argentina/neutra y fallback explícito.
11. **Cierre** — valoración, repetición deseada y precios hipotéticos (sin checkout).
12. **Borrado** — limpia sesión, preferencias locales y cancela audio en curso.

## Arquitectura

```
src/
├── components/          # Pasos del flujo UI
├── hooks/               # useSession, useSpeechPlayer
├── lib/
│   ├── aiTransmissionPayload.ts # Payload mínimo único para vista previa y envío IA
│   ├── checkInSummary.ts        # Valores de resumen sin dependencia circular
│   ├── scriptEngine.ts       # Motor local + validación de calidad
│   ├── scriptProvider.ts     # Interfaz ScriptProvider (local + IA)
│   ├── contextSources.ts     # Diario manual e importación local
│   ├── preferencesStorage.ts # Solo variante, duración y estilo
│   ├── durationEstimator.ts  # Estimación por palabras + pausas
│   ├── situationReference.ts # Referencia breve sin citar literalmente
│   ├── safetyDetector.ts     # Pausa de seguridad
│   ├── voiceService.ts       # Web Speech API
│   ├── speechController.ts   # Cancelación global de audio
│   └── session.ts            # Estado de sesión en memoria
├── types/
└── __tests__/           # Unitarias + flujo React

server/
├── core.mjs             # Validadores puros importables sin escuchar puerto
└── index.mjs            # Servidor local OpenAI-compatible (clave solo aquí)
```

## Modos de generación

| Modo      | Descripción                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local** | Siempre disponible. Reglas determinísticas, sin red ni claves.                                                                                                                                                                                                                                         |
| **IA**    | Requiere `npm run server` con `.env` configurado. Consentimiento independiente. Payload mínimo (`operational`, `personal`, `context`) idéntico en vista previa, detalle JSON y solicitud; sin consentimientos en el cuerpo. Fallback local si falla. **Experimental** hasta prueba con proveedor real. |

Copiar `.env.example` a `.env` para probar IA. Sin `OPENAI_API_KEY`, el modo IA queda desactivado.

## Privacidad y almacenamiento

| Dato                                             | ¿Se guarda?                           | Dónde                                                                        |
| ------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------- |
| Respuestas de sesión (situación, estado, diario) | No por defecto                        | Solo memoria; se borra al cerrar sesión                                      |
| Preferencias (variante, duración, estilo)        | Solo con consentimiento explícito     | `localStorage` del navegador                                                 |
| Transmisión a IA                                 | Solo con consentimiento independiente | Servidor local → proveedor; cuerpo `{ payload }` sin flags de consentimiento |
| Diario completo a IA                             | Nunca                                 | Solo fragmentos seleccionados (máx. 200 chars/campo)                         |
| Coincidencia vista previa / envío                | Sí                                    | Mismo `AiTransmissionPayload`; detalle “Ver datos técnicos exactos”          |

**Borrar sesión** elimina datos en memoria, preferencias guardadas y cancela audio activo.

## Pausa de seguridad — Argentina

- Línea nacional: **0800-999-0091** (gratuita, confidencial, 24/7)
- Emergencias inmediatas: **911** o servicios locales
- Fuente oficial: https://www.argentina.gob.ar/node/492429
- No se usa 141 ni 107 como línea general de contención
- No diagnostica ni evalúa riesgo clínico

## Duración estimada

- Ritmo de narración: ~100 palabras/minuto + pausas entre segmentos
- Tolerancia documentada: **±1 minuto** respecto a la duración elegida (3/5/10)
- `estimatedMinutes` se calcula del guion real, no copia la opción elegida

## Verificaciones ejecutadas

| Comando                | Resultado                                                 |
| ---------------------- | --------------------------------------------------------- |
| `npm run format:check` | ✅                                                        |
| `npm run lint`         | ✅                                                        |
| `npm test`             | ✅ 69 tests (unitarias + servidor mockeado; sin API real) |
| `npm run build`        | ✅                                                        |
| `npm audit --omit=dev` | ✅ 0 vulnerabilidades                                     |

El modo IA sigue **experimental**: no se ejecutó ninguna llamada real a OpenAI en
esta verificación. Las pruebas de servidor usan `callProvider` mockeado y puerto efímero.
El servidor local valida entrada/salida, restringe orígenes a
`localhost`/`127.0.0.1` en puertos 5173 y 4173 (incluye `/api/health`), limita el
cuerpo a 16 KiB y usa Structured Outputs estrictos cuando el hostname es `api.openai.com`.

## Publicación estática pendiente — Pausa Mía

Estado: **preparado, no publicado**. Este workspace no tiene Git inicializado; el
commit, el push y la activación de Pages quedan pendientes y fuera de este repositorio
de trabajo.

Lo que quedó listo para publicar el sitio **Pausa Mía** en GitHub Pages:

| Archivo                       | Función                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `vite.config.ts`              | `base` configurable vía `VITE_BASE_PATH`, con `/pausa-mia/` por defecto       |
| `.gitignore`                  | Excluye `node_modules`, `dist`, `.env`, `*.tsbuildinfo` y artefactos de audio |
| `public/.nojekyll`            | Evita que GitHub Pages procese el sitio con Jekyll                            |
| `.github/workflows/pages.yml` | `npm ci` → `npm run build` → `upload-pages-artifact` → `deploy-pages`         |

### Base path

El `base` de Vite se toma de `VITE_BASE_PATH` y se normaliza para que siempre tenga
barra inicial y final. Sin variable definida, el build asume `/pausa-mia/`, que
corresponde a un repositorio llamado `pausa-mia` servido en
`https://<usuario>.github.io/pausa-mia/`.

```bash
# Build para otra subruta
VITE_BASE_PATH=/otro-nombre/ npm run build

# Build para dominio propio o raíz del sitio
VITE_BASE_PATH=/ npm run build
```

En el workflow, el valor se puede sobrescribir con una variable de repositorio
`VITE_BASE_PATH` sin editar el YAML. Como el `base` también aplica en desarrollo,
`npm run dev` sirve la app en `http://localhost:5173/pausa-mia/`.

### Qué queda fuera del sitio publicado

- El servidor local de IA (`server/`) no se despliega: Pages sirve sólo archivos estáticos.
- Sin `/api` disponible, `isAvailable()` falla de forma controlada y el sitio publicado
  funciona únicamente con el **motor local por reglas**, sin red ni claves.
- No se agregan OAuth, claves, cuentas, pagos ni analítica: el sitio no envía datos a terceros.
- Los artefactos de audio de `artifacts/` quedan ignorados por Git y no viajan al build.

### Publicación autorizada en curso

La publicación pública gratuita fue autorizada. Se creará el repositorio `pausa-mia`,
se publicará mediante GitHub Actions y se verificará la URL antes de difundirla.

## Limitaciones reales

- La calidad de voz depende del SO y navegador; no hay voz comercial.
- El detector de seguridad es conservador por frases, no evalúa riesgo clínico.
- El modo IA requiere servidor local y proveedor configurado; no se incluyen claves. Sigue experimental hasta una prueba real autorizada.
- No hay checkout, cuentas, OAuth real ni envío de datos a terceros en modo demo.
- OAuth (Google, redes) se muestra desactivado como función futura.
- En Safari/iOS la Web Speech API puede tener limitaciones.

## Límites del producto

- No es terapia, psicología, tratamiento ni diagnóstico.
- No promete curar, reducir ni resolver condiciones de salud.
- Sólo para mayores de 18 años.
- No reutiliza audio, voces ni credenciales de otros proyectos.

## Licencia

Prototipo de León Developments en fase de prueba pública controlada. La publicación
estática queda limitada al motor local por reglas; no se despliegan claves, servidor
IA, OAuth, datos del diario ni cuentas.
