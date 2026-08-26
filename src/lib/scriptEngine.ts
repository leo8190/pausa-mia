import type {
  CheckInData,
  ConsentState,
  ContextSource,
  Duration,
  Experience,
  GeneratedScript,
  Intention,
  MeditationStyle,
  Moment,
  PerceivedState,
  ScriptEngineType,
  ScriptSegment,
  VoiceVariant,
} from '../types';
import { INTENTION_LABELS } from '../types';
import {
  estimateMinutesFromSegments,
  DURATION_TOLERANCE_MINUTES,
  isDurationWithinTolerance,
} from './durationEstimator';
import { buildSituationRecognitionPhrase } from './situationReference';
import { getSelectedContextSources } from './contextSources';
import { type SafeUsedDetailId, validateUsedDetailsAllowlist } from './safeUsedDetails';
import {
  collectLocalForbiddenFreeTextSources,
  detectSensitiveOverlapInScript,
} from './sensitiveOverlap';
import {
  buildAiTransmissionPayload,
  payloadToPreviewEntries,
} from './aiTransmissionPayload';

export class ConsentRequiredError extends Error {
  constructor() {
    super('Se requiere consentimiento de procesamiento de sesión activo.');
    this.name = 'ConsentRequiredError';
  }
}

/** El motor local intentó insertar texto libre sensible en el guion o usedDetails. */
export class LocalFreeTextLeakError extends Error {
  constructor() {
    super(
      'El motor local no puede insertar texto libre de situación, diario ni fuentes importadas.',
    );
    this.name = 'LocalFreeTextLeakError';
  }
}

/** Se lanza sólo en desarrollo cuando el conjunto finito de indicaciones no alcanza. */
export class ScriptDurationError extends Error {
  constructor(estimated: number, target: number) {
    super(
      `No se alcanzó la duración objetivo sin repetir texto: ${estimated} min para un objetivo de ${target} min.`,
    );
    this.name = 'ScriptDurationError';
  }
}

const MIN_SCRIPT_SEGMENTS = 3;
const MAX_SCRIPT_SEGMENTS = 40;
const MIN_SEGMENT_PAUSE_MS = 3000;
const MAX_SEGMENT_PAUSE_MS = 12000;

/**
 * Techo de trabajo para el ajuste fino de pausas. Queda por debajo del máximo
 * absoluto para no llevar todos los segmentos a 12.000 ms.
 */
const TUNING_MAX_PAUSE_MS = 11000;
const PAUSE_TUNING_STEP_MS = 250;

/**
 * Margen extra al decidir cuántas indicaciones agregar, para que el ajuste fino
 * no tenga que llevar todas las pausas al techo y queden diferenciadas.
 */
const EXPANSION_HEADROOM_MINUTES = 1.2;

/** Indicaciones de estilo o intención exigidas dentro de la práctica central. */
const MIN_FOCUS_SEGMENTS_BY_DURATION: Record<Duration, number> = {
  3: 3,
  5: 4,
  10: 8,
};

/**
 * En tres minutos la preparación se recorta para que la práctica no quede
 * reducida a un apéndice del reconocimiento inicial.
 */
const SHORTEST_DURATION: Duration = 3;

/** Indicaciones de estilo por cada indicación común dentro de la expansión. */
const FOCUS_PER_COMMON_PHRASE = 4;

/** Estilo usado como práctica por defecto cuando la persona no eligió ninguno. */
const FALLBACK_STYLE: MeditationStyle = 'respiracion-natural';

type VariantPhrase = Record<VoiceVariant, string>;

interface TimedPhrase {
  text: VariantPhrase;
  pauseAfterMs: number;
}

type DetailSegmentMap = Partial<Record<SafeUsedDetailId, ScriptSegment[]>>;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length];
}

function toSegment(phrase: TimedPhrase, variant: VoiceVariant): ScriptSegment {
  return { text: phrase.text[variant], pauseAfterMs: phrase.pauseAfterMs };
}

function addDetailSegment(
  detailSegments: DetailSegmentMap,
  detailId: SafeUsedDetailId,
  segment: ScriptSegment,
): void {
  detailSegments[detailId] = [...(detailSegments[detailId] ?? []), segment];
}

function mergeDetailSegments(...maps: DetailSegmentMap[]): DetailSegmentMap {
  const merged: DetailSegmentMap = {};
  for (const map of maps) {
    for (const [detailId, segments] of Object.entries(map) as [
      SafeUsedDetailId,
      ScriptSegment[],
    ][]) {
      if (segments.length === 0) continue;
      merged[detailId] = [...(merged[detailId] ?? []), ...segments];
    }
  }
  return merged;
}

function collectUsedDetails(
  segments: ScriptSegment[],
  detailSegments: DetailSegmentMap,
): SafeUsedDetailId[] {
  const segmentTexts = new Set(segments.map((segment) => normalizeText(segment.text)));
  return (Object.entries(detailSegments) as [SafeUsedDetailId, ScriptSegment[]][])
    .filter(([, detailGroup]) =>
      detailGroup.some((segment) => segmentTexts.has(normalizeText(segment.text))),
    )
    .map(([detailId]) => detailId);
}

// ---------------------------------------------------------------------------
// Llegada
// ---------------------------------------------------------------------------

const MOMENT_ARRIVAL: Record<Moment, VariantPhrase[]> = {
  ahora: [
    {
      'es-AR': 'Cualquier cosa que estuvieras haciendo puede esperar unos minutos.',
      'es-neutro': 'Cualquier cosa que estuvieras haciendo puede esperar unos minutos.',
    },
    {
      'es-AR': 'Este rato es un paréntesis en el medio de todo lo demás.',
      'es-neutro': 'Este rato es un paréntesis en el medio de todo lo demás.',
    },
  ],
  'antes-de-dormir': [
    {
      'es-AR': 'El día ya terminó. Lo que quedó sin hacer va a seguir estando mañana.',
      'es-neutro':
        'El día ya terminó. Lo que quedó sin hacer va a seguir estando mañana.',
    },
    {
      'es-AR': 'Es la hora en que todo se aquieta, aunque la cabeza tarde un poco más.',
      'es-neutro':
        'Es la hora en que todo se aquieta, aunque la cabeza tarde un poco más.',
    },
  ],
  'al-despertar': [
    {
      'es-AR':
        'El día todavía no empezó del todo. Podés quedarte un rato en ese borde.',
      'es-neutro':
        'El día todavía no empezó del todo. Puedes quedarte un rato en ese borde.',
    },
    {
      'es-AR': 'Antes de la primera tarea hay un momento que todavía es tuyo.',
      'es-neutro': 'Antes de la primera tarea hay un momento que todavía es tuyo.',
    },
  ],
  'pausa-laboral': [
    {
      'es-AR':
        'La jornada sigue afuera y va a seguir estando cuando termine esta pausa.',
      'es-neutro':
        'La jornada sigue afuera y va a seguir estando cuando termine esta pausa.',
    },
    {
      'es-AR': 'En medio de la jornada, este rato no le pertenece a ninguna tarea.',
      'es-neutro': 'En medio de la jornada, este rato no le pertenece a ninguna tarea.',
    },
  ],
};

const EXPERIENCE_ADAPTATION: Record<Experience, TimedPhrase> = {
  'primera-vez': {
    text: {
      'es-AR':
        'Si es tu primera vez con una pausa así, no hace falta hacerlo perfecto: alcanza con probarla a tu ritmo.',
      'es-neutro':
        'Si es tu primera vez con una pausa así, no hace falta hacerlo perfecto: basta con probarla a tu ritmo.',
    },
    pauseAfterMs: 4000,
  },
  basica: {
    text: {
      'es-AR':
        'Como ya tenés algo de práctica, podés ir derecho a lo que se nota, sin una guía larga.',
      'es-neutro':
        'Como ya tienes algo de práctica, puedes ir directo a lo que se nota, sin una guía larga.',
    },
    pauseAfterMs: 4000,
  },
  habitual: {
    text: {
      'es-AR':
        'Podés apoyarte en tu práctica habitual y ajustar lo que no te sirva sin pedir permiso.',
      'es-neutro':
        'Puedes apoyarte en tu práctica habitual y ajustar lo que no te sirva sin pedir permiso.',
    },
    pauseAfterMs: 3500,
  },
};

const EXPERIENCE_PRACTICE_SUPPORT: Record<Experience, TimedPhrase> = {
  'primera-vez': {
    text: {
      'es-AR': 'Tomá una sola indicación por vez. Si te perdés, volvé a esa y alcanza.',
      'es-neutro':
        'Toma una sola indicación por vez. Si te pierdes, vuelve a esa y basta.',
    },
    pauseAfterMs: 5500,
  },
  basica: {
    text: {
      'es-AR':
        'Cuando una indicación te sirva, quedate con ella unos instantes antes de pasar a la siguiente.',
      'es-neutro':
        'Cuando una indicación te sirva, quédate con ella unos instantes antes de pasar a la siguiente.',
    },
    pauseAfterMs: 6000,
  },
  habitual: {
    text: {
      'es-AR':
        'Si algo de la voz sobra, podés dejarlo de fondo y seguir el hilo de tu práctica.',
      'es-neutro':
        'Si algo de la voz sobra, puedes dejarlo de fondo y seguir el hilo de tu práctica.',
    },
    pauseAfterMs: 6000,
  },
};

function buildArrivalBlock(
  checkIn: CheckInData,
  excluded: Set<string>,
  variant: VoiceVariant,
): { segments: ScriptSegment[]; detailSegments: DetailSegmentMap } {
  const detailSegments: DetailSegmentMap = {};
  const segments: ScriptSegment[] = [];
  const seed = hashString(JSON.stringify(checkIn));

  const openings =
    variant === 'es-AR'
      ? [
          'Tomate un momento para detenerte.',
          'Permitite que este espacio sea solo para vos.',
          'Podés quedarte acá, sin apuro.',
        ]
      : [
          'Toma un momento para detenerte.',
          'Permite que este espacio sea solo para ti.',
          'Puedes quedarte aquí, sin apuro.',
        ];

  segments.push({ text: pick(openings, seed), pauseAfterMs: 3000 });

  if (!excluded.has('name') && checkIn.name.trim()) {
    const name = checkIn.name.trim();
    const segment = {
      text: `Gracias por darte este rato, ${name}.`,
      pauseAfterMs: 2500,
    };
    segments.push(segment);
    addDetailSegment(detailSegments, 'name', segment);
  }

  if (!excluded.has('moment') && checkIn.moment) {
    const segment = {
      text: pick(MOMENT_ARRIVAL[checkIn.moment], seed)[variant],
      pauseAfterMs: 3500,
    };
    segments.push(segment);
    addDetailSegment(detailSegments, 'moment', segment);
  }

  const experience = checkIn.experience as Experience | '';
  if (!excluded.has('experience') && experience) {
    const segment = toSegment(EXPERIENCE_ADAPTATION[experience], variant);
    segments.push(segment);
    addDetailSegment(detailSegments, 'experience', segment);
  }

  // En sesiones cortas o con poco contexto, el asentamiento genérico alarga el
  // preámbulo sin aportar práctica. Se reserva para pausas más largas con más datos.
  const hasRichContext =
    (!excluded.has('perceivedState') && Boolean(checkIn.perceivedState)) ||
    (!excluded.has('recentSituation') && Boolean(checkIn.recentSituation.trim()));
  if (
    checkIn.duration > 5 ||
    (checkIn.duration > SHORTEST_DURATION && hasRichContext)
  ) {
    const settle =
      variant === 'es-AR'
        ? 'No hace falta cambiar nada todavía. Alcanza con notar que estás acá.'
        : 'No hace falta cambiar nada todavía. Basta con notar que estás aquí.';
    segments.push({ text: settle, pauseAfterMs: 4500 });
  }

  return { segments, detailSegments };
}

// ---------------------------------------------------------------------------
// Reconocimiento
// ---------------------------------------------------------------------------

const STATE_RECOGNITION: Record<PerceivedState, VariantPhrase> = {
  tranquilo: {
    'es-AR':
      'Llegás con algo de calma ya puesta. No hace falta cuidarla, solo notarla.',
    'es-neutro':
      'Llegas con algo de calma ya puesta. No hace falta cuidarla, solo notarla.',
  },
  acelerado: {
    'es-AR':
      'Venís con el cuerpo todavía acelerado, como si algo siguiera corriendo por dentro.',
    'es-neutro':
      'Vienes con el cuerpo todavía acelerado, como si algo siguiera corriendo por dentro.',
  },
  disperso: {
    'es-AR':
      'La atención se va para varios lados a la vez. Es lo que hay ahora y sirve igual.',
    'es-neutro':
      'La atención se va para varios lados a la vez. Es lo que hay ahora y sirve igual.',
  },
  cansado: {
    'es-AR': 'Hay cansancio, y el cansancio no es un obstáculo para esto.',
    'es-neutro': 'Hay cansancio, y el cansancio no es un obstáculo para esto.',
  },
  sensible: {
    'es-AR':
      'Hay algo sensible despierto hoy. Puede quedarse sin que tengas que abrirlo.',
    'es-neutro':
      'Hay algo sensible despierto hoy. Puede quedarse sin que tengas que abrirlo.',
  },
  otro: {
    'es-AR': 'Sea lo que sea que traés, puede entrar acá tal como está.',
    'es-neutro': 'Sea lo que sea que traes, puede entrar aquí tal como está.',
  },
};

const INTENTION_RECOGNITION: Record<Intention, VariantPhrase> = {
  'calmar-ritmo': {
    'es-AR': 'Lo que buscás es que el ritmo afloje, y eso no se fuerza: se permite.',
    'es-neutro':
      'Lo que buscas es que el ritmo afloje, y eso no se fuerza: se permite.',
  },
  concentrarse: {
    'es-AR': 'Venís a reunir la atención en un solo lugar, sin apretarla.',
    'es-neutro': 'Vienes a reunir la atención en un solo lugar, sin apretarla.',
  },
  descansar: {
    'es-AR':
      'Venís a descansar, y descansar acá es dejar de sostener lo que ya podés soltar.',
    'es-neutro':
      'Vienes a descansar, y descansar aquí es dejar de sostener lo que ya puedes soltar.',
  },
  'aceptar-emocion': {
    'es-AR':
      'Venís a hacerle lugar a algo que estás sintiendo, sin tener que resolverlo.',
    'es-neutro':
      'Vienes a hacerle lugar a algo que estás sintiendo, sin tener que resolverlo.',
  },
  'volver-al-cuerpo': {
    'es-AR': 'Venís a volver al cuerpo, que estuvo acá todo el tiempo.',
    'es-neutro': 'Vienes a volver al cuerpo, que estuvo aquí todo el tiempo.',
  },
};

/** Cuando estilo e intención podrían contradecirse, la frase de intención cambia. */
const INTENTION_RECOGNITION_BY_STYLE: Record<string, VariantPhrase> = {
  'atencion-abierta|concentrarse': {
    'es-AR':
      'Venís a concentrarte sosteniendo un campo amplio: el conjunto es el lugar al que volvés.',
    'es-neutro':
      'Vienes a concentrarte sosteniendo un campo amplio: el conjunto es el lugar al que vuelves.',
  },
};

function buildRecognitionBlock(
  checkIn: CheckInData,
  excluded: Set<string>,
  variant: VoiceVariant,
  contextSources: ContextSource[],
): { segments: ScriptSegment[]; detailSegments: DetailSegmentMap } {
  const detailSegments: DetailSegmentMap = {};
  const segments: ScriptSegment[] = [];

  if (!excluded.has('perceivedState') && checkIn.perceivedState) {
    const segment = {
      text: STATE_RECOGNITION[checkIn.perceivedState][variant],
      pauseAfterMs: 5000,
    };
    segments.push(segment);
    addDetailSegment(detailSegments, 'perceivedState', segment);
  }

  if (!excluded.has('recentSituation') && checkIn.recentSituation.trim()) {
    const laborAware =
      checkIn.moment === 'pausa-laboral'
        ? variant === 'es-AR'
          ? 'Venís de un tramo de la jornada que todavía pide cosas. Por estos minutos no hace falta resolverlas.'
          : 'Vienes de un tramo de la jornada que todavía pide cosas. Por estos minutos no hace falta resolverlas.'
        : buildSituationRecognitionPhrase(variant);
    const segment = {
      text: laborAware,
      pauseAfterMs: 5500,
    };
    segments.push(segment);
    addDetailSegment(detailSegments, 'recentSituation:present', segment);
  }

  if (getSelectedContextSources(contextSources).length > 0) {
    const contextPhrase =
      variant === 'es-AR'
        ? 'También puede acompañarte algo que elegiste traer desde otro lado, sin ponerlo en palabras.'
        : 'También puede acompañarte algo que elegiste traer desde otro lugar, sin ponerlo en palabras.';
    const segment = { text: contextPhrase, pauseAfterMs: 3500 };
    segments.push(segment);
    addDetailSegment(detailSegments, 'context:selected', segment);
  }

  if (!excluded.has('intention') && checkIn.intention) {
    const styleKey =
      !excluded.has('style') && checkIn.style
        ? `${checkIn.style}|${checkIn.intention}`
        : '';
    const phrase =
      (styleKey && INTENTION_RECOGNITION_BY_STYLE[styleKey]) ||
      INTENTION_RECOGNITION[checkIn.intention];
    const segment = {
      text: phrase[variant],
      pauseAfterMs: 4000,
    };
    segments.push(segment);
    addDetailSegment(detailSegments, 'intention', segment);
  }

  if (segments.length === 0) {
    segments.push({
      text:
        variant === 'es-AR'
          ? 'No hace falta llenar esta pausa con historia. La atención misma es el material.'
          : 'No hace falta llenar esta pausa con historia. La atención misma es el material.',
      pauseAfterMs: 3500,
    });
  }

  return { segments, detailSegments };
}

// ---------------------------------------------------------------------------
// Práctica central: indicaciones específicas de estilo e intención
// ---------------------------------------------------------------------------

const STYLE_INTRO: Record<MeditationStyle, TimedPhrase> = {
  'respiracion-natural': {
    text: {
      'es-AR':
        'Dejá que la respiración siga como venía. No hay nada que corregir en ella.',
      'es-neutro':
        'Deja que la respiración siga como venía. No hay nada que corregir en ella.',
    },
    pauseAfterMs: 6000,
  },
  'recorrido-corporal': {
    text: {
      'es-AR':
        'Vamos a recorrer el cuerpo despacio, sin cambiar nada de lo que encontremos.',
      'es-neutro':
        'Vamos a recorrer el cuerpo despacio, sin cambiar nada de lo que encontremos.',
    },
    pauseAfterMs: 6000,
  },
  'atencion-abierta': {
    text: {
      'es-AR':
        'La atención puede abrirse hasta ocupar toda la habitación, sin apretar un solo punto.',
      'es-neutro':
        'La atención puede abrirse hasta ocupar toda la habitación, sin apretar un solo punto.',
    },
    pauseAfterMs: 6000,
  },
  autocompasion: {
    text: {
      'es-AR':
        'Si hay algo difícil presente, no hace falta arreglarlo para poder acompañarlo.',
      'es-neutro':
        'Si hay algo difícil presente, no hace falta arreglarlo para poder acompañarlo.',
    },
    pauseAfterMs: 6000,
  },
};

/**
 * Resuelve combinaciones donde el estilo y la intención podrían leerse como
 * contradictorias. Se inserta apenas empieza la práctica central.
 */
const FOCUS_BRIDGES: Record<string, TimedPhrase> = {
  'atencion-abierta|concentrarse': {
    text: {
      'es-AR':
        'Una atención amplia también concentra: en vez de apretar un punto, sostenés el conjunto sin perderlo de vista.',
      'es-neutro':
        'Una atención amplia también concentra: en vez de apretar un punto, sostienes el conjunto sin perderlo de vista.',
    },
    pauseAfterMs: 7000,
  },
  'atencion-abierta|calmar-ritmo': {
    text: {
      'es-AR':
        'Abrir la atención suele bajar el ritmo por sí solo, porque deja de haber algo que perseguir.',
      'es-neutro':
        'Abrir la atención suele bajar el ritmo por sí solo, porque deja de haber algo que perseguir.',
    },
    pauseAfterMs: 7000,
  },
  'respiracion-natural|aceptar-emocion': {
    text: {
      'es-AR':
        'La respiración sirve acá como lugar estable desde donde mirar lo que estás sintiendo.',
      'es-neutro':
        'La respiración sirve aquí como lugar estable desde donde mirar lo que estás sintiendo.',
    },
    pauseAfterMs: 7000,
  },
  'recorrido-corporal|concentrarse': {
    text: {
      'es-AR':
        'Recorrer una zona por vez es una forma concreta de concentrarse: siempre hay un solo lugar donde estar.',
      'es-neutro':
        'Recorrer una zona por vez es una forma concreta de concentrarse: siempre hay un solo lugar donde estar.',
    },
    pauseAfterMs: 7000,
  },
};

const STYLE_FOCUS: Record<MeditationStyle, TimedPhrase[]> = {
  'respiracion-natural': [
    {
      text: {
        'es-AR': 'El aire entra un poco más fresco y sale un poco más tibio.',
        'es-neutro': 'El aire entra un poco más fresco y sale un poco más tibio.',
      },
      pauseAfterMs: 7000,
    },
    {
      text: {
        'es-AR':
          'Buscá el lugar donde la respiración se nota más: la nariz, el pecho o el abdomen. Quedate ahí.',
        'es-neutro':
          'Busca el lugar donde la respiración se nota más: la nariz, el pecho o el abdomen. Quédate ahí.',
      },
      pauseAfterMs: 8000,
    },
    {
      text: {
        'es-AR':
          'Al final de cada exhalación aparece una detención breve. No hace falta alargarla.',
        'es-neutro':
          'Al final de cada exhalación aparece una detención breve. No hace falta alargarla.',
      },
      pauseAfterMs: 8000,
    },
    {
      text: {
        'es-AR':
          'Si te ayuda, contá cuatro ciclos completos y después dejá de contar del todo.',
        'es-neutro':
          'Si te ayuda, cuenta cuatro ciclos completos y después deja de contar del todo.',
      },
      pauseAfterMs: 7500,
    },
    {
      text: {
        'es-AR': 'El abdomen se mueve solo, sin que nadie tenga que decidirlo.',
        'es-neutro': 'El abdomen se mueve solo, sin que nadie tenga que decidirlo.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR':
          'Ninguna respiración es igual a la anterior. Está solamente la que ocurre ahora.',
        'es-neutro':
          'Ninguna respiración es igual a la anterior. Está solamente la que ocurre ahora.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Si el ritmo del aire cambia, no hace falta corregirlo. Observarlo ya es acompañarlo.',
        'es-neutro':
          'Si el ritmo del aire cambia, no hace falta corregirlo. Observarlo ya es acompañarlo.',
      },
      pauseAfterMs: 8000,
    },
    {
      text: {
        'es-AR':
          'Entre la entrada y la salida del aire hay un momento en que nada se mueve.',
        'es-neutro':
          'Entre la entrada y la salida del aire hay un momento en que nada se mueve.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'El cuerpo respira igual cuando no lo mirás. Ahora simplemente estás presente mientras ocurre.',
        'es-neutro':
          'El cuerpo respira igual cuando no lo miras. Ahora simplemente estás presente mientras ocurre.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Si contar o nombrar se vuelve un trabajo, podés soltarlo y quedarte con la sensación sola.',
        'es-neutro':
          'Si contar o nombrar se vuelve un trabajo, puedes soltarlo y quedarte con la sensación sola.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR': 'La exhalación suele ser un poco más larga. Podés dejar que lo sea.',
        'es-neutro':
          'La exhalación suele ser un poco más larga. Puedes dejar que lo sea.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'El aire viene y va sin pedirte nada a cambio.',
        'es-neutro': 'El aire viene y va sin pedirte nada a cambio.',
      },
      pauseAfterMs: 10000,
    },
  ],
  'recorrido-corporal': [
    {
      text: {
        'es-AR': 'Empezá por los pies: contacto, temperatura, peso, lo que haya.',
        'es-neutro': 'Empieza por los pies: contacto, temperatura, peso, lo que haya.',
      },
      pauseAfterMs: 7500,
    },
    {
      text: {
        'es-AR':
          'Subí a las piernas. Puede haber firmeza, cansancio o nada en particular.',
        'es-neutro':
          'Sube a las piernas. Puede haber firmeza, cansancio o nada en particular.',
      },
      pauseAfterMs: 8000,
    },
    {
      text: {
        'es-AR':
          'La cadera y la pelvis sostienen buena parte del peso. Quedate ahí unos segundos.',
        'es-neutro':
          'La cadera y la pelvis sostienen buena parte del peso. Quédate ahí unos segundos.',
      },
      pauseAfterMs: 8000,
    },
    {
      text: {
        'es-AR':
          'Las manos tienen más detalle del que parece: dedos, palmas, dorso, uno por vez.',
        'es-neutro':
          'Las manos tienen más detalle del que parece: dedos, palmas, dorso, uno por vez.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR': 'Seguí por los brazos hasta los hombros, sin apurar el recorrido.',
        'es-neutro': 'Sigue por los brazos hasta los hombros, sin apurar el recorrido.',
      },
      pauseAfterMs: 8000,
    },
    {
      text: {
        'es-AR':
          'La espalda apoya contra algo. Es un contacto ancho, fácil de encontrar.',
        'es-neutro':
          'La espalda apoya contra algo. Es un contacto ancho, fácil de encontrar.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR':
          'El abdomen y el pecho se mueven solos. Alcanza con registrar ese movimiento.',
        'es-neutro':
          'El abdomen y el pecho se mueven solos. Basta con registrar ese movimiento.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Los hombros y el cuello pueden estar tensos o sueltos hoy. Alcanza con verificarlo.',
        'es-neutro':
          'Los hombros y el cuello pueden estar tensos o sueltos hoy. Basta con verificarlo.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR': 'Llegá al rostro: frente, párpados, mejillas, mandíbula.',
        'es-neutro': 'Llega al rostro: frente, párpados, mejillas, mandíbula.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Si alguna zona no devuelve nada, esa ausencia también cuenta como información.',
        'es-neutro':
          'Si alguna zona no devuelve nada, esa ausencia también cuenta como información.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Cuando encuentres una zona incómoda, podés quedarte en el borde sin entrar del todo.',
        'es-neutro':
          'Cuando encuentres una zona incómoda, puedes quedarte en el borde sin entrar del todo.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Al final, el cuerpo entero a la vez, sin dividirlo en partes.',
        'es-neutro': 'Al final, el cuerpo entero a la vez, sin dividirlo en partes.',
      },
      pauseAfterMs: 10000,
    },
  ],
  'atencion-abierta': [
    {
      text: {
        'es-AR':
          'Dejá que los sonidos lleguen solos. No hace falta identificar cada uno.',
        'es-neutro':
          'Deja que los sonidos lleguen solos. No hace falta identificar cada uno.',
      },
      pauseAfterMs: 8000,
    },
    {
      text: {
        'es-AR':
          'Puede haber un sonido continuo de fondo y otros más breves encima. Están los dos.',
        'es-neutro':
          'Puede haber un sonido continuo de fondo y otros más breves encima. Están los dos.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR':
          'Entre un sonido y el siguiente aparece un intervalo. También se escucha.',
        'es-neutro':
          'Entre un sonido y el siguiente aparece un intervalo. También se escucha.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Si algo insiste en el primer plano, puede quedarse ahí mientras escuchás alrededor.',
        'es-neutro':
          'Si algo insiste en el primer plano, puede quedarse ahí mientras escuchas alrededor.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR':
          'Lo que aparece se va solo, sin que tengas que hacer nada al respecto.',
        'es-neutro':
          'Lo que aparece se va solo, sin que tengas que hacer nada al respecto.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'El espacio de la habitación sigue ahí, incluso lo que queda detrás.',
        'es-neutro':
          'El espacio de la habitación sigue ahí, incluso lo que queda detrás.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Los pensamientos también son parte del paisaje, no una interrupción del paisaje.',
        'es-neutro':
          'Los pensamientos también son parte del paisaje, no una interrupción del paisaje.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Podés incluir el cuerpo entero en la escucha, como un fondo más entre otros.',
        'es-neutro':
          'Puedes incluir el cuerpo entero en la escucha, como un fondo más entre otros.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'No hace falta ordenar la experiencia: sonido, sensación y pensamiento pueden convivir.',
        'es-neutro':
          'No hace falta ordenar la experiencia: sonido, sensación y pensamiento pueden convivir.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Cuando la atención se cierra sobre una sola cosa, podés dejar que se vuelva ancha otra vez.',
        'es-neutro':
          'Cuando la atención se cierra sobre una sola cosa, puedes dejar que se vuelva ancha otra vez.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Los bordes de la atención pueden quedar flojos, como una mirada que no enfoca.',
        'es-neutro':
          'Los bordes de la atención pueden quedar flojos, como una mirada que no enfoca.',
      },
      pauseAfterMs: 10000,
    },
    {
      text: {
        'es-AR': 'Nada de lo que aparece necesita una respuesta tuya ahora.',
        'es-neutro': 'Nada de lo que aparece necesita una respuesta tuya ahora.',
      },
      pauseAfterMs: 10000,
    },
  ],
  autocompasion: [
    {
      text: {
        'es-AR':
          'Podés nombrar lo que duele con una sola palabra, sin explicártelo entero.',
        'es-neutro':
          'Puedes nombrar lo que duele con una sola palabra, sin explicártelo entero.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR': 'Una mano apoyada en el pecho puede acompañar, si te resulta cómodo.',
        'es-neutro':
          'Una mano apoyada en el pecho puede acompañar, si te resulta cómodo.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR':
          'Probá el tono con el que le hablarías a alguien querido, sin exagerar la dulzura.',
        'es-neutro':
          'Prueba el tono con el que le hablarías a alguien querido, sin exagerar la dulzura.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Lo difícil no necesita permiso para estar. Tampoco necesita quedarse.',
        'es-neutro':
          'Lo difícil no necesita permiso para estar. Tampoco necesita quedarse.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Una frase simple alcanza: esto también puede estar acá, y ya está estando.',
        'es-neutro':
          'Una frase simple alcanza: esto también puede estar aquí, y ya está estando.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Otras personas atraviesan algo parecido ahora mismo. No lo hace menor, pero sí menos solo.',
        'es-neutro':
          'Otras personas atraviesan algo parecido ahora mismo. No lo hace menor, pero sí menos solo.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'Cuidarte no es lo mismo que estar de acuerdo con todo lo que sentís.',
        'es-neutro':
          'Cuidarte no es lo mismo que estar de acuerdo con todo lo que sientes.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Si aparece la exigencia de estar mejor, podés reconocerla y aflojarla un poco.',
        'es-neutro':
          'Si aparece la exigencia de estar mejor, puedes reconocerla y aflojarla un poco.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'La amabilidad no cambia lo que pasó. Cambia con qué lo estás sosteniendo.',
        'es-neutro':
          'La amabilidad no cambia lo que pasó. Cambia con qué lo estás sosteniendo.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Podés darte el mismo margen que le darías a cualquiera que estuviera pasando esto.',
        'es-neutro':
          'Puedes darte el mismo margen que le darías a cualquiera que estuviera pasando esto.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Nada de esto tiene que quedar resuelto antes de que termine la pausa.',
        'es-neutro':
          'Nada de esto tiene que quedar resuelto antes de que termine la pausa.',
      },
      pauseAfterMs: 10000,
    },
    {
      text: {
        'es-AR':
          'Podés ofrecerte descanso ahora, sin condicionarlo a resolver algo primero.',
        'es-neutro':
          'Puedes ofrecerte descanso ahora, sin condicionarlo a resolver algo primero.',
      },
      pauseAfterMs: 10000,
    },
  ],
};

const INTENTION_FOCUS: Record<Intention, TimedPhrase[]> = {
  'calmar-ritmo': [
    {
      text: {
        'es-AR': 'El ritmo puede ir bajando solo, sin que lo empujes desde afuera.',
        'es-neutro': 'El ritmo puede ir bajando solo, sin que lo empujes desde afuera.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR': 'No hay nada que alcanzar en estos minutos.',
        'es-neutro': 'No hay nada que alcanzar en estos minutos.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Si aparece la urgencia, mirala un momento y dejala pasar de largo.',
        'es-neutro':
          'Si aparece la urgencia, mírala un momento y déjala pasar de largo.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'Ir más lento no es hacer menos.',
        'es-neutro': 'Ir más lento no es hacer menos.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Lo que está apurado adentro puede ir encontrando su propia velocidad.',
        'es-neutro':
          'Lo que está apurado adentro puede ir encontrando su propia velocidad.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Nada de esto necesita terminar a horario.',
        'es-neutro': 'Nada de esto necesita terminar a horario.',
      },
      pauseAfterMs: 10000,
    },
    {
      text: {
        'es-AR': 'Bajar el ritmo suele ser dejar de agregar, no hacer algo nuevo.',
        'es-neutro': 'Bajar el ritmo suele ser dejar de agregar, no hacer algo nuevo.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'La prisa puede seguir existiendo mientras vos vas más despacio.',
        'es-neutro': 'La prisa puede seguir existiendo mientras vas más despacio.',
      },
      pauseAfterMs: 10000,
    },
  ],
  concentrarse: [
    {
      text: {
        'es-AR': 'Reunir la atención es volver, no apretar.',
        'es-neutro': 'Reunir la atención es volver, no apretar.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR': 'Elegí un solo apoyo y quedate ahí un rato más de lo cómodo.',
        'es-neutro': 'Elige un solo apoyo y quédate ahí un rato más de lo cómodo.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'La atención se afina sola cuando deja de saltar de un lado a otro.',
        'es-neutro':
          'La atención se afina sola cuando deja de saltar de un lado a otro.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'Sostener algo simple durante un minuto entero ya es concentración.',
        'es-neutro':
          'Sostener algo simple durante un minuto entero ya es concentración.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Cuando la mente se dispersa, el trabajo es traerla, no retenerla.',
        'es-neutro':
          'Cuando la mente se dispersa, el trabajo es traerla, no retenerla.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'Una atención estable se parece más a apoyarse que a esforzarse.',
        'es-neutro': 'Una atención estable se parece más a apoyarse que a esforzarse.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Cada regreso deja la atención un poco más junta que antes.',
        'es-neutro': 'Cada regreso deja la atención un poco más junta que antes.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'No hace falta bloquear nada: alcanza con no irse detrás de lo que aparece.',
        'es-neutro':
          'No hace falta bloquear nada: basta con no irse detrás de lo que aparece.',
      },
      pauseAfterMs: 10000,
    },
  ],
  descansar: [
    {
      text: {
        'es-AR': 'No hay nada que producir en estos minutos.',
        'es-neutro': 'No hay nada que producir en estos minutos.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'El descanso no necesita que te duermas ni que lo hagas bien.',
        'es-neutro': 'El descanso no necesita que te duermas ni que lo hagas bien.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Podés dejar de esforzarte por estar presente y simplemente estar.',
        'es-neutro':
          'Puedes dejar de esforzarte por estar presente y simplemente estar.',
      },
      pauseAfterMs: 10000,
    },
    {
      text: {
        'es-AR': 'Si aparece la lista de mañana, puede quedarse esperando afuera.',
        'es-neutro': 'Si aparece la lista de mañana, puede quedarse esperando afuera.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'El cuerpo sabe descansar cuando dejamos de interrumpirlo.',
        'es-neutro': 'El cuerpo sabe descansar cuando dejamos de interrumpirlo.',
      },
      pauseAfterMs: 10000,
    },
    {
      text: {
        'es-AR': 'Soltar el peso es más fácil que sostenerlo, aunque cueste empezar.',
        'es-neutro':
          'Soltar el peso es más fácil que sostenerlo, aunque cueste empezar.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Descansar también es dejar de vigilar si estás descansando.',
        'es-neutro': 'Descansar también es dejar de vigilar si estás descansando.',
      },
      pauseAfterMs: 10000,
    },
    {
      text: {
        'es-AR': 'Todo lo que quedó abierto puede quedarse abierto un rato más.',
        'es-neutro': 'Todo lo que quedó abierto puede quedarse abierto un rato más.',
      },
      pauseAfterMs: 10000,
    },
  ],
  'aceptar-emocion': [
    {
      text: {
        'es-AR': 'Lo que sentís puede estar acá sin que lo resuelvas.',
        'es-neutro': 'Lo que sientes puede estar aquí sin que lo resuelvas.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'Una emoción tiene forma en el cuerpo: peso, temperatura, movimiento.',
        'es-neutro':
          'Una emoción tiene forma en el cuerpo: peso, temperatura, movimiento.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'No hace falta ponerle el nombre exacto. Alcanza con dejarle sitio.',
        'es-neutro': 'No hace falta ponerle el nombre exacto. Basta con dejarle sitio.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Las emociones cambian de intensidad solas si no las empujamos.',
        'es-neutro': 'Las emociones cambian de intensidad solas si no las empujamos.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Podés estar con esto sin volverte esto.',
        'es-neutro': 'Puedes estar con esto sin volverte esto.',
      },
      pauseAfterMs: 10000,
    },
    {
      text: {
        'es-AR': 'Hacerle lugar a algo no es aprobarlo ni quedarse ahí para siempre.',
        'es-neutro':
          'Hacerle lugar a algo no es aprobarlo ni quedarse ahí para siempre.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Si la intensidad sube demasiado, podés volver al peso del cuerpo.',
        'es-neutro':
          'Si la intensidad sube demasiado, puedes volver al peso del cuerpo.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Aceptar no es resignarse: es dejar de pelear con lo que ya está pasando.',
        'es-neutro':
          'Aceptar no es resignarse: es dejar de pelear con lo que ya está pasando.',
      },
      pauseAfterMs: 10000,
    },
  ],
  'volver-al-cuerpo': [
    {
      text: {
        'es-AR': 'El cuerpo está disponible ahora, sin necesidad de prepararlo.',
        'es-neutro': 'El cuerpo está disponible ahora, sin necesidad de prepararlo.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR': 'Cuando la cabeza se va lejos, el peso del cuerpo sigue acá.',
        'es-neutro': 'Cuando la cabeza se va lejos, el peso del cuerpo sigue aquí.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'Una sensación física concreta alcanza como punto de apoyo.',
        'es-neutro': 'Una sensación física concreta basta como punto de apoyo.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'El cuerpo ocurre siempre en presente; la cabeza no siempre.',
        'es-neutro': 'El cuerpo ocurre siempre en presente; la cabeza no siempre.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Podés preguntarte qué se siente ahora, sin buscar una respuesta en palabras.',
        'es-neutro':
          'Puedes preguntarte qué se siente ahora, sin buscar una respuesta en palabras.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR': 'Volver al cuerpo es volver a lo único que está pasando de verdad.',
        'es-neutro':
          'Volver al cuerpo es volver a lo único que está pasando de verdad.',
      },
      pauseAfterMs: 10000,
    },
    {
      text: {
        'es-AR': 'Alcanza con una zona chica: una mano, un pie, un punto de apoyo.',
        'es-neutro': 'Basta con una zona pequeña: una mano, un pie, un punto de apoyo.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'El cuerpo no necesita que lo entiendas para que puedas habitarlo.',
        'es-neutro':
          'El cuerpo no necesita que lo entiendas para que puedas habitarlo.',
      },
      pauseAfterMs: 10000,
    },
  ],
};

/**
 * Cuando el estilo pide amplitud y la intención pide foco, las indicaciones de
 * concentración usan el campo abierto como único apoyo, no un punto estrecho.
 */
const INTENTION_FOCUS_BY_STYLE: Record<string, TimedPhrase[]> = {
  'atencion-abierta|concentrarse': [
    {
      text: {
        'es-AR':
          'Concentrarte acá es sostener el campo entero: el conjunto es el apoyo, no un punto.',
        'es-neutro':
          'Concentrarte aquí es sostener el campo entero: el conjunto es el apoyo, no un punto.',
      },
      pauseAfterMs: 8500,
    },
    {
      text: {
        'es-AR':
          'Cuando la mente se va a un detalle, volvé a la amplitud como quien vuelve a un foco.',
        'es-neutro':
          'Cuando la mente se va a un detalle, vuelve a la amplitud como quien vuelve a un foco.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'La atención se afina sola cuando deja de saltar y se queda con lo que ya está sonando.',
        'es-neutro':
          'La atención se afina sola cuando deja de saltar y se queda con lo que ya está sonando.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR':
          'Sostener la habitación entera durante un minuto ya es una forma de concentración.',
        'es-neutro':
          'Sostener la habitación entera durante un minuto ya es una forma de concentración.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Si aparece el impulso de estrechar, notalo y dejá que la escucha vuelva a ensancharse.',
        'es-neutro':
          'Si aparece el impulso de estrechar, nótalo y deja que la escucha vuelva a ensancharse.',
      },
      pauseAfterMs: 9000,
    },
    {
      text: {
        'es-AR': 'Una atención estable también puede ser ancha: se apoya sin apretar.',
        'es-neutro':
          'Una atención estable también puede ser ancha: se apoya sin apretar.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'Cada regreso al campo amplio deja la atención un poco más junta, aunque siga abierta.',
        'es-neutro':
          'Cada regreso al campo amplio deja la atención un poco más junta, aunque siga abierta.',
      },
      pauseAfterMs: 9500,
    },
    {
      text: {
        'es-AR':
          'No hace falta bloquear detalles: alcanza con no irse detrás de ellos.',
        'es-neutro':
          'No hace falta bloquear detalles: basta con no irse detrás de ellos.',
      },
      pauseAfterMs: 10000,
    },
  ],
};

// ---------------------------------------------------------------------------
// Indicaciones comunes: sólo orientación y regreso
// ---------------------------------------------------------------------------

const ORIENTATION_PHRASES: TimedPhrase[] = [
  {
    text: {
      'es-AR':
        'Notá cómo está apoyado el cuerpo: qué sostiene el peso y qué queda suelto.',
      'es-neutro':
        'Nota cómo está apoyado el cuerpo: qué sostiene el peso y qué queda suelto.',
    },
    pauseAfterMs: 8000,
  },
  {
    text: {
      'es-AR': 'La columna se acomoda sola. No hace falta enderezarla.',
      'es-neutro': 'La columna se acomoda sola. No hace falta enderezarla.',
    },
    pauseAfterMs: 8500,
  },
  {
    text: {
      'es-AR': 'El peso cae hacia abajo, hacia la silla, la cama o el suelo.',
      'es-neutro': 'El peso cae hacia abajo, hacia la silla, la cama o el suelo.',
    },
    pauseAfterMs: 9000,
  },
  {
    text: {
      'es-AR': 'Hay un espacio alrededor tuyo que sigue estando aunque no lo mires.',
      'es-neutro':
        'Hay un espacio alrededor de ti que sigue estando aunque no lo mires.',
    },
    pauseAfterMs: 9000,
  },
  {
    text: {
      'es-AR': 'Podés soltar un poco la mandíbula, sin exigir que se afloje del todo.',
      'es-neutro':
        'Puedes soltar un poco la mandíbula, sin exigir que se afloje del todo.',
    },
    pauseAfterMs: 8500,
  },
  {
    text: {
      'es-AR': 'Nada de la postura tiene que ser perfecta para que esto funcione.',
      'es-neutro': 'Nada de la postura tiene que ser perfecta para que esto funcione.',
    },
    pauseAfterMs: 9000,
  },
];

/** Orientación compatible con atención abierta: campo, escucha y espacio. */
const OPEN_FIELD_ORIENTATION_PHRASES: TimedPhrase[] = [
  {
    text: {
      'es-AR':
        'Dejá que el campo de escucha quede un poco más ancho que el pensamiento del momento.',
      'es-neutro':
        'Deja que el campo de escucha quede un poco más ancho que el pensamiento del momento.',
    },
    pauseAfterMs: 8500,
  },
  {
    text: {
      'es-AR': 'Hay un espacio alrededor tuyo que sigue estando aunque no lo mires.',
      'es-neutro':
        'Hay un espacio alrededor de ti que sigue estando aunque no lo mires.',
    },
    pauseAfterMs: 9000,
  },
  {
    text: {
      'es-AR':
        'Si la atención se estrecha sola, podés volver a incluir lo que está más lejos.',
      'es-neutro':
        'Si la atención se estrecha sola, puedes volver a incluir lo que está más lejos.',
    },
    pauseAfterMs: 9000,
  },
  {
    text: {
      'es-AR':
        'Nada del entorno tiene que organizarse para que la escucha siga siendo posible.',
      'es-neutro':
        'Nada del entorno tiene que organizarse para que la escucha siga siendo posible.',
    },
    pauseAfterMs: 9000,
  },
];

const RETURN_PHRASES: TimedPhrase[] = [
  {
    text: {
      'es-AR': 'Cuando notes que te fuiste, volvé al último apoyo que tenías.',
      'es-neutro': 'Cuando notes que te fuiste, vuelve al último apoyo que tenías.',
    },
    pauseAfterMs: 8500,
  },
  {
    text: {
      'es-AR': 'Cada regreso cuenta, aunque haya durado poco.',
      'es-neutro': 'Cada regreso cuenta, aunque haya durado poco.',
    },
    pauseAfterMs: 9500,
  },
  {
    text: {
      'es-AR': 'No hace falta vaciar la mente. Alcanza con regresar una vez más.',
      'es-neutro': 'No hace falta vaciar la mente. Basta con regresar una vez más.',
    },
    pauseAfterMs: 9500,
  },
  {
    text: {
      'es-AR': 'Si te distraés muchas veces, eso no le quita valor a esta pausa.',
      'es-neutro': 'Si te distraes muchas veces, eso no le quita valor a esta pausa.',
    },
    pauseAfterMs: 9000,
  },
  {
    text: {
      'es-AR': 'Lo pendiente sigue esperando afuera y puede esperar un poco más.',
      'es-neutro': 'Lo pendiente sigue esperando afuera y puede esperar un poco más.',
    },
    pauseAfterMs: 9500,
  },
  {
    text: {
      'es-AR': 'Irse y volver es el movimiento normal de cualquier práctica.',
      'es-neutro': 'Irse y volver es el movimiento normal de cualquier práctica.',
    },
    pauseAfterMs: 9500,
  },
];

// ---------------------------------------------------------------------------
// Autonomía, distracción y cierre
// ---------------------------------------------------------------------------

function buildAutonomyBlock(variant: VoiceVariant): ScriptSegment[] {
  const text =
    variant === 'es-AR'
      ? 'En cualquier momento podés mantener los ojos abiertos, cambiar el ancla de atención o detenerte si algo no te resulta cómodo.'
      : 'En cualquier momento puedes mantener los ojos abiertos, cambiar el ancla de atención o detenerte si algo no te resulta cómodo.';
  return [{ text, pauseAfterMs: 4000 }];
}

function buildDistractionBlock(
  checkIn: CheckInData,
  variant: VoiceVariant,
): ScriptSegment[] {
  const seed = hashString(checkIn.intention + checkIn.style);
  const reminders =
    variant === 'es-AR'
      ? [
          'Si la mente se fue, eso es normal. Volvé cuando puedas.',
          'Los pensamientos pueden pasar como nubes. No hace falta seguirlos.',
          'Distraerte no es un error. Es parte de la práctica.',
        ]
      : [
          'Si la mente se fue, eso es normal. Vuelve cuando puedas.',
          'Los pensamientos pueden pasar como nubes. No hace falta seguirlos.',
          'Distraerte no es un error. Es parte de la práctica.',
        ];

  return [{ text: pick(reminders, seed), pauseAfterMs: 5000 }];
}

interface ClosingSet {
  closings: VariantPhrase[];
  farewells: VariantPhrase[];
}

const CLOSING_BY_MOMENT: Record<Moment, ClosingSet> = {
  ahora: {
    closings: [
      {
        'es-AR':
          'Cuando quieras, ampliá la atención al espacio que te rodea: la luz, los sonidos, la temperatura.',
        'es-neutro':
          'Cuando quieras, amplía la atención al espacio que te rodea: la luz, los sonidos, la temperatura.',
      },
      {
        'es-AR': 'De a poco podés recuperar el contacto con el lugar donde estás.',
        'es-neutro':
          'Poco a poco puedes recuperar el contacto con el lugar donde estás.',
      },
    ],
    farewells: [
      {
        'es-AR': 'Este espacio queda disponible cada vez que lo necesites.',
        'es-neutro': 'Este espacio queda disponible cada vez que lo necesites.',
      },
      {
        'es-AR': 'Nada más hace falta ahora. Podés seguir desde acá.',
        'es-neutro': 'Nada más hace falta ahora. Puedes seguir desde aquí.',
      },
    ],
  },
  'antes-de-dormir': {
    closings: [
      {
        'es-AR':
          'No hace falta moverse ni cerrar nada. La práctica puede irse apagando sola.',
        'es-neutro':
          'No hace falta moverse ni cerrar nada. La práctica puede irse apagando sola.',
      },
      {
        'es-AR':
          'Podés dejar que esto se disuelva en el sueño, sin terminarlo del todo.',
        'es-neutro':
          'Puedes dejar que esto se disuelva en el sueño, sin terminarlo del todo.',
      },
    ],
    farewells: [
      {
        'es-AR':
          'Que la noche siga a su propio ritmo. Nada queda pendiente hasta mañana.',
        'es-neutro':
          'Que la noche siga a su propio ritmo. Nada queda pendiente hasta mañana.',
      },
      {
        'es-AR': 'Gracias por este rato. De acá en adelante, solamente descanso.',
        'es-neutro': 'Gracias por este rato. De aquí en adelante, solamente descanso.',
      },
    ],
  },
  'al-despertar': {
    closings: [
      {
        'es-AR':
          'Cuando estés listo, dejá que los ojos se abran a la luz que ya está en el cuarto.',
        'es-neutro':
          'Cuando estés listo, deja que los ojos se abran a la luz que ya está en el cuarto.',
      },
      {
        'es-AR':
          'El movimiento puede volver despacio: primero las manos, después el resto.',
        'es-neutro':
          'El movimiento puede volver despacio: primero las manos, después el resto.',
      },
    ],
    farewells: [
      {
        'es-AR':
          'Que la mañana empiece a la velocidad que puedas, no a la que se espera.',
        'es-neutro':
          'Que la mañana empiece a la velocidad que puedas, no a la que se espera.',
      },
      {
        'es-AR': 'Llevate esto sin obligación de sostenerlo durante toda la mañana.',
        'es-neutro':
          'Llévate esto sin obligación de sostenerlo durante toda la mañana.',
      },
    ],
  },
  'pausa-laboral': {
    closings: [
      {
        'es-AR':
          'De a poco podés devolverle atención a lo que estabas haciendo, sin apuro.',
        'es-neutro':
          'Poco a poco puedes devolverle atención a lo que estabas haciendo, sin apuro.',
      },
      {
        'es-AR':
          'La jornada sigue donde la dejaste. Esta pausa no tenía que resolverla.',
        'es-neutro':
          'La jornada sigue donde la dejaste. Esta pausa no tenía que resolverla.',
      },
    ],
    farewells: [
      {
        'es-AR': 'Que lo que viene se haga a un ritmo que puedas sostener.',
        'es-neutro': 'Que lo que viene se haga a un ritmo que puedas sostener.',
      },
      {
        'es-AR': 'Este alto queda disponible las veces que lo necesites.',
        'es-neutro': 'Este alto queda disponible las veces que lo necesites.',
      },
    ],
  },
};

export function buildClosingBlock(
  checkIn: CheckInData,
  variant: VoiceVariant,
  excluded: Set<string> = new Set(),
): ScriptSegment[] {
  const moment: Moment =
    !excluded.has('moment') && checkIn.moment ? checkIn.moment : 'ahora';
  const set = CLOSING_BY_MOMENT[moment];
  const seed = hashString(moment + String(checkIn.duration));

  return [
    { text: pick(set.closings, seed)[variant], pauseAfterMs: 5000 },
    { text: pick(set.farewells, seed + 1)[variant], pauseAfterMs: 3000 },
  ];
}

// ---------------------------------------------------------------------------
// Composición de la práctica central y la expansión
// ---------------------------------------------------------------------------

/**
 * Alterna dos indicaciones de estilo por cada una de intención, para que la
 * práctica central mantenga su hilo y la intención vuelva a aparecer sin
 * convertirse en una lista aparte.
 */
function weaveFocus(
  style: ScriptSegment[],
  intention: ScriptSegment[],
): ScriptSegment[] {
  const woven: ScriptSegment[] = [];
  let styleIndex = 0;
  let intentionIndex = 0;

  while (styleIndex < style.length || intentionIndex < intention.length) {
    for (let taken = 0; taken < 2 && styleIndex < style.length; taken++) {
      woven.push(style[styleIndex]);
      styleIndex += 1;
    }
    if (intentionIndex < intention.length) {
      woven.push(intention[intentionIndex]);
      intentionIndex += 1;
    }
  }

  return woven;
}

interface FocusComposition {
  /** Entrada a la práctica: presentación del estilo y puente con la intención. */
  opening: ScriptSegment[];
  /** Indicaciones específicas de estilo e intención, en orden de uso. */
  phrases: ScriptSegment[];
  detailSegments: DetailSegmentMap;
}

function buildFocusComposition(
  checkIn: CheckInData,
  excluded: Set<string>,
  variant: VoiceVariant,
): FocusComposition {
  const chosenStyle =
    !excluded.has('style') && checkIn.style ? (checkIn.style as MeditationStyle) : '';
  const practiceStyle: MeditationStyle = chosenStyle || FALLBACK_STYLE;
  const intention =
    !excluded.has('intention') && checkIn.intention
      ? (checkIn.intention as Intention)
      : '';
  const experience =
    !excluded.has('experience') && checkIn.experience
      ? (checkIn.experience as Experience)
      : '';
  const detailSegments: DetailSegmentMap = {};
  const styleIntro = toSegment(STYLE_INTRO[practiceStyle], variant);
  const opening: ScriptSegment[] = [styleIntro];
  addDetailSegment(detailSegments, 'style', styleIntro);
  const bridge = intention ? FOCUS_BRIDGES[`${practiceStyle}|${intention}`] : undefined;
  if (bridge && checkIn.duration > SHORTEST_DURATION) {
    opening.push(toSegment(bridge, variant));
  }
  if (experience && checkIn.duration > SHORTEST_DURATION) {
    const support = toSegment(EXPERIENCE_PRACTICE_SUPPORT[experience], variant);
    opening.push(support);
    addDetailSegment(detailSegments, 'experience', support);
  }

  const stylePhrases = STYLE_FOCUS[practiceStyle].map((phrase) =>
    toSegment(phrase, variant),
  );
  const intentionOverrideKey = intention ? `${practiceStyle}|${intention}` : '';
  const intentionSource =
    (intentionOverrideKey && INTENTION_FOCUS_BY_STYLE[intentionOverrideKey]) ||
    (intention ? INTENTION_FOCUS[intention] : undefined);
  const intentionPhrases = intentionSource
    ? intentionSource.map((phrase) => toSegment(phrase, variant))
    : [];

  return {
    opening,
    phrases: weaveFocus(stylePhrases, intentionPhrases),
    detailSegments,
  };
}

function rotate<T>(items: T[], seed: number): T[] {
  if (items.length === 0) return [];
  const offset = seed % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/**
 * Indicaciones comunes, disponibles sólo como orientación o regreso después de
 * que la práctica central ya desarrolló el estilo y la intención elegidos.
 */
function buildCommonPhrases(
  checkIn: CheckInData,
  variant: VoiceVariant,
): ScriptSegment[] {
  const seed = hashString(`${checkIn.moment}|${checkIn.style}|${checkIn.duration}`);
  const orientationSource =
    checkIn.style === 'atencion-abierta'
      ? OPEN_FIELD_ORIENTATION_PHRASES
      : ORIENTATION_PHRASES;
  const orientation = rotate(orientationSource, seed);
  const returning = rotate(RETURN_PHRASES, seed + 1);

  const alternated: ScriptSegment[] = [];
  const longest = Math.max(orientation.length, returning.length);
  for (let index = 0; index < longest; index++) {
    if (index < orientation.length) {
      alternated.push(toSegment(orientation[index], variant));
    }
    if (index < returning.length) {
      alternated.push(toSegment(returning[index], variant));
    }
  }
  return alternated;
}

/**
 * Intercala una indicación común cada tres de estilo o intención, para que la
 * orientación y el regreso acompañen la práctica en vez de amontonarse al final.
 */
function weaveExpansion(
  focusRest: ScriptSegment[],
  common: ScriptSegment[],
): ScriptSegment[] {
  const woven: ScriptSegment[] = [];
  let focusIndex = 0;
  let commonIndex = 0;

  while (focusIndex < focusRest.length) {
    for (
      let taken = 0;
      taken < FOCUS_PER_COMMON_PHRASE && focusIndex < focusRest.length;
      taken++
    ) {
      woven.push(focusRest[focusIndex]);
      focusIndex += 1;
    }
    if (commonIndex < common.length) {
      woven.push(common[commonIndex]);
      commonIndex += 1;
    }
  }

  return [...woven, ...common.slice(commonIndex)];
}

function filterAvoidedTopics(text: string, avoidTopics: string): string {
  if (!avoidTopics.trim()) return text;
  const topics = avoidTopics
    .split(/[,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  let result = text;
  for (const topic of topics) {
    const regex = new RegExp(topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, '');
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Textos que cuentan como práctica central específica del estilo o la intención
 * elegidos. Se expone para que las pruebas puedan verificar que la meditación
 * desarrolla una práctica y no una colección de indicaciones sueltas.
 */
export function getFocusPhraseTexts(
  checkIn: CheckInData,
  excluded: Set<string> = new Set(),
): string[] {
  const variant = checkIn.voiceVariant;
  const { opening, phrases } = buildFocusComposition(checkIn, excluded, variant);
  const applyFilter = !excluded.has('avoidTopics') && checkIn.avoidTopics.trim();
  return [...opening, ...phrases].map((segment) =>
    applyFilter ? filterAvoidedTopics(segment.text, checkIn.avoidTopics) : segment.text,
  );
}

// ---------------------------------------------------------------------------
// Ajuste de duración
// ---------------------------------------------------------------------------

function clampPause(value: number, max: number): number {
  return Math.min(max, Math.max(MIN_SEGMENT_PAUSE_MS, value));
}

function clampSegmentPauses(segments: ScriptSegment[]): ScriptSegment[] {
  return segments.map((seg) => ({
    ...seg,
    pauseAfterMs: clampPause(seg.pauseAfterMs, MAX_SEGMENT_PAUSE_MS),
  }));
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dropDuplicateSegments(segments: ScriptSegment[]): ScriptSegment[] {
  const seen = new Set<string>();
  const unique: ScriptSegment[] = [];
  for (const segment of segments) {
    const key = normalizeText(segment.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(segment);
  }
  return unique;
}

/** Duración alcanzable si el ajuste fino llevara las pausas editables al techo. */
function reachableMinutes(body: ScriptSegment[], closing: ScriptSegment[]): number {
  const stretched = body.map((segment) => ({
    ...segment,
    pauseAfterMs: Math.max(segment.pauseAfterMs, TUNING_MAX_PAUSE_MS),
  }));
  return estimateMinutesFromSegments([...stretched, ...closing]);
}

/**
 * Ajusta las pausas editables conservando las diferencias declaradas entre
 * ellas: primero un escalado proporcional y después incrementos pequeños.
 * El cierre nunca se modifica.
 */
function tunePausesToTarget(
  segments: ScriptSegment[],
  editableCount: number,
  target: Duration,
): ScriptSegment[] {
  const tuned = segments.map((segment) => ({ ...segment }));
  const editable = tuned.slice(0, editableCount);
  if (editable.length === 0) return tuned;

  const currentPauseMs = editable.reduce((sum, seg) => sum + seg.pauseAfterMs, 0);
  const deficitMs = (target - estimateMinutesFromSegments(tuned)) * 60000;

  if (currentPauseMs > 0 && Math.abs(deficitMs) > PAUSE_TUNING_STEP_MS) {
    const scale = Math.max(0, (currentPauseMs + deficitMs) / currentPauseMs);
    for (const segment of editable) {
      const scaled =
        Math.round((segment.pauseAfterMs * scale) / PAUSE_TUNING_STEP_MS) *
        PAUSE_TUNING_STEP_MS;
      segment.pauseAfterMs = clampPause(scaled, TUNING_MAX_PAUSE_MS);
    }
  }

  let estimated = estimateMinutesFromSegments(tuned);
  let changed = true;

  while (estimated < target && changed) {
    changed = false;
    for (let i = 0; i < editable.length && estimated < target; i++) {
      const next = editable[i].pauseAfterMs + PAUSE_TUNING_STEP_MS;
      if (next > TUNING_MAX_PAUSE_MS) continue;
      editable[i].pauseAfterMs = next;
      changed = true;
      estimated = estimateMinutesFromSegments(tuned);
    }
  }

  changed = true;
  while (estimated > target && changed) {
    changed = false;
    for (let i = 0; i < editable.length && estimated > target; i++) {
      const next = editable[i].pauseAfterMs - PAUSE_TUNING_STEP_MS;
      if (next < MIN_SEGMENT_PAUSE_MS) continue;
      editable[i].pauseAfterMs = next;
      changed = true;
      estimated = estimateMinutesFromSegments(tuned);
    }
  }

  return tuned;
}

/**
 * Compone núcleo + expansión + cierre. El cierre se concatena una sola vez y
 * siempre ocupa los dos últimos segmentos.
 */
function composeToTarget(
  core: ScriptSegment[],
  expansion: ScriptSegment[],
  closing: ScriptSegment[],
  target: Duration,
): ScriptSegment[] {
  const closingSegments = clampSegmentPauses(closing);
  const body = clampSegmentPauses(core);
  const pool = clampSegmentPauses(expansion);
  const reachabilityGoal = target + EXPANSION_HEADROOM_MINUTES;
  let poolIndex = 0;

  while (
    reachableMinutes(body, closingSegments) < reachabilityGoal &&
    poolIndex < pool.length &&
    body.length + closingSegments.length < MAX_SCRIPT_SEGMENTS
  ) {
    body.push(pool[poolIndex]);
    poolIndex += 1;
  }

  return tunePausesToTarget([...body, ...closingSegments], body.length, target);
}

function isDevelopmentEnvironment(): boolean {
  const meta = import.meta as unknown as { env?: { PROD?: boolean } };
  return meta.env?.PROD !== true;
}

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------

export interface GenerateScriptOptions {
  sessionProcessing: boolean;
  contextSources?: ContextSource[];
  engine?: ScriptEngineType;
}

export function generateScript(
  checkIn: CheckInData,
  excluded: Set<string>,
  options: GenerateScriptOptions,
): GeneratedScript {
  if (!options.sessionProcessing) {
    throw new ConsentRequiredError();
  }

  const variant = checkIn.voiceVariant;
  const duration = checkIn.duration;
  const contextSources = options.contextSources ?? [];

  const arrival = buildArrivalBlock(checkIn, excluded, variant);
  const recognition = buildRecognitionBlock(checkIn, excluded, variant, contextSources);
  const autonomy = buildAutonomyBlock(variant);
  const focus = buildFocusComposition(checkIn, excluded, variant);
  const distraction = buildDistractionBlock(checkIn, variant);
  const common = buildCommonPhrases(checkIn, variant);

  const minFocus = Math.min(
    MIN_FOCUS_SEGMENTS_BY_DURATION[duration],
    focus.phrases.length,
  );

  const applyAvoidTopics = !excluded.has('avoidTopics') && checkIn.avoidTopics.trim();
  const filterBlock = (segments: ScriptSegment[]): ScriptSegment[] =>
    applyAvoidTopics
      ? segments.map((seg) => ({
          ...seg,
          text: filterAvoidedTopics(seg.text, checkIn.avoidTopics),
        }))
      : segments;

  const centralPhrases = focus.phrases.slice(0, minFocus);
  const reminderAt = Math.ceil(centralPhrases.length / 2);

  const core = filterBlock([
    ...arrival.segments,
    ...recognition.segments,
    ...autonomy,
    ...focus.opening,
    ...centralPhrases.slice(0, reminderAt),
    ...distraction,
    ...centralPhrases.slice(reminderAt),
  ]);
  const closing = filterBlock(buildClosingBlock(checkIn, variant, excluded));
  const expansion = filterBlock(weaveExpansion(focus.phrases.slice(minFocus), common));

  const uniqueCore = dropDuplicateSegments(core);
  const uniqueClosing = dropDuplicateSegments([...uniqueCore, ...closing]).slice(
    uniqueCore.length,
  );
  const uniqueExpansion = dropDuplicateSegments([
    ...uniqueCore,
    ...uniqueClosing,
    ...expansion,
  ]).slice(uniqueCore.length + uniqueClosing.length);

  const allSegments = composeToTarget(
    uniqueCore,
    uniqueExpansion,
    uniqueClosing,
    duration,
  );

  const uniqueDetails = collectUsedDetails(
    allSegments,
    mergeDetailSegments(
      arrival.detailSegments,
      recognition.detailSegments,
      focus.detailSegments,
    ),
  );

  const intentionLabel = checkIn.intention
    ? INTENTION_LABELS[checkIn.intention]
    : 'Pausa consciente';

  const title = `Pausa de ${duration} minutos — ${intentionLabel}`;
  const fullText = allSegments.map((s) => s.text).join('\n\n');
  const estimatedMinutes = estimateMinutesFromSegments(allSegments);

  const forbiddenFreeText = collectLocalForbiddenFreeTextSources(
    checkIn,
    excluded,
    contextSources,
  );
  const freeTextLeak = detectSensitiveOverlapInScript(
    fullText,
    uniqueDetails,
    forbiddenFreeText,
  );
  if (freeTextLeak.hasOverlap) {
    throw new LocalFreeTextLeakError();
  }

  if (
    estimatedMinutes < duration - DURATION_TOLERANCE_MINUTES &&
    isDevelopmentEnvironment()
  ) {
    throw new ScriptDurationError(estimatedMinutes, duration);
  }

  return {
    title,
    intentionLabel,
    targetDuration: duration,
    estimatedMinutes,
    segments: allSegments,
    fullText,
    usedDetails: uniqueDetails,
    engine: options.engine ?? 'local',
  };
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

export interface ValidateScriptQualityOptions {
  freeTextSources?: string[];
}

const AUTONOMY_PATTERN =
  /ojos\s+abiertos|ancla\s+de\s+atenci[oó]n|detenerte|detenerse|detener\s+la\s+pr[aá]ctica/i;

export function validateScriptQuality(
  script: GeneratedScript,
  options: ValidateScriptQualityOptions = {},
): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  issues.push(...validateUsedDetailsAllowlist(script.usedDetails));

  if (script.usedDetails.length < 2) {
    issues.push('El guion debe incluir al menos dos detalles concretos del usuario.');
  }

  if (!AUTONOMY_PATTERN.test(script.fullText)) {
    issues.push(
      'El guion debe ofrecer una opción explícita de autonomía (ojos abiertos, cambiar ancla o detenerse).',
    );
  }

  if (options.freeTextSources && options.freeTextSources.length > 0) {
    const overlap = detectSensitiveOverlapInScript(
      script.fullText,
      script.usedDetails,
      options.freeTextSources,
    );
    if (overlap.hasOverlap) {
      issues.push('El guion reproduce texto sensible de las entradas del usuario.');
    }
  }

  if (script.segments.length < MIN_SCRIPT_SEGMENTS) {
    issues.push(`El guion debe tener al menos ${MIN_SCRIPT_SEGMENTS} segmentos.`);
  }
  if (script.segments.length > MAX_SCRIPT_SEGMENTS) {
    issues.push(`El guion supera el máximo de ${MAX_SCRIPT_SEGMENTS} segmentos.`);
  }

  const forbidden = [
    /sólo yo te entiendo/i,
    /solo yo te entiendo/i,
    /te conozco/i,
    /garantizado/i,
    /vas a (curar|eliminar|resolver)/i,
  ];

  for (const pattern of forbidden) {
    if (pattern.test(script.fullText)) {
      issues.push(`Texto no permitido detectado: ${pattern.source}`);
    }
  }

  for (const seg of script.segments) {
    if (!seg.text.trim()) {
      issues.push('Hay segmentos vacíos en el guion.');
      break;
    }
    if (
      seg.pauseAfterMs < MIN_SEGMENT_PAUSE_MS ||
      seg.pauseAfterMs > MAX_SEGMENT_PAUSE_MS
    ) {
      issues.push(
        `Pausa fuera de rango (${MIN_SEGMENT_PAUSE_MS}-${MAX_SEGMENT_PAUSE_MS} ms): ${seg.pauseAfterMs}`,
      );
      break;
    }
  }

  if (!isDurationWithinTolerance(script.estimatedMinutes, script.targetDuration)) {
    issues.push(
      `Duración estimada ${script.estimatedMinutes} min fuera de tolerancia ±${DURATION_TOLERANCE_MINUTES} min respecto a ${script.targetDuration} min.`,
    );
  }

  const rebuiltFullText = script.segments.map((segment) => segment.text).join('\n\n');
  if (rebuiltFullText !== script.fullText) {
    issues.push('fullText no coincide con los segmentos concatenados.');
  }

  return { valid: issues.length === 0, issues };
}

/** @deprecated Usar buildAiTransmissionPayload y payloadToPreviewEntries */
export function getFieldsForAiTransmission(
  checkIn: CheckInData,
  excluded: Set<string>,
  contextSources: ContextSource[],
): Record<string, string> {
  const payload = buildAiTransmissionPayload(checkIn, excluded, contextSources, {
    sessionProcessing: true,
    savePreferences: false,
    aiTransmission: true,
  });
  if (!payload) return {};
  const record: Record<string, string> = {};
  for (const entry of payloadToPreviewEntries(payload)) {
    record[entry.label] = entry.value;
  }
  return record;
}

export function assertSessionProcessing(consent: ConsentState): void {
  if (!consent.sessionProcessing) {
    throw new ConsentRequiredError();
  }
}
