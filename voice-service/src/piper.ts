import { spawn } from 'node:child_process';
import { access, readFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { VoiceServiceConfig } from './config.js';
import { buildSilentWav } from './wav.js';

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

  const id = randomBytes(8).toString('hex');
  const outPath = join(tmpdir(), `arg-tts-${id}.wav`);

  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        '--model',
        config.modelPath,
        '--config',
        config.configPath,
        '--output_file',
        outPath,
      ];
      const child = spawn(config.piperBin, args, {
        stdio: ['pipe', 'ignore', 'pipe'],
      });

      const errChunks: Buffer[] = [];
      child.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk));

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
        resolve();
      });

      child.stdin.write(text);
      child.stdin.end();
    });

    const wav = await readFile(outPath);
    if (wav.length < 44) {
      throw new TtsError('Piper no produjo un WAV válido.', 'empty_audio');
    }
    return wav;
  } finally {
    await unlink(outPath).catch(() => undefined);
  }
}
