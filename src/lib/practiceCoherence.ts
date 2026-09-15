import type { CheckInData } from '../types';
import { INTENTION_LABELS, STYLE_LABELS } from '../types';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function avoidedTopics(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((topic) => normalize(topic.trim()))
    .filter(Boolean);
}

export function mentionsAvoidedTopic(text: string, value: string): boolean {
  const normalized = normalize(text);
  return avoidedTopics(value).some((topic) => {
    const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(normalized);
  });
}

/** Intention is the aim; style is the method. None of the twenty pairs is invalid. */
export function getPracticeSummary(checkIn: CheckInData): string {
  if (!checkIn.style || !checkIn.intention) return '';
  const summary = `${INTENTION_LABELS[checkIn.intention]} con ${STYLE_LABELS[checkIn.style].toLowerCase()}.`;
  if (checkIn.moment !== 'antes-de-dormir') return summary;
  return checkIn.intention === 'concentrarse'
    ? `${summary} El cierre acompaña el descanso; concentrarse no significa mantenerse despierto.`
    : `${summary} El cierre acompaña el descanso, sin pedirte volver a la actividad.`;
}

/** Ask for a choice instead of silently overriding an explicitly avoided core topic. */
export function getPracticeConflicts(
  checkIn: CheckInData,
  excluded = new Set<string>(),
): string[] {
  if (excluded.has('avoidTopics')) return [];
  const topics = avoidedTopics(checkIn.avoidTopics);
  const avoidsBreath = topics.some((topic) =>
    /^(respir\w*|aire|inhal\w*|exhal\w*)$/.test(topic),
  );
  const avoidsBody = topics.some((topic) =>
    /^(cuerpo|corporal|sensaciones corporales)$/.test(topic),
  );
  const avoidsEmotion = topics.some((topic) => /^emocion(es)?$/.test(topic));
  const style = excluded.has('style') ? '' : checkIn.style;
  const intention = excluded.has('intention') ? '' : checkIn.intention;
  const issues: string[] = [];
  if (avoidsBreath && (!style || style === 'respiracion-natural')) {
    issues.push(
      'Pediste evitar la respiración, pero esta práctica se apoya en ella. Elegí otro estilo o cambiá lo que querés evitar.',
    );
  }
  if (
    avoidsBody &&
    (style === 'recorrido-corporal' || intention === 'volver-al-cuerpo')
  ) {
    issues.push(
      'Pediste evitar el cuerpo, pero también elegiste una práctica corporal. Cambiá esa elección o lo que querés evitar.',
    );
  }
  if (avoidsEmotion && intention === 'aceptar-emocion') {
    issues.push(
      'Pediste evitar las emociones y también acompañar una emoción. Elegí qué preferís para esta pausa.',
    );
  }
  return issues;
}

export function getScriptCoherenceIssues(
  text: string,
  closingText: string,
  checkIn: CheckInData,
  excluded = new Set<string>(),
): string[] {
  const issues = getPracticeConflicts(checkIn, excluded);
  const normalized = normalize(text);
  if (
    /mas de lo comodo|mas alla de lo comodo|aguanta (el aire|la respiracion)|reten(e|ga|gas)? (el aire|la respiracion)/.test(
      normalized,
    )
  ) {
    issues.push('El guion no debe pedir incomodidad ni retener el aire.');
  }
  if (!excluded.has('avoidTopics') && mentionsAvoidedTopic(text, checkIn.avoidTopics)) {
    issues.push('El guion menciona una palabra que elegiste evitar.');
  }
  if (
    !excluded.has('style') &&
    checkIn.style === 'atencion-abierta' &&
    /elegi?r? un solo apoyo|elige un solo apoyo|un solo lugar, sin apretarla/.test(
      normalized,
    )
  ) {
    issues.push('La atención abierta no debe exigir fijarse en un único punto.');
  }
  if (
    !excluded.has('moment') &&
    checkIn.moment === 'antes-de-dormir' &&
    /vuelve al trabajo|volve al trabajo|retoma tus tareas|retoma el trabajo|abri los ojos|abre los ojos|mantente despierto|mantenete despierto/.test(
      normalize(closingText),
    )
  ) {
    issues.push('El cierre para dormir no debe pedir volver a la actividad.');
  }
  return issues;
}
