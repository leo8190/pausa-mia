/**
 * Lógica de privacidad compartida entre cliente y servidor.
 * Mantener en sincronía con src/lib/safeUsedDetails.ts y src/lib/sensitiveOverlap.ts
 */

export const SAFE_USED_DETAIL_IDS = [
  'moment',
  'perceivedState',
  'recentSituation:present',
  'context:selected',
  'intention',
  'experience',
  'style',
  'name',
];

const ALLOWED_SET = new Set(SAFE_USED_DETAIL_IDS);

const MIN_OVERLAP_WORDS = 5;
const MIN_FRAGMENT_CHARS = 31;

const GENERIC_PHRASES = new Set([
  'en este momento del dia',
  'en este momento de tu jornada',
  'no hace falta cambiar nada',
  'sin forzar ningun ritmo',
  'a tu propio ritmo',
  'sin apuro',
]);

const AUTONOMY_PATTERN =
  /ojos\s+abiertos|ancla\s+de\s+atenci[oó]n|detenerte|detenerse|detener\s+la\s+pr[aá]ctica/i;

function normalizeForOverlap(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalizeForOverlap(text).split(' ').filter(Boolean);
}

function isGenericSequence(sequence) {
  return GENERIC_PHRASES.has(sequence);
}

export function extractWordSequences(text, minWords = MIN_OVERLAP_WORDS) {
  const words = tokenize(text);
  if (words.length < minWords) return [];

  const sequences = [];
  for (let i = 0; i <= words.length - minWords; i++) {
    const sequence = words.slice(i, i + minWords).join(' ');
    if (!isGenericSequence(sequence)) {
      sequences.push(sequence);
    }
  }
  return sequences;
}

export function extractDistinctiveFragments(text, minChars = MIN_FRAGMENT_CHARS) {
  const words = tokenize(text);
  if (words.length === 0) return [];

  const fragments = [];
  for (let start = 0; start < words.length; start++) {
    let chunk = '';
    for (let end = start; end < words.length; end++) {
      chunk = words.slice(start, end + 1).join(' ');
      if (chunk.length >= minChars) {
        if (!isGenericSequence(chunk)) {
          fragments.push(chunk);
        }
        break;
      }
    }
  }
  return fragments;
}

export function validateUsedDetailsAllowlist(usedDetails) {
  const issues = [];
  if (!Array.isArray(usedDetails)) {
    issues.push('SCRIPT_USED_DETAILS_INVALID');
    return issues;
  }
  for (const detail of usedDetails) {
    if (!ALLOWED_SET.has(detail)) {
      issues.push('SCRIPT_USED_DETAIL_NOT_ALLOWED');
      break;
    }
  }
  return issues;
}

export function collectSensitiveSourceTextsFromPayload(payload) {
  const sources = [];
  if (!payload || typeof payload !== 'object') return sources;

  for (const field of payload.personal ?? []) {
    if (field?.value) sources.push(String(field.value));
  }
  for (const fragment of payload.context ?? []) {
    if (fragment?.value) sources.push(String(fragment.value));
  }
  return sources.filter((text) => text.length > 0);
}

export function detectSensitiveOverlap(outputText, sourceTexts) {
  if (!outputText?.trim() || !Array.isArray(sourceTexts) || sourceTexts.length === 0) {
    return { hasOverlap: false };
  }

  const normalizedOutput = normalizeForOverlap(outputText);
  const sequences = new Set();
  const fragments = new Set();

  for (const source of sourceTexts) {
    for (const sequence of extractWordSequences(source)) {
      sequences.add(sequence);
    }
    for (const fragment of extractDistinctiveFragments(source)) {
      fragments.add(fragment);
    }
  }

  for (const sequence of sequences) {
    if (normalizedOutput.includes(sequence)) {
      return { hasOverlap: true, matchedSequence: sequence };
    }
  }

  for (const fragment of fragments) {
    if (fragment.length >= MIN_FRAGMENT_CHARS && normalizedOutput.includes(fragment)) {
      return { hasOverlap: true, matchedFragment: fragment };
    }
  }

  return { hasOverlap: false };
}

export function detectSensitiveOverlapInScript(scriptText, usedDetails, sourceTexts) {
  const combined = `${scriptText}\n${(usedDetails ?? []).join('\n')}`;
  return detectSensitiveOverlap(combined, sourceTexts);
}

export function hasAutonomyOption(text) {
  return AUTONOMY_PATTERN.test(text ?? '');
}

export function buildAllowedUsedDetailsPromptLine() {
  return `usedDetails debe ser un arreglo con SOLO estos identificadores: ${SAFE_USED_DETAIL_IDS.join(', ')}`;
}
