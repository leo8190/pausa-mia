import { describe, expect, it } from 'vitest';
import {
  createManualDiarySources,
  parseImportedContent,
  CONTEXT_SOURCE_MAX_LENGTH,
} from '../lib/contextSources';

describe('contextSources', () => {
  it('creates manual diary sources for today, yesterday and day before', () => {
    const sources = createManualDiarySources();
    expect(sources).toHaveLength(3);
    expect(sources[0].label).toContain('Hoy');
    expect(sources[1].label).toContain('Ayer');
    expect(sources[2].label).toContain('Anteayer');
    expect(sources.every((s) => s.type === 'manual-diary')).toBe(true);
  });

  it('parses text import', () => {
    const sources = parseImportedContent('Entrada de diario de prueba', 'notas.txt');
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('import-text');
    expect(sources[0].content).toBe('Entrada de diario de prueba');
  });

  it('parses JSON array import', () => {
    const json = JSON.stringify([{ text: 'Primera entrada' }, 'Segunda entrada']);
    const sources = parseImportedContent(json, 'export.json');
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(sources[0].type).toBe('import-json');
  });

  it('enforces max length per source', () => {
    const long = 'a'.repeat(CONTEXT_SOURCE_MAX_LENGTH + 100);
    const sources = parseImportedContent(long, 'long.txt');
    expect(sources[0].content.length).toBeLessThanOrEqual(CONTEXT_SOURCE_MAX_LENGTH);
  });
});
