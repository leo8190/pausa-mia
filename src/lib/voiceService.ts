import type { VoiceSelection, VoiceVariant } from '../types';
import { normalizeTextForTts } from './ttsPronunciation';

/** Cadencia pausada para Web Speech; el ritmo real depende de la voz del dispositivo. */
export const CALM_SPEECH_RATE = 0.62;

/**
 * Velocidad pausada del fallback Web Speech en es-AR, ligeramente menor
 * que la neutra. El resultado real depende de la voz del dispositivo.
 */
export const ARGENTINE_WEB_SPEECH_RATE = 0.6;

/** Conserva el tono natural de la voz argentina al hablar más despacio. */
export const ARGENTINE_WEB_SPEECH_PITCH = 1;

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
 * Some systems expose several qualities of the same voice, with the compact
 * version first. Prefer an explicitly labelled, already installed upgrade.
 * This is only a metadata hint, not a guarantee of warmth. Never select a new
 * network voice or download anything on the strength of a quality label.
 */
function selectInstalledQuality(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const normalizeLocale = (lang: string) => lang.replace(/_/g, '-').toLowerCase();
  const first = voices[0];
  if (!first) return undefined;
  const locale = normalizeLocale(first.lang);
  const quality = (voice: SpeechSynthesisVoice) => {
    if (!voice.localService) return 0;
    const label = `${voice.name} ${voice.voiceURI}`;
    if (/\bpremium\b/i.test(label)) return 2;
    if (/\benhanced\b|\bmejorad[ao]\b|\balta calidad\b/i.test(label)) return 1;
    return 0;
  };
  return voices.reduce(
    (best, voice) =>
      normalizeLocale(voice.lang) === locale && quality(voice) > quality(best)
        ? voice
        : best,
    first,
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
    const argentine = selectInstalledQuality(
      voices.filter((v) => matchesLocale(v, ARGENTINE_LOCALES)),
    );
    if (argentine) {
      return {
        voice: argentine,
        requestedLocale,
        actualLocale: argentine.lang,
        fallbackMessage: null,
        isArgentine: true,
      };
    }

    const spanish = selectInstalledQuality(
      voices.filter((v) => v.lang.startsWith('es')),
    );
    if (spanish) {
      return {
        voice: spanish,
        requestedLocale,
        actualLocale: spanish.lang,
        fallbackMessage:
          'Esta voz de reemplazo habla español, pero no tiene acento argentino.',
        isArgentine: false,
      };
    }

    return {
      voice: null,
      requestedLocale,
      actualLocale: 'none',
      fallbackMessage:
        'No encontramos una voz en español. Podés leer el guion en pantalla.',
      isArgentine: false,
    };
  }

  for (const locale of getNeutralFallbackOrder()) {
    const match = selectInstalledQuality(
      voices.filter((v) => matchesLocale(v, [locale])),
    );
    if (match) {
      const isExact = locale === 'es-MX';
      return {
        voice: match,
        requestedLocale,
        actualLocale: match.lang,
        fallbackMessage: isExact
          ? null
          : 'Usaremos una voz en español disponible en tu dispositivo. El acento puede variar.',
        isArgentine: false,
      };
    }
  }

  const anySpanish = selectInstalledQuality(
    voices.filter((v) => v.lang.startsWith('es')),
  );
  if (anySpanish) {
    return {
      voice: anySpanish,
      requestedLocale,
      actualLocale: anySpanish.lang,
      fallbackMessage:
        'Usaremos una voz en español disponible en tu dispositivo. El acento puede variar.',
      isArgentine: false,
    };
  }

  return {
    voice: null,
    requestedLocale,
    actualLocale: 'none',
    fallbackMessage:
      'No encontramos una voz en español. Podés leer el guion en pantalla.',
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
  /** Variante de voz: define defaults de rate/pitch si no se pasan. */
  voiceVariant?: VoiceVariant;
}

export function resolveWebSpeechProsody(variant: VoiceVariant): {
  rate: number;
  pitch: number;
} {
  if (variant === 'es-AR') {
    return {
      rate: ARGENTINE_WEB_SPEECH_RATE,
      pitch: ARGENTINE_WEB_SPEECH_PITCH,
    };
  }
  return {
    rate: CALM_SPEECH_RATE,
    pitch: 1,
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
      };

  const spoken = normalizeTextForTts(text);

  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.rate = opts.rate ?? defaults.rate;
  utterance.pitch = opts.pitch ?? defaults.pitch;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  return utterance;
}
