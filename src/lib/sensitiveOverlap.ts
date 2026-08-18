import type { CheckInData } from '../types';
import type { ContextSource } from './contextSources';
import { getSelectedContextSources } from './contextSources';

const MIN_OVERLAP_WORDS = 5;
const MIN_FRAGMENT_CHARS = 31;

/** Frases genéricas demasiado cortas o comunes para evitar falsos positivos. */
const GENERIC_PHRASES = new Set([
  'en este momento del dia',
  'en este momento de tu jornada',
  'no hace falta cambiar nada',
  'sin forzar ningun ritmo',
  'a tu propio ritmo',
  'sin apuro',
]);

function normalizeForOverlap(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeForOverlap(text).split(' ').filter(Boolean);
}

function isGenericSequence(sequence: string): boolean {
  return GENERIC_PHRASES.has(sequence);
}

export function extractWordSequences(
  text: string,
  minWords = MIN_OVERLAP_WORDS,
): string[] {
  const words = tokenize(text);
  if (words.length < minWords) return [];

  const sequences: string[] = [];
  for (let i = 0; i <= words.length - minWords; i++) {
    const sequence = words.slice(i, i + minWords).join(' ');
    if (!isGenericSequence(sequence)) {
      sequences.push(sequence);
    }
  }
  return sequences;
}

export function extractDistinctiveFragments(
  text: string,
  minChars = MIN_FRAGMENT_CHARS,
): string[] {
  const words = tokenize(text);
  if (words.length === 0) return [];

  const fragments: string[] = [];
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

export function collectSensitiveSourceTexts(
  checkIn: CheckInData,
  excluded: Set<string>,
  contextSources: ContextSource[] = [],
): string[] {
  const sources: string[] = [];

  if (!excluded.has('name') && checkIn.name.trim()) {
    sources.push(checkIn.name.trim());
  }
  if (!excluded.has('recentSituation') && checkIn.recentSituation.trim()) {
    sources.push(checkIn.recentSituation.trim());
  }
  if (
    !excluded.has('perceivedState') &&
    checkIn.perceivedState === 'otro' &&
    checkIn.perceivedStateOther.trim()
  ) {
    sources.push(checkIn.perceivedStateOther.trim());
  }
  if (!excluded.has('avoidTopics') && checkIn.avoidTopics.trim()) {
    sources.push(checkIn.avoidTopics.trim());
  }

  for (const source of getSelectedContextSources(contextSources)) {
    sources.push(source.content.trim());
  }

  return sources.filter((text) => text.length > 0);
}

export interface SensitiveOverlapResult {
  hasOverlap: boolean;
  matchedSequence?: string;
  matchedFragment?: string;
}

export function detectSensitiveOverlap(
  outputText: string,
  sourceTexts: string[],
): SensitiveOverlapResult {
  if (!outputText.trim() || sourceTexts.length === 0) {
    return { hasOverlap: false };
  }

  const normalizedOutput = normalizeForOverlap(outputText);
  const sequences = new Set<string>();
  const fragments = new Set<string>();

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

export function detectSensitiveOverlapInScript(
  scriptText: string,
  usedDetails: string[],
  sourceTexts: string[],
): SensitiveOverlapResult {
  const combined = `${scriptText}\n${usedDetails.join('\n')}`;
  return detectSensitiveOverlap(combined, sourceTexts);
}
