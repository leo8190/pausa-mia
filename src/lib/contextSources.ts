export type ContextSourceType =
  | 'manual-diary'
  | 'import-text'
  | 'import-json'
  | 'google-profile'
  | 'google-calendar'
  | 'instagram'
  | 'facebook'
  | 'x'
  | 'linkedin'
  | 'tiktok'
  | 'other';

export const CONTEXT_SOURCE_LABELS: Record<ContextSourceType, string> = {
  'manual-diary': 'Diario manual',
  'import-text': 'Importación de texto',
  'import-json': 'Importación JSON',
  'google-profile': 'Google Perfil',
  'google-calendar': 'Google Calendar',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  other: 'Otra fuente',
};

export const CONTEXT_SOURCE_MAX_LENGTH = 500;

export interface ContextSource {
  id: string;
  type: ContextSourceType;
  label: string;
  date?: string;
  content: string;
  selected: boolean;
}

export function createContextSource(
  type: ContextSourceType,
  label: string,
  content: string,
  options?: { date?: string; selected?: boolean },
): ContextSource {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label,
    date: options?.date,
    content: content.slice(0, CONTEXT_SOURCE_MAX_LENGTH),
    selected: options?.selected ?? true,
  };
}

export function getDiaryDateLabel(offset: 0 | 1 | 2): string {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function getDiaryDisplayLabel(offset: 0 | 1 | 2): string {
  const labels = ['Hoy', 'Ayer', 'Anteayer'] as const;
  return labels[offset];
}

export function createManualDiarySources(): ContextSource[] {
  return ([0, 1, 2] as const).map((offset) =>
    createContextSource(
      'manual-diary',
      `Diario manual — ${getDiaryDisplayLabel(offset)}`,
      '',
      { date: getDiaryDateLabel(offset), selected: false },
    ),
  );
}

export function parseImportedContent(text: string, filename: string): ContextSource[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const isJson = filename.endsWith('.json');
  if (isJson) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .slice(0, 10)
          .map((item, i) => {
            const content =
              typeof item === 'string'
                ? item
                : typeof item === 'object' && item !== null && 'text' in item
                  ? String((item as { text: unknown }).text)
                  : JSON.stringify(item);
            return createContextSource(
              'import-json',
              `Importación JSON — entrada ${i + 1}`,
              content,
            );
          })
          .filter((s) => s.content.trim().length > 0);
      }
      return [
        createContextSource('import-json', `Importación JSON — ${filename}`, trimmed),
      ];
    } catch {
      return [createContextSource('import-text', `Importación — ${filename}`, trimmed)];
    }
  }

  return [createContextSource('import-text', `Importación — ${filename}`, trimmed)];
}

export function getSelectedContextSources(sources: ContextSource[]): ContextSource[] {
  return sources.filter((s) => s.selected && s.content.trim().length > 0);
}

export function getSelectedContextText(sources: ContextSource[]): string {
  return getSelectedContextSources(sources)
    .map((s) => `[${CONTEXT_SOURCE_LABELS[s.type]}: ${s.label}] ${s.content}`)
    .join('\n');
}
