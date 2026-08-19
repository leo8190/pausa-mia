// Detección local (sin red) de capacidades del navegador relevantes para la
// voz argentina de Pausa Mía. No prueba el servidor remoto: sólo indica si el
// endpoint está configurado. Nunca incluye guion, diario ni perfil.

import {
  checkRemoteWavPlaybackSupport,
  checkWebSpeechEngineSupport,
} from './voiceEngine';
import { isRemoteArgentineTtsConfigured } from './remoteVoiceService';

export type CompatibilityVerdict =
  'compatible' | 'no-compatible' | 'configured-opt-in' | 'unverified';

export type DeviceCapabilityId =
  | 'html-audio-wav'
  | 'webassembly'
  | 'cache-storage'
  | 'text-decoder'
  | 'web-speech'
  | 'remote-endpoint';

export interface DeviceCapabilityCheck {
  id: DeviceCapabilityId;
  label: string;
  verdict: CompatibilityVerdict;
  detail: string;
  /** Valor booleano de la API o de la configuración; nunca un secreto. */
  present: boolean;
}

export interface DeviceCompatibilityReport {
  checkedAt: string;
  checks: DeviceCapabilityCheck[];
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function checkHtmlAudioWavSupport(): boolean {
  return checkRemoteWavPlaybackSupport();
}

export function checkWebAssemblySupport(): boolean {
  return typeof WebAssembly !== 'undefined';
}

export function checkCacheStorageSupport(): boolean {
  return hasWindow() && 'caches' in window;
}

export function checkTextDecoderSupport(): boolean {
  return typeof TextDecoder !== 'undefined';
}

export function checkWebSpeechSupport(): boolean {
  return checkWebSpeechEngineSupport();
}

export function checkRemoteEndpointConfigured(): boolean {
  return isRemoteArgentineTtsConfigured();
}

function apiCheck(
  id: DeviceCapabilityId,
  label: string,
  present: boolean,
  okDetail: string,
  failDetail: string,
): DeviceCapabilityCheck {
  return {
    id,
    label,
    present,
    verdict: present ? 'compatible' : 'no-compatible',
    detail: present ? okDetail : failDetail,
  };
}

/**
 * Arma el informe de capacidades con probes locales. No hace fetch ni HEAD
 * al endpoint remoto.
 */
export function detectDeviceCompatibility(
  now: Date = new Date(),
): DeviceCompatibilityReport {
  const remoteConfigured = checkRemoteEndpointConfigured();

  const checks: DeviceCapabilityCheck[] = [
    apiCheck(
      'html-audio-wav',
      'HTMLAudioElement (WAV)',
      checkHtmlAudioWavSupport(),
      'El navegador puede crear un elemento de audio y reporta soporte o incertidumbre para audio/wav (sin red).',
      'No se detectó HTMLAudioElement/Audio usable para reproducir WAV.',
    ),
    apiCheck(
      'webassembly',
      'WebAssembly',
      checkWebAssemblySupport(),
      'WebAssembly está disponible (necesario para Piper local / ONNX).',
      'WebAssembly no está disponible en este entorno.',
    ),
    apiCheck(
      'cache-storage',
      'Cache Storage',
      checkCacheStorageSupport(),
      'Cache Storage está disponible para guardar el modelo localmente.',
      'Cache Storage no está disponible; el modelo neuronal no se podría cachear.',
    ),
    apiCheck(
      'text-decoder',
      'TextDecoder',
      checkTextDecoderSupport(),
      'TextDecoder está disponible (lectura de la config del modelo).',
      'TextDecoder no está disponible.',
    ),
    apiCheck(
      'web-speech',
      'Web Speech API',
      checkWebSpeechSupport(),
      'speechSynthesis y SpeechSynthesisUtterance están disponibles.',
      'Este navegador no implementa la Web Speech API.',
    ),
    {
      id: 'remote-endpoint',
      label: 'Endpoint remoto de voz argentina',
      present: remoteConfigured,
      verdict: remoteConfigured ? 'configured-opt-in' : 'unverified',
      detail: remoteConfigured
        ? 'Endpoint configurado (opt-in). No se afirma que el servidor funcione: hace falta consentimiento y una síntesis real en Reproducción. No se hizo ningún request automático.'
        : 'Sin endpoint configurado en este build. No se verificó ningún servidor remoto.',
    },
  ];

  return {
    checkedAt: now.toISOString(),
    checks,
  };
}

export function verdictLabel(verdict: CompatibilityVerdict): string {
  switch (verdict) {
    case 'compatible':
      return 'Compatible';
    case 'no-compatible':
      return 'No compatible';
    case 'configured-opt-in':
      return 'Configurado / opt-in';
    case 'unverified':
      return 'Sin verificar';
  }
}

export function verdictClassName(verdict: CompatibilityVerdict): string {
  switch (verdict) {
    case 'compatible':
      return 'is-compatible';
    case 'no-compatible':
      return 'is-no-compatible';
    case 'configured-opt-in':
      return 'is-configured-opt-in';
    case 'unverified':
      return 'is-unverified';
  }
}

/**
 * Texto plano para portapapeles: sólo capacidades técnicas no sensibles.
 * No incluye guion, diario, perfil, URL del endpoint ni datos de usuario.
 */
export function serializeDeviceCompatibilityDiagnostic(
  report: DeviceCompatibilityReport,
): string {
  const lines = [
    'Pausa Mía — diagnóstico de compatibilidad (sin datos personales)',
    `fecha: ${report.checkedAt}`,
  ];

  for (const check of report.checks) {
    lines.push(`${check.id}: ${check.present ? 'si' : 'no'} (${check.verdict})`);
  }

  lines.push(
    'nota: el endpoint remoto configurado no implica que el servidor funcione; hace falta síntesis real tras consentimiento.',
  );

  return `${lines.join('\n')}\n`;
}

export type ClipboardWriteResult =
  { ok: true } | { ok: false; reason: 'unavailable' | 'failed' };

/**
 * Copia el diagnóstico. No usa APIs de red. Si clipboard no está disponible,
 * el llamador debe mostrar un mensaje accesible.
 */
export async function copyDeviceCompatibilityDiagnostic(
  report: DeviceCompatibilityReport,
): Promise<ClipboardWriteResult> {
  const text = serializeDeviceCompatibilityDiagnostic(report);
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.writeText !== 'function'
  ) {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
