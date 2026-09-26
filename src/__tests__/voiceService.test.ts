import { describe, expect, it } from 'vitest';
import {
  selectVoice,
  getRequestedLocale,
  createUtterance,
  getNeutralFallbackOrder,
  isArgentineVoice,
  CALM_SPEECH_RATE,
  ARGENTINE_WEB_SPEECH_RATE,
  ARGENTINE_WEB_SPEECH_PITCH,
} from '../lib/voiceService';

function mockVoice(name: string, lang: string): SpeechSynthesisVoice {
  return {
    name,
    lang,
    default: false,
    localService: true,
    voiceURI: name,
  } as SpeechSynthesisVoice;
}

describe('voiceService', () => {
  it.each(['es-AR', 'es-neutro'] as const)(
    'prefers an installed higher-quality voice without changing locale (%s)',
    (variant) => {
      const locale = getRequestedLocale(variant);
      const compact = mockVoice('Voice', locale);
      const enhanced = mockVoice('Voice (Enhanced)', locale);
      const premium = mockVoice('Voice (Premium)', locale);
      const voices = [compact, enhanced, premium];
      expect(selectVoice(variant, voices).voice).toBe(premium);
      expect(voices).toEqual([compact, enhanced, premium]);
      expect(selectVoice(variant, [compact, enhanced]).voice).toBe(enhanced);
    },
  );

  it('recognizes an installed quality marker in the URI or Spanish label', () => {
    const compact = mockVoice('Paulina', 'es-MX');
    const enhanced = mockVoice('Paulina (Mejorada)', 'es-MX');
    const premium = {
      ...compact,
      voiceURI: 'com.apple.voice.premium.es-MX.Paulina',
    };
    expect(selectVoice('es-neutro', [compact, enhanced]).voice).toBe(enhanced);
    expect(selectVoice('es-neutro', [compact, enhanced, premium]).voice).toBe(premium);
  });

  it('does not select a network voice merely because its name says Premium', () => {
    const local = mockVoice('Paulina', 'es-MX');
    const remote = { ...mockVoice('Premium', 'es-MX'), localService: false };
    expect(selectVoice('es-neutro', [local, remote]).voice).toBe(local);
  });

  it('does not trade the requested accent for a quality label', () => {
    const neutral = mockVoice('Paulina', 'es-MX');
    const argentine = mockVoice('Diego', 'es-AR');
    const spain = mockVoice('Voice (Premium)', 'es-ES');
    expect(selectVoice('es-neutro', [spain, neutral]).voice).toBe(neutral);
    expect(selectVoice('es-AR', [spain, neutral, argentine]).voice).toBe(argentine);
  });

  it('keeps the existing voice when no explicit quality upgrade is available', () => {
    const first = mockVoice('Paulina', 'es-MX');
    expect(selectVoice('es-neutro', [first, mockVoice('Another', 'es-MX')]).voice).toBe(
      first,
    );
  });

  it('keeps the previous fallback accent when Argentine is unavailable', () => {
    const mexican = mockVoice('Paulina', 'es-MX');
    const spain = mockVoice('Mónica (Premium)', 'es-ES');
    const upgrade = mockVoice('Paulina (Enhanced)', 'es_MX');
    expect(selectVoice('es-AR', [mexican, spain]).voice).toBe(mexican);
    const selection = selectVoice('es-AR', [mexican, spain, upgrade]);
    expect(selection.voice).toBe(upgrade);
    expect(selection.isArgentine).toBe(false);
    expect(selection.fallbackMessage).toContain('no tiene acento argentino');
  });

  it('preserves the first fallback region when neutral reaches generic Spanish', () => {
    const colombian = mockVoice('Colombian', 'es-CO');
    const spain = mockVoice('Mónica (Premium)', 'es-ES');
    const upgrade = mockVoice('Colombian (Enhanced)', 'es-CO');
    expect(selectVoice('es-neutro', [colombian, spain]).voice).toBe(colombian);
    expect(selectVoice('es-neutro', [colombian, spain, upgrade]).voice).toBe(upgrade);
  });

  it('requests es-AR for argentine variant', () => {
    expect(getRequestedLocale('es-AR')).toBe('es-AR');
  });

  it('requests es-MX for neutral variant', () => {
    expect(getRequestedLocale('es-neutro')).toBe('es-MX');
  });

  it('selects argentine voice when available', () => {
    const voices = [mockVoice('Paulina', 'es-MX'), mockVoice('Diego', 'es-AR')];
    const selection = selectVoice('es-AR', voices);
    expect(selection.voice?.lang).toBe('es-AR');
    expect(selection.fallbackMessage).toBeNull();
  });

  it('falls back with message when argentine voice missing', () => {
    const voices = [mockVoice('Paulina', 'es-MX')];
    const selection = selectVoice('es-AR', voices);
    expect(selection.voice).not.toBeNull();
    expect(selection.fallbackMessage).toContain('reemplazo');
  });

  it('selects neutral voice with fallback order', () => {
    const voices = [mockVoice('Juan', 'es-US'), mockVoice('Paulina', 'es-MX')];
    const selection = selectVoice('es-neutro', voices);
    expect(selection.voice?.lang).toBe('es-MX');
  });

  it('uses es-US when es-MX not available for neutral', () => {
    const voices = [mockVoice('Juan', 'es-US')];
    const selection = selectVoice('es-neutro', voices);
    expect(selection.voice?.lang).toBe('es-US');
    expect(selection.fallbackMessage).toContain('acento puede variar');
  });

  it('handles empty voice list', () => {
    const selection = selectVoice('es-neutro', []);
    expect(selection.voice).toBeNull();
    expect(selection.fallbackMessage).toContain('No se detectaron');
  });

  it('creates utterance with voice and rate', () => {
    const voice = mockVoice('Test', 'es-AR');
    const utterance = createUtterance('Hola', voice, { rate: 0.85 });
    expect(utterance.text).toBe('Hola');
    expect(utterance.rate).toBe(0.85);
    expect(utterance.voice).toBe(voice);
  });

  it('uses the calm speech rate by default, including for Spanish-neutral fallback', () => {
    expect(CALM_SPEECH_RATE).toBeCloseTo(0.62, 2);
    const utterance = createUtterance('Hola', mockVoice('Paulina', 'es-MX'));
    expect(utterance.rate).toBe(CALM_SPEECH_RATE);
    expect(utterance.pitch).toBe(1);
  });

  it('uses slower Argentine Web Speech and natural spelling/pitch for es-AR', () => {
    const utterance = createUtterance('Respirá y cerrá.', mockVoice('Diego', 'es-AR'), {
      voiceVariant: 'es-AR',
    });
    expect(utterance.rate).toBe(ARGENTINE_WEB_SPEECH_RATE);
    expect(utterance.pitch).toBe(ARGENTINE_WEB_SPEECH_PITCH);
    expect(utterance.text).toBe('Respirá y cerrá.');
  });

  it('preserves the Argentine voice and natural pitch at the slower cadence', () => {
    const voice = mockVoice('Diego', 'es-AR');
    const utterance = createUtterance('Tomate un momento.', voice);
    expect(utterance.voice).toBe(voice);
    expect(utterance.rate).toBeCloseTo(0.62, 2);
    expect(utterance.pitch).toBe(1);
  });

  it('keeps ritmo intact instead of inserting a spoken syllable break', () => {
    const utterance = createUtterance('Calmá el ritmo.', mockVoice('Diego', 'es-AR'));
    expect(utterance.text).toBe('Calmá el ritmo.');
  });

  it('neutral fallback order includes es-419', () => {
    const order = getNeutralFallbackOrder();
    expect(order).toContain('es-419');
    expect(order).toContain('es-MX');
  });

  it('never labels an es-MX voice as argentine', () => {
    const voices = [mockVoice('Paulina', 'es-MX')];
    const selection = selectVoice('es-AR', voices);
    expect(selection.isArgentine).toBe(false);
    expect(selection.actualLocale).toBe('es-MX');
    expect(selection.fallbackMessage).toContain('no tiene acento argentino');
  });

  it('never labels es-ES or es-US as argentine when requesting es-AR', () => {
    const voices = [mockVoice('Conchita', 'es-ES'), mockVoice('Juan', 'es-US')];
    const selection = selectVoice('es-AR', voices);
    expect(selection.isArgentine).toBe(false);
    expect(isArgentineVoice(selection.voice as SpeechSynthesisVoice)).toBe(false);
  });

  it('marks isArgentine true only for a genuine es-AR/es_AR voice', () => {
    expect(isArgentineVoice(mockVoice('Diego', 'es-AR'))).toBe(true);
    expect(isArgentineVoice(mockVoice('Diego', 'es_AR'))).toBe(true);
    expect(isArgentineVoice(mockVoice('Paulina', 'es-MX'))).toBe(false);
  });

  it('marks isArgentine true and no fallback message for a real es-AR match', () => {
    const voices = [mockVoice('Diego', 'es-AR')];
    const selection = selectVoice('es-AR', voices);
    expect(selection.isArgentine).toBe(true);
    expect(selection.fallbackMessage).toBeNull();
  });

  it('never marks neutral selections as argentine', () => {
    const voices = [mockVoice('Diego', 'es-AR'), mockVoice('Paulina', 'es-MX')];
    const selection = selectVoice('es-neutro', voices);
    expect(selection.isArgentine).toBe(false);
  });

  it.each(['es-AR', 'es-neutro'] as const)(
    'never reads Spanish with a foreign-only voice list (%s)',
    (variant) => {
      const selection = selectVoice(variant, [mockVoice('English', 'en-US')]);
      expect(selection.voice).toBeNull();
      expect(selection.fallbackMessage).toContain('No encontramos una voz en español');
    },
  );
});
