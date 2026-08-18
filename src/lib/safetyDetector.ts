const DANGER_PATTERNS: RegExp[] = [
  /\b(quiero|voy a|me voy a)\s+(matar|suicidar|quitarme la vida)\b/i,
  /\b(me quiero morir|quiero morir|deseo morir)\b/i,
  /\b(no quiero (seguir )?vivir|no puedo (seguir )?vivir)\b/i,
  /\b(suicid|suicidarme|suicidio)\b/i,
  /\b(autolesión|autolesionarme|lastimarme|hacerme daño)\b/i,
  /\b(cortarme|matarme)\b/i,
  /\b(me voy a matar|voy a matarme)\b/i,
  /\b(acabar con (mi vida|todo))\b/i,
  /\b(terminar con (mi vida|todo))\b/i,
  /\b(no aguanto más vivir|no soporto más vivir)\b/i,
  /\b(me haré daño|voy a hacerme daño)\b/i,
  /\b(plan de suicid|pensando en suicid)\b/i,
];

export interface SafetyResult {
  triggered: boolean;
  matchedPattern: string | null;
  sourceText: string;
}

/** Fuente oficial del Ministerio de Salud de Argentina */
export const ARGENTINA_CRISIS_LINE = '0800-999-0091';
export const ARGENTINA_CRISIS_LINE_URL = 'https://www.argentina.gob.ar/node/492429';

export function detectImmediateDanger(text: string): SafetyResult {
  const normalized = text.trim();
  if (!normalized) {
    return { triggered: false, matchedPattern: null, sourceText: normalized };
  }

  for (const pattern of DANGER_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        triggered: true,
        matchedPattern: pattern.source,
        sourceText: normalized,
      };
    }
  }

  return { triggered: false, matchedPattern: null, sourceText: normalized };
}

export function scanCheckInForDanger(checkIn: {
  recentSituation: string;
  perceivedStateOther: string;
  avoidTopics: string;
  name: string;
}): SafetyResult {
  const combined = [
    checkIn.recentSituation,
    checkIn.perceivedStateOther,
    checkIn.avoidTopics,
    checkIn.name,
  ]
    .filter(Boolean)
    .join(' ');

  return detectImmediateDanger(combined);
}

export function scanTextForDanger(text: string): SafetyResult {
  return detectImmediateDanger(text);
}

export const SAFETY_MESSAGE =
  'Parece que estás pasando por algo muy difícil. Esta aplicación no puede ayudarte en una situación de peligro inmediato.';

export const SAFETY_ACTIONS = [
  'Contactá a una persona de confianza ahora.',
  'Buscá ayuda profesional o un servicio de emergencia local.',
  `Si estás en Argentina, podés llamar al ${ARGENTINA_CRISIS_LINE} (línea nacional gratuita, confidencial y disponible las 24 horas).`,
  'Ante peligro inmediato, llamá al 911 o a los servicios de emergencia locales.',
];
