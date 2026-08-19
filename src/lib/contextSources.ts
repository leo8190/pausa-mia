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
  'google-profile': 'Perfil exportado de Google',
  'google-calendar': 'Calendario de Google exportado',
  instagram: 'Exportación de Instagram',
  facebook: 'Exportación de Facebook',
  x: 'Exportación de X (Twitter)',
  linkedin: 'Exportación de LinkedIn',
  tiktok: 'Exportación de TikTok',
  other: 'Otra fuente',
};

/**
 * Fuentes locales accionables ("Fuentes que podés agregar"). Todas se procesan
 * sólo en esta sesión, a partir de un archivo que la persona elige en su propio
 * dispositivo. Ninguna hace OAuth ni envía datos a un servidor.
 */
export interface AddableSourceDefinition {
  type: ContextSourceType;
  title: string;
  description: string;
  accept: string;
  /** Texto de la conexión en línea equivalente, mostrada siempre deshabilitada. */
  onlineConnectionLabel: string;
}

export const ADDABLE_SOURCES: AddableSourceDefinition[] = [
  {
    type: 'google-profile',
    title: 'Perfil exportado de Google',
    description:
      'Archivo de Google Takeout con tu perfil (JSON o HTML). Se lee sólo en tu navegador.',
    accept: '.json,.html,.htm',
    onlineConnectionLabel: 'Conectar cuenta de Google (requiere configuración)',
  },
  {
    type: 'google-calendar',
    title: 'Calendario de Google exportado',
    description: 'Archivo .ics (text/calendar) o JSON exportado desde Google Calendar.',
    accept: '.ics,.json,text/calendar',
    onlineConnectionLabel: 'Conectar Google Calendar (requiere configuración)',
  },
  {
    type: 'instagram',
    title: 'Exportación de Instagram',
    description: 'Archivo JSON o texto de tu descarga de datos de Instagram.',
    accept: '.json,.txt',
    onlineConnectionLabel: 'Conectar Instagram (requiere configuración)',
  },
  {
    type: 'facebook',
    title: 'Exportación de Facebook',
    description: 'Archivo JSON o texto de tu descarga de información de Facebook.',
    accept: '.json,.txt',
    onlineConnectionLabel: 'Conectar Facebook (requiere configuración)',
  },
  {
    type: 'x',
    title: 'Exportación de X (Twitter)',
    description: 'Archivo JSON o texto de tu archivo de datos de X.',
    accept: '.json,.txt',
    onlineConnectionLabel: 'Conectar X (requiere configuración)',
  },
  {
    type: 'linkedin',
    title: 'Exportación de LinkedIn',
    description: 'Archivo JSON, CSV o texto exportado desde LinkedIn.',
    accept: '.json,.csv,.txt,text/csv',
    onlineConnectionLabel: 'Conectar LinkedIn (requiere configuración)',
  },
  {
    type: 'tiktok',
    title: 'Exportación de TikTok',
    description: 'Archivo JSON o texto de tu descarga de datos de TikTok.',
    accept: '.json,.txt',
    onlineConnectionLabel: 'Conectar TikTok (requiere configuración)',
  },
];

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

export interface ParseResult {
  sources: ContextSource[];
  error: string | null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae texto legible de una exportación de Perfil de Google (JSON o HTML
 * de Google Takeout). Nunca hace red ni OAuth: sólo lee el archivo local
 * elegido por la persona.
 */
export function parseGoogleProfileExport(text: string, filename: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { sources: [], error: null };
  }

  const lowerName = filename.toLowerCase();
  try {
    if (
      lowerName.endsWith('.json') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('[')
    ) {
      const parsed = JSON.parse(trimmed) as unknown;
      const flat = JSON.stringify(parsed);
      return {
        sources: [
          createContextSource('google-profile', `Perfil de Google — ${filename}`, flat),
        ],
        error: null,
      };
    }

    const readable = stripHtml(trimmed);
    if (!readable) {
      return {
        sources: [],
        error:
          'No pudimos leer contenido en ese archivo HTML. Probá exportar el perfil como JSON desde Google Takeout.',
      };
    }
    return {
      sources: [
        createContextSource(
          'google-profile',
          `Perfil de Google — ${filename}`,
          readable,
        ),
      ],
      error: null,
    };
  } catch {
    return {
      sources: [],
      error:
        'No pudimos interpretar ese archivo como perfil de Google (JSON u HTML válido). Podés reintentar con otro archivo.',
    };
  }
}

function parseIcsCalendar(text: string): string[] {
  const events: string[] = [];
  const veventBlocks = text.split('BEGIN:VEVENT').slice(1);
  for (const block of veventBlocks) {
    const summaryMatch = block.match(/SUMMARY:(.*)/);
    const dtStartMatch = block.match(/DTSTART[^:]*:(.*)/);
    const summary = summaryMatch?.[1]?.trim();
    const dtStart = dtStartMatch?.[1]?.trim();
    if (summary) {
      events.push(dtStart ? `${dtStart} — ${summary}` : summary);
    }
  }
  return events;
}

/**
 * Interpreta una exportación de Calendario de Google en formato .ics o JSON.
 * Sólo lee el archivo local elegido por la persona; no consulta la API de
 * Google Calendar ni requiere OAuth.
 */
export function parseGoogleCalendarExport(text: string, filename: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { sources: [], error: null };
  }

  const lowerName = filename.toLowerCase();
  try {
    if (lowerName.endsWith('.ics') || trimmed.startsWith('BEGIN:VCALENDAR')) {
      const events = parseIcsCalendar(trimmed);
      if (events.length === 0) {
        return {
          sources: [],
          error:
            'No encontramos eventos en ese archivo .ics. Verificá que sea una exportación válida de calendario.',
        };
      }
      return {
        sources: events
          .slice(0, 10)
          .map((event, i) =>
            createContextSource(
              'google-calendar',
              `Calendario — evento ${i + 1}`,
              event,
              { selected: false },
            ),
          ),
        error: null,
      };
    }

    const parsed = JSON.parse(trimmed) as unknown;
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const sources = items
      .slice(0, 10)
      .map((item, i) => {
        const content =
          typeof item === 'string'
            ? item
            : typeof item === 'object' && item !== null
              ? JSON.stringify(item)
              : String(item);
        return createContextSource(
          'google-calendar',
          `Calendario — entrada ${i + 1}`,
          content,
          {
            selected: false,
          },
        );
      })
      .filter((s) => s.content.trim().length > 0);

    if (sources.length === 0) {
      return {
        sources: [],
        error: 'El archivo JSON no tenía entradas de calendario reconocibles.',
      };
    }
    return { sources, error: null };
  } catch {
    return {
      sources: [],
      error:
        'No pudimos interpretar ese archivo como calendario (.ics o JSON válido). Podés reintentar con otro archivo.',
    };
  }
}

/**
 * Interpreta una exportación de redes sociales (Instagram, Facebook, X,
 * LinkedIn, TikTok) en JSON, o texto plano como respaldo. Sólo procesa el
 * archivo local elegido por la persona.
 */
export function parseSocialExport(
  type: 'instagram' | 'facebook' | 'x' | 'linkedin' | 'tiktok',
  text: string,
  filename: string,
): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { sources: [], error: null };
  }

  const label = CONTEXT_SOURCE_LABELS[type];
  try {
    if (
      filename.toLowerCase().endsWith('.json') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('[')
    ) {
      const parsed = JSON.parse(trimmed) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const sources = items
        .slice(0, 10)
        .map((item, i) => {
          const content =
            typeof item === 'string'
              ? item
              : typeof item === 'object' && item !== null
                ? JSON.stringify(item)
                : String(item);
          return createContextSource(type, `${label} — entrada ${i + 1}`, content, {
            selected: false,
          });
        })
        .filter((s) => s.content.trim().length > 0);

      if (sources.length === 0) {
        return {
          sources: [],
          error: `El archivo JSON de ${label.toLowerCase()} no tenía entradas reconocibles.`,
        };
      }
      return { sources, error: null };
    }

    return {
      sources: [
        createContextSource(type, `${label} — ${filename}`, trimmed, {
          selected: false,
        }),
      ],
      error: null,
    };
  } catch {
    return {
      sources: [],
      error: `No pudimos interpretar ese archivo de ${label.toLowerCase()} como JSON válido. Podés reintentar con otro archivo.`,
    };
  }
}

/**
 * Dispatcher único usado por la interfaz para interpretar cualquier fuente
 * accionable. Nunca lanza: devuelve un error humano y permite reintentar sin
 * romper el flujo.
 */
export function parseSourceByType(
  type: ContextSourceType,
  text: string,
  filename: string,
): ParseResult {
  switch (type) {
    case 'google-profile':
      return parseGoogleProfileExport(text, filename);
    case 'google-calendar':
      return parseGoogleCalendarExport(text, filename);
    case 'instagram':
    case 'facebook':
    case 'x':
    case 'linkedin':
    case 'tiktok':
      return parseSocialExport(type, text, filename);
    default:
      return { sources: parseImportedContent(text, filename), error: null };
  }
}

export function getSelectedContextSources(sources: ContextSource[]): ContextSource[] {
  return sources.filter((s) => s.selected && s.content.trim().length > 0);
}

export function getSelectedContextText(sources: ContextSource[]): string {
  return getSelectedContextSources(sources)
    .map((s) => `[${CONTEXT_SOURCE_LABELS[s.type]}: ${s.label}] ${s.content}`)
    .join('\n');
}
