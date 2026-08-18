import type { VoiceSelection, VoiceVariant } from '../types';

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
      };
    }

    const spanish = voices.find((v) => v.lang.startsWith('es'));
    if (spanish) {
      return {
        voice: spanish,
        requestedLocale,
        actualLocale: spanish.lang,
        fallbackMessage: `No encontramos una voz argentina (es-AR). Usaremos ${spanish.name} (${spanish.lang}) como reemplazo.`,
      };
    }

    return {
      voice: voices[0],
      requestedLocale,
      actualLocale: voices[0].lang,
      fallbackMessage: `No encontramos una voz en español. Usaremos ${voices[0].name} (${voices[0].lang}) como reemplazo.`,
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
    };
  }

  return {
    voice: voices[0],
    requestedLocale,
    actualLocale: voices[0].lang,
    fallbackMessage: `No encontramos español neutro. Usaremos ${voices[0].name} (${voices[0].lang}).`,
  };
}

export interface SpeechPlayerState {
  status: 'idle' | 'playing' | 'paused' | 'stopped';
  currentSegmentIndex: number;
}

export function createUtterance(
  text: string,
  voice: SpeechSynthesisVoice | null,
  rate = 0.9,
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = 1;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  return utterance;
}
