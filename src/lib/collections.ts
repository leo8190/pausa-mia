import type {
  CheckInData,
  Duration,
  Experience,
  Intention,
  MeditationStyle,
  Moment,
} from '../types';

export type CollectionPreset = {
  id: string;
  title: string;
  hint: string;
  duration: Duration;
  style: MeditationStyle;
  experience: Experience;
  intention: Intention;
  moment: Moment;
};

/**
 * Campos de check-in que aplica una colección.
 * Pasalos a `sessionApi.updateCheckIn(...)`.
 */
export type CollectionCheckInFields = Pick<
  CheckInData,
  'duration' | 'style' | 'experience' | 'intention' | 'moment'
>;

export function collectionCheckInFields(
  preset: CollectionPreset,
): CollectionCheckInFields {
  return {
    duration: preset.duration,
    style: preset.style,
    experience: preset.experience,
    intention: preset.intention,
    moment: preset.moment,
  };
}

/** Atajo de 1 minuto (CTA secundaria del welcome; no forma parte de la grilla). */
export const RAPIDA_1_MIN: CollectionPreset = {
  id: 'rapida-1',
  title: 'Pausa rápida · 1 min',
  hint: 'Un respiro ahora, sin cuenta.',
  duration: 1,
  style: 'respiracion-natural',
  experience: 'primera-vez',
  intention: 'calmar-ritmo',
  moment: 'ahora',
};

/**
 * Colecciones livianas: duración + práctica + experiencia + intención + momento.
 * Combos coherentes (sin conflictos de práctica con avoidTopics vacío).
 */
export const COLLECTIONS: CollectionPreset[] = [
  {
    id: 'ansiedad',
    title: 'Cuando todo se acelera',
    hint: 'Un espacio para estar, con la respiración.',
    duration: 5,
    style: 'respiracion-natural',
    experience: 'basica',
    intention: 'calmar-ritmo',
    moment: 'ahora',
  },
  {
    id: 'sueno',
    title: 'Antes de dormir',
    hint: 'Soltar el día con un recorrido suave.',
    duration: 10,
    style: 'recorrido-corporal',
    experience: 'basica',
    intention: 'descansar',
    moment: 'antes-de-dormir',
  },
  {
    id: 'foco',
    title: 'Foco entre tareas',
    hint: 'Atención abierta en una pausa laboral.',
    duration: 5,
    style: 'atencion-abierta',
    experience: 'habitual',
    intention: 'concentrarse',
    moment: 'pausa-laboral',
  },
  {
    id: 'principiantes',
    title: 'Primera vez',
    hint: 'Corta y simple, para arrancar sin apuro.',
    duration: 3,
    style: 'respiracion-natural',
    experience: 'primera-vez',
    intention: 'calmar-ritmo',
    moment: 'ahora',
  },
  {
    id: 'futuro',
    title: 'Cuando el futuro te da vueltas',
    hint: 'Autocompasión para lo que aún no llegó.',
    duration: 3,
    style: 'autocompasion',
    experience: 'basica',
    intention: 'con-el-futuro',
    moment: 'ahora',
  },
  {
    id: 'cuerpo',
    title: 'Volver al cuerpo',
    hint: 'Recorrido corporal, acá y ahora.',
    duration: 5,
    style: 'recorrido-corporal',
    experience: 'basica',
    intention: 'volver-al-cuerpo',
    moment: 'ahora',
  },
];
