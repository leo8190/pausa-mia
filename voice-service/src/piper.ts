import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { VoiceServiceConfig } from './config.js';
import { buildSilentWav, wrapPcm16MonoToWav } from './wav.js';

export class TtsError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'TtsError';
    this.code = code;
  }
}

async function assertReadable(path: string, label: string): Promise<void> {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new TtsError(
      `No se encuentra o no se puede leer ${label}: ${path}`,
      'model_missing',
    );
  }
}

async function readPiperSampleRate(configPath: string): Promise<number> {
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { audio?: { sample_rate?: unknown } };
    const rate = parsed.audio?.sample_rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new Error('sample_rate ausente');
    }
    return rate;
  } catch {
    throw new TtsError(
      `No se pudo leer sample_rate de la config Piper: ${configPath}`,
      'invalid_config',
    );
  }
}

/** Flags del CLI piper (piper-tts 1.6.0 acepta --output_raw y --output-raw). */
export function buildPiperCliArgs(
  config: Pick<VoiceServiceConfig, 'modelPath' | 'configPath' | 'lengthScale'>,
): string[] {
  return [
    '--model',
    config.modelPath,
    '--config',
    config.configPath,
    '--length_scale',
    String(config.lengthScale),
    '--output_raw',
  ];
}

/**
 * Sintetiza texto a WAV. Con backend `mock` no usa Piper ni red.
 * Con `piper`, invoca el binario oficial con el modelo es_AR-daniela-high.
 */
export async function synthesizeWav(
  text: string,
  config: VoiceServiceConfig,
): Promise<Buffer> {
  if (config.backend === 'mock') {
    const durationMs = Math.min(800, 120 + text.length * 4);
    return buildSilentWav({ durationMs });
  }

  await assertReadable(config.modelPath, 'el modelo Piper');
  await assertReadable(config.configPath, 'la config Piper');
  const sampleRate = await readPiperSampleRate(config.configPath);

  const pcm = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(config.piperBin, buildPiperCliArgs(config), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => outChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk));
    child.stdin.on('error', () => undefined);

    child.on('error', (err) => {
      reject(
        new TtsError(
          `No se pudo ejecutar Piper (${config.piperBin}): ${err.message}`,
          'piper_spawn_failed',
        ),
      );
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8').slice(0, 500);
        reject(
          new TtsError(
            `Piper terminó con código ${code}${stderr ? `: ${stderr}` : ''}`,
            'piper_failed',
          ),
        );
        return;
      }
      resolve(Buffer.concat(outChunks));
    });

    const payload = text.endsWith('\n') ? text : `${text}\n`;
    child.stdin.write(payload);
    child.stdin.end();
  });

  if (pcm.length < 2) {
    throw new TtsError('Piper no produjo audio.', 'empty_audio');
  }
  return wrapPcm16MonoToWav(pcm, sampleRate);
}
