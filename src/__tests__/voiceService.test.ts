import { describe, expect, it } from 'vitest';
import {
  selectVoice,
  getRequestedLocale,
  createUtterance,
  getNeutralFallbackOrder,
  isArgentineVoice,
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
    expect(selection.fallbackMessage).toContain('es-MX');
  });

  it('handles empty voice list', () => {
    const selection = selectVoice('es-neutro', []);
    expect(selection.voice).toBeNull();
    expect(selection.fallbackMessage).toContain('No se detectaron');
  });

  it('creates utterance with voice and rate', () => {
    const voice = mockVoice('Test', 'es-AR');
    const utterance = createUtterance('Hola', voice, 0.85);
    expect(utterance.text).toBe('Hola');
    expect(utterance.rate).toBe(0.85);
    expect(utterance.voice).toBe(voice);
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
    expect(selection.fallbackMessage).toContain('no como voz argentina');
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
});
