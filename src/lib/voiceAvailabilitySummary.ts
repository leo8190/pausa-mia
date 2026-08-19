import type { VoiceEngineStatus } from './voiceEngine';

/**
 * Resumen humano de disponibilidad de voz. Sin nombres de APIs, tamaños de
 * modelo ni estados de verificación técnica.
 */
export function summarizeVoiceAvailability(statuses: VoiceEngineStatus[]): string {
  const neural = statuses.find((status) => status.id === 'neural-piper-es-ar');
  const webSpeech = statuses.find((status) => status.id === 'web-speech');
  const remote = statuses.find((status) => status.id === 'remote-wav-es-ar');

  if (neural?.available) {
    return 'La voz argentina de meditación está lista en este dispositivo.';
  }

  if (neural?.supported && webSpeech?.available) {
    return 'Hay una voz del dispositivo lista. La voz argentina se puede preparar cuando reproduzcas.';
  }

  if (neural?.supported) {
    return 'La voz argentina se puede preparar cuando reproduzcas, si tu navegador la admite.';
  }

  if (webSpeech?.available && remote?.configured) {
    return 'Hay una voz del dispositivo lista. La voz argentina local no está disponible en este navegador.';
  }

  if (webSpeech?.available) {
    return 'Hay una voz del dispositivo lista. Podés usarla para escuchar la pausa.';
  }

  return 'No hay una voz lista en este dispositivo. Podés leer el guion en pantalla.';
}
