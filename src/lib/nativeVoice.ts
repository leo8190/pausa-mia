// Web build: the Android Media3 bridge lives in the Android base. Here the
// contract is kept so shared hooks compile, and every call reports "not native".
export interface NativeVoiceEvent {
  requestId: string;
  status: 'preparing' | 'playing' | 'paused' | 'stopped' | 'error';
  currentSegmentIndex: number;
  completed?: boolean;
  error?: string;
}

interface NativeVoicePlugin {
  playAudio(options: {
    requestId: string;
    voiceId: 'db2a543de8bd431899957059671861b4';
    deliverySpeed: 0.85;
    segments: {
      audioBase64: string;
      contentType: 'audio/wav' | 'audio/mpeg';
      pauseAfterMs: number;
    }[];
  }): Promise<void>;
  getState(): Promise<NativeVoiceEvent>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: 'state',
    listener: (state: NativeVoiceEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const unavailable = () => Promise.reject(new Error('native_voice_unavailable'));

export const NativeVoice: NativeVoicePlugin = {
  playAudio: unavailable,
  getState: unavailable,
  pause: unavailable,
  resume: unavailable,
  stop: unavailable,
  addListener: unavailable,
};

export function isNativeAndroidVoice() {
  return false;
}
