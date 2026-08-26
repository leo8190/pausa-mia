import type { VoiceSelection, VoiceVariant } from '../types';
import {
  normalizeTextForArgentineWebSpeech,
  normalizeTextForTts,
} from './ttsPronunciation';

/** Velocidad calma por defecto para Web Speech (~20 % más lenta que rate 1). */
export const CALM_SPEECH_RATE = 0.8;

/**
 * Velocidad del fallback Web Speech en es-AR: más lenta que el neutro, sin
 * caer en un ralentizado caricaturesco (piso práctico ~0.7).
 */
export const ARGENTINE_WEB_SPEECH_RATE = 0.72;

/** Pitch ligeramente más bajo para el fallback Web Speech argentino. */
export const ARGENTINE_WEB_SPEECH_PITCH = 0.95;

const ARGENTINE_LOCALES = ['es-AR', 'es_AR'];

export function getRequestedLocale(variant: VoiceVariant): string {
  return variant === 'es-AR' ? 'es-AR' : 'es-MX';
}

export function getNeutralFallbackOrder(): string[] {
  return ['es-MX', 'es-US', 'es-419', 'es'];
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return [];
  }
  return window.speechSynthesis.getVoices();
}

function matchesLocale(voice: SpeechSynthesisVoice, locales: string[]): boolean {
  const voiceLocale = voice.lang.replace('_', '-');
  return locales.some(
    (locale) =>
      voiceLocale === locale ||
      voiceLocale.startsWith(locale + '-') ||
      voice.lang.startsWith(locale.replace('-', '_')),
  );
}

/**
 * Verdadero sólo cuando la voz declara explícitamente el locale argentino
 * (`es-AR`/`es_AR`). Voces de otros países hispanohablantes (es-MX, es-ES,
 * es-US, es-419, etc.) nunca deben etiquetarse como argentinas, aunque se
 * usen como reemplazo honesto cuando no hay una voz es-AR real disponible.
 */
export function isArgentineVoice(voice: SpeechSynthesisVoice): boolean {
  return matchesLocale(voice, ARGENTINE_LOCALES);
}

export function selectVoice(
  variant: VoiceVariant,
  voices: SpeechSynthesisVoice[],
): VoiceSelection {
  const requestedLocale = getRequestedLocale(variant);

  if (voices.length === 0) {
    return {
      voice: null,
      requestedLocale,
      actualLocale: 'none',
      fallbackMessage:
        'No se detectaron voces en tu dispositivo. El texto se mostrará para lectura.',
      isArgentine: false,
    };
  }

  if (variant === 'es-AR') {
    const argentine = voices.find((v) => matchesLocale(v, ARGENTINE_LOCALES));
    if (argentine) {
      return {
        voice: argentine,
        requestedLocale,
        actualLocale: argentine.lang,
        fallbackMessage: null,
        isArgentine: true,
      };
    }

    const spanish = voices.find((v) => v.lang.startsWith('es'));
    if (spanish) {
      return {
        voice: spanish,
        requestedLocale,
        actualLocale: spanish.lang,
        fallbackMessage: `No encontramos una voz argentina (es-AR). Usaremos ${spanish.name} (${spanish.lang}) como reemplazo, no como voz argentina.`,
        isArgentine: false,
      };
    }

    return {
      voice: voices[0],
      requestedLocale,
      actualLocale: voices[0].lang,
      fallbackMessage: `No encontramos una voz en español. Usaremos ${voices[0].name} (${voices[0].lang}) como reemplazo, no como voz argentina.`,
      isArgentine: false,
    };
  }

  for (const locale of getNeutralFallbackOrder()) {
    const match = voices.find((v) => matchesLocale(v, [locale]));
    if (match) {
      const isExact = locale === 'es-MX';
      return {
        voice: match,
        requestedLocale,
        actualLocale: match.lang,
        fallbackMessage: isExact
          ? null
          : `No encontramos es-MX. Usaremos ${match.name} (${match.lang}) como español neutro.`,
        isArgentine: false,
      };
    }
  }

  const anySpanish = voices.find((v) => v.lang.startsWith('es'));
  if (anySpanish) {
    return {
      voice: anySpanish,
      requestedLocale,
      actualLocale: anySpanish.lang,
      fallbackMessage: `Usaremos ${anySpanish.name} (${anySpanish.lang}) como reemplazo de español neutro.`,
      isArgentine: false,
    };
  }

  return {
    voice: voices[0],
    requestedLocale,
    actualLocale: voices[0].lang,
    fallbackMessage: `No encontramos español neutro. Usaremos ${voices[0].name} (${voices[0].lang}).`,
    isArgentine: false,
  };
}

export interface SpeechPlayerState {
  status: 'idle' | 'playing' | 'paused' | 'stopped';
  currentSegmentIndex: number;
}

export interface CreateUtteranceOptions {
  rate?: number;
  pitch?: number;
  /**
   * Aplica refuerzo de erres (rr / r inicial) pensado para el fallback Web
   * Speech argentino. No usar con Piper.
   */
  reinforceArgentineErres?: boolean;
  /** Variante de voz: define defaults de rate/pitch/erres si no se pasan. */
  voiceVariant?: VoiceVariant;
}

export function resolveWebSpeechProsody(variant: VoiceVariant): {
  rate: number;
  pitch: number;
  reinforceArgentineErres: boolean;
} {
  if (variant === 'es-AR') {
    return {
      rate: ARGENTINE_WEB_SPEECH_RATE,
      pitch: ARGENTINE_WEB_SPEECH_PITCH,
      reinforceArgentineErres: true,
    };
  }
  return {
    rate: CALM_SPEECH_RATE,
    pitch: 1,
    reinforceArgentineErres: false,
  };
}

export function createUtterance(
  text: string,
  voice: SpeechSynthesisVoice | null,
  options: CreateUtteranceOptions | number = {},
): SpeechSynthesisUtterance {
  const opts: CreateUtteranceOptions =
    typeof options === 'number' ? { rate: options } : options;
  const defaults = opts.voiceVariant
    ? resolveWebSpeechProsody(opts.voiceVariant)
    : {
        rate: CALM_SPEECH_RATE,
        pitch: 1,
        reinforceArgentineErres: false,
      };

  const reinforce = opts.reinforceArgentineErres ?? defaults.reinforceArgentineErres;
  const spoken = reinforce
    ? normalizeTextForArgentineWebSpeech(text)
    : normalizeTextForTts(text);

  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.rate = opts.rate ?? defaults.rate;
  utterance.pitch = opts.pitch ?? defaults.pitch;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  return utterance;
}
