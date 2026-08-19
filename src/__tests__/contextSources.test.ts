import { describe, expect, it } from 'vitest';
import {
  createManualDiarySources,
  parseImportedContent,
  parseGoogleProfileExport,
  parseGoogleCalendarExport,
  parseSocialExport,
  parseSourceByType,
  ADDABLE_SOURCES,
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

  describe('parseGoogleProfileExport', () => {
    it('parses a JSON profile export', () => {
      const result = parseGoogleProfileExport(
        JSON.stringify({ name: 'Ana' }),
        'Perfil.json',
      );
      expect(result.error).toBeNull();
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].type).toBe('google-profile');
      expect(result.sources[0].content).toContain('Ana');
    });

    it('strips tags from an HTML profile export', () => {
      const result = parseGoogleProfileExport(
        '<html><body><h1>Perfil</h1><p>Ana Pérez</p></body></html>',
        'Perfil.html',
      );
      expect(result.error).toBeNull();
      expect(result.sources[0].content).toContain('Ana Pérez');
      expect(result.sources[0].content).not.toContain('<');
    });

    it('returns a human error and keeps sources empty on unreadable HTML', () => {
      const result = parseGoogleProfileExport(
        '<html><body></body></html>',
        'Perfil.html',
      );
      expect(result.sources).toHaveLength(0);
      expect(result.error).toMatch(/no pudimos leer/i);
    });

    it('returns empty result for empty input without throwing', () => {
      const result = parseGoogleProfileExport('   ', 'Perfil.json');
      expect(result.sources).toHaveLength(0);
      expect(result.error).toBeNull();
    });
  });

  describe('parseGoogleCalendarExport', () => {
    it('parses events from an ICS calendar export', () => {
      const ics = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'DTSTART:20260101T090000Z',
        'SUMMARY:Reunión de equipo',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\n');
      const result = parseGoogleCalendarExport(ics, 'calendar.ics');
      expect(result.error).toBeNull();
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].type).toBe('google-calendar');
      expect(result.sources[0].content).toContain('Reunión de equipo');
      expect(result.sources[0].selected).toBe(false);
    });

    it('returns a human error when ICS has no events', () => {
      const result = parseGoogleCalendarExport(
        'BEGIN:VCALENDAR\nEND:VCALENDAR',
        'cal.ics',
      );
      expect(result.sources).toHaveLength(0);
      expect(result.error).toMatch(/no encontramos eventos/i);
    });

    it('parses a JSON calendar export', () => {
      const json = JSON.stringify([{ summary: 'Dentista' }]);
      const result = parseGoogleCalendarExport(json, 'calendar.json');
      expect(result.error).toBeNull();
      expect(result.sources[0].content).toContain('Dentista');
    });

    it('returns a human error on unparseable calendar file, without throwing', () => {
      const result = parseGoogleCalendarExport('not ics or json', 'weird.txt');
      expect(result.sources).toHaveLength(0);
      expect(result.error).toMatch(/no pudimos interpretar/i);
    });
  });

  describe('parseSocialExport', () => {
    it('parses a JSON social export into individual entries', () => {
      const json = JSON.stringify([{ text: 'Post uno' }, { text: 'Post dos' }]);
      const result = parseSocialExport('instagram', json, 'instagram.json');
      expect(result.error).toBeNull();
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0].type).toBe('instagram');
      expect(result.sources[0].selected).toBe(false);
    });

    it('returns a human error on invalid JSON without throwing', () => {
      const result = parseSocialExport('facebook', '{not valid json', 'facebook.json');
      expect(result.sources).toHaveLength(0);
      expect(result.error).toMatch(/no pudimos interpretar/i);
    });

    it('falls back to plain text for non-json files', () => {
      const result = parseSocialExport(
        'linkedin',
        'Perfil profesional exportado',
        'linkedin.txt',
      );
      expect(result.error).toBeNull();
      expect(result.sources[0].content).toContain('Perfil profesional exportado');
    });
  });

  describe('parseSourceByType', () => {
    it('dispatches to the google-profile parser', () => {
      const result = parseSourceByType(
        'google-profile',
        JSON.stringify({ a: 1 }),
        'p.json',
      );
      expect(result.sources[0].type).toBe('google-profile');
    });

    it('dispatches to the generic importer for import-text sources', () => {
      const result = parseSourceByType('import-text', 'hola', 'notas.txt');
      expect(result.error).toBeNull();
      expect(result.sources[0].type).toBe('import-text');
    });

    it('exposes an addable source definition for every non-generic source type', () => {
      const types = ADDABLE_SOURCES.map((s) => s.type);
      expect(types).toEqual(
        expect.arrayContaining([
          'google-profile',
          'google-calendar',
          'instagram',
          'facebook',
          'x',
          'linkedin',
          'tiktok',
        ]),
      );
    });
  });
});
