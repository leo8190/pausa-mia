import { describe, expect, it } from 'vitest';
import { summarizeVoiceAvailability } from '../lib/voiceAvailabilitySummary';
import type { VoiceEngineStatus } from '../lib/voiceEngine';

function status(
  id: VoiceEngineStatus['id'],
  flags: Partial<VoiceEngineStatus>,
): VoiceEngineStatus {
  return {
    id,
    name: id,
    description: '',
    supported: false,
    configured: false,
    available: false,
    reason: '',
    ...flags,
  };
}

describe('summarizeVoiceAvailability', () => {
  it('says the Argentine meditation voice is ready after a real local synthesis', () => {
    const text = summarizeVoiceAvailability([
      status('web-speech', { supported: true, available: true }),
      status('neural-piper-es-ar', { supported: true, available: true }),
      status('remote-wav-es-ar', { supported: true, configured: false }),
    ]);
    expect(text).toMatch(/voz argentina de meditación está lista/i);
    expect(text).not.toMatch(/webassembly|onnx|endpoint|mb/i);
  });

  it('mentions a device voice and that Argentine can be prepared', () => {
    const text = summarizeVoiceAvailability([
      status('web-speech', { supported: true, available: true }),
      status('neural-piper-es-ar', { supported: true, available: false }),
      status('remote-wav-es-ar', { supported: true, configured: false }),
    ]);
    expect(text).toMatch(/voz del dispositivo lista/i);
    expect(text).toMatch(/voz argentina se puede preparar/i);
  });

  it('mentions both local and remote Argentine options when endpoint is configured', () => {
    const text = summarizeVoiceAvailability([
      status('web-speech', { supported: true, available: true }),
      status('neural-piper-es-ar', { supported: true, available: false }),
      status('remote-wav-es-ar', {
        supported: true,
        configured: true,
        available: false,
      }),
    ]);
    expect(text).toMatch(/voz del dispositivo lista/i);
    expect(text).toMatch(/voz argentina local/i);
    expect(text).toMatch(/remota con consentimiento/i);
    expect(text).not.toMatch(/universal|siempre/i);
  });

  it('falls back to reading on screen when nothing is available', () => {
    const text = summarizeVoiceAvailability([
      status('web-speech', { supported: false, available: false }),
      status('neural-piper-es-ar', { supported: false, available: false }),
      status('remote-wav-es-ar', { supported: false, configured: false }),
    ]);
    expect(text).toMatch(/leer el guion/i);
  });

  it('mentions remote Argentine option honestly when local voices are unavailable', () => {
    const text = summarizeVoiceAvailability([
      status('web-speech', { supported: false, available: false }),
      status('neural-piper-es-ar', { supported: false, available: false }),
      status('remote-wav-es-ar', {
        supported: true,
        configured: true,
        available: false,
      }),
    ]);
    expect(text).toMatch(/voz argentina remota/i);
    expect(text).toMatch(/consentimiento/i);
    expect(text).not.toMatch(/garantiza|universal|siempre/i);
  });
});
