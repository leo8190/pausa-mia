export type Moment = 'ahora' | 'antes-de-dormir' | 'al-despertar' | 'pausa-laboral';

export type PerceivedState =
  'tranquilo' | 'acelerado' | 'disperso' | 'cansado' | 'sensible' | 'otro';

export type Intention =
  | 'calmar-ritmo'
  | 'concentrarse'
  | 'descansar'
  | 'aceptar-emocion'
  | 'volver-al-cuerpo';

export type Experience = 'primera-vez' | 'basica' | 'habitual';

export type MeditationStyle =
  'respiracion-natural' | 'recorrido-corporal' | 'atencion-abierta' | 'autocompasion';

export type Duration = 3 | 5 | 10;

export type VoiceVariant = 'es-AR' | 'es-neutro';

export type ScriptEngineType = 'local' | 'ai';

export type AppStep =
  | 'welcome'
  | 'consent'
  | 'checkin'
  | 'context'
  | 'summary'
  | 'ai-consent'
  | 'safety'
  | 'review'
  | 'playback'
  | 'feedback'
  | 'deleted';

export interface CheckInData {
  name: string;
  moment: Moment | '';
  recentSituation: string;
  perceivedState: PerceivedState | '';
  perceivedStateOther: string;
  intention: Intention | '';
  experience: Experience | '';
  style: MeditationStyle | '';
  avoidTopics: string;
  duration: Duration;
  voiceVariant: VoiceVariant;
}

export interface ConsentState {
  sessionProcessing: boolean;
  savePreferences: boolean;
  aiTransmission: boolean;
}

export interface ScriptSegment {
  text: string;
  pauseAfterMs: number;
}

export interface GeneratedScript {
  title: string;
  intentionLabel: string;
  targetDuration: Duration;
  estimatedMinutes: number;
  segments: ScriptSegment[];
  fullText: string;
  usedDetails: string[];
  engine: ScriptEngineType;
}

export type { ContextSource, ContextSourceType } from '../lib/contextSources';

export interface SessionState {
  step: AppStep;
  consent: ConsentState;
  checkIn: CheckInData;
  contextSources: import('../lib/contextSources').ContextSource[];
  summaryExcluded: Set<string>;
  script: GeneratedScript | null;
  scriptFallbackUsed: boolean;
  useAiEngine: boolean;
  aiAvailable: boolean;
  safetyTriggered: boolean;
  safetyText: string;
  voiceFallback: string | null;
  rating: number | null;
  selectedPrice: string | null;
  wouldRepeat: boolean | null;
}

export interface VoiceSelection {
  voice: SpeechSynthesisVoice | null;
  requestedLocale: string;
  actualLocale: string;
  fallbackMessage: string | null;
}

export type PriceOption = 'session' | 'monthly' | 'quarter';

export const PRICE_OPTIONS: Record<
  PriceOption,
  { label: string; amount: string; description: string }
> = {
  session: {
    label: 'Una sesión premium',
    amount: 'USD 2',
    description: 'Una meditación completa cuando la necesites.',
  },
  monthly: {
    label: 'Membresía fundadora mensual',
    amount: 'USD 8',
    description: 'Sesiones ilimitadas durante un mes.',
  },
  quarter: {
    label: 'Pase fundador 3 meses',
    amount: 'USD 20',
    description: 'Acceso completo por tres meses.',
  },
};

export const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre o apodo',
  moment: 'Momento del día',
  recentSituation: 'Situación reciente',
  perceivedState: 'Estado percibido',
  intention: 'Intención de la pausa',
  experience: 'Experiencia con meditación',
  style: 'Estilo de práctica',
  avoidTopics: 'Temas o palabras a evitar',
  duration: 'Duración',
  voiceVariant: 'Variante de español',
  contextSources: 'Fuentes de contexto seleccionadas',
};

export const MOMENT_LABELS: Record<Moment, string> = {
  ahora: 'Ahora, en este momento',
  'antes-de-dormir': 'Antes de dormir',
  'al-despertar': 'Al despertar',
  'pausa-laboral': 'Pausa laboral',
};

export const STATE_LABELS: Record<PerceivedState, string> = {
  tranquilo: 'Tranquilo',
  acelerado: 'Acelerado',
  disperso: 'Disperso',
  cansado: 'Cansado',
  sensible: 'Sensible',
  otro: 'Otro',
};

export const INTENTION_LABELS: Record<Intention, string> = {
  'calmar-ritmo': 'Calmar el ritmo',
  concentrarse: 'Concentrarse',
  descansar: 'Descansar',
  'aceptar-emocion': 'Aceptar una emoción',
  'volver-al-cuerpo': 'Volver al cuerpo',
};

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  'primera-vez': 'Primera vez',
  basica: 'Experiencia básica',
  habitual: 'Práctica habitual',
};

export const STYLE_LABELS: Record<MeditationStyle, string> = {
  'respiracion-natural': 'Respiración natural',
  'recorrido-corporal': 'Recorrido corporal',
  'atencion-abierta': 'Atención abierta',
  autocompasion: 'Autocompasión',
};

export const VOICE_LABELS: Record<VoiceVariant, string> = {
  'es-AR': 'Español argentino',
  'es-neutro': 'Español neutro',
};

export const ENGINE_LABELS: Record<ScriptEngineType, string> = {
  local: 'Motor local por reglas',
  ai: 'Motor IA (servidor local)',
};
