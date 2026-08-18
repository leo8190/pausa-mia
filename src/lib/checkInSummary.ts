import type { CheckInData } from '../types';
import {
  EXPERIENCE_LABELS,
  INTENTION_LABELS,
  MOMENT_LABELS,
  STATE_LABELS,
  STYLE_LABELS,
  VOICE_LABELS,
} from '../types';

export function getCheckInSummaryValue(field: string, checkIn: CheckInData): string {
  switch (field) {
    case 'name':
      return checkIn.name.trim();
    case 'moment':
      return checkIn.moment ? MOMENT_LABELS[checkIn.moment] : '';
    case 'recentSituation':
      return checkIn.recentSituation.trim();
    case 'perceivedState':
      if (!checkIn.perceivedState) return '';
      return checkIn.perceivedState === 'otro'
        ? checkIn.perceivedStateOther.trim() || STATE_LABELS.otro
        : STATE_LABELS[checkIn.perceivedState];
    case 'intention':
      return checkIn.intention ? INTENTION_LABELS[checkIn.intention] : '';
    case 'experience':
      return checkIn.experience ? EXPERIENCE_LABELS[checkIn.experience] : '';
    case 'style':
      return checkIn.style ? STYLE_LABELS[checkIn.style] : '';
    case 'avoidTopics':
      return checkIn.avoidTopics.trim();
    case 'duration':
      return `${checkIn.duration} minutos`;
    case 'voiceVariant':
      return VOICE_LABELS[checkIn.voiceVariant];
    default:
      return '';
  }
}
