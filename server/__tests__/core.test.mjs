import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ORIGINS,
  MAX_BODY_BYTES,
  buildPrompt,
  buildSystemPrompt,
  createAiServerHandler,
  estimateMinutes,
  getCorsAllowOrigin,
  isHealthPath,
  isOriginAllowed,
  parseAllowedOrigins,
  resolveAppVersion,
  usesOpenAiStructuredOutputs,
  validatePayload,
  validateRequestBody,
  validateScriptOutput,
} from '../../server/core.mjs';

const validPayload = {
  operational: { duration: 5, voiceVariant: 'es-neutro' },
  personal: [
    { label: 'Momento del día', value: 'Ahora, en este momento' },
    { label: 'Estado percibido', value: 'Acelerado' },
  ],
  context: [
    {
      label: 'Diario',
      value: 'Texto breve de contexto personal con varias palabras seguidas aquí',
    },
  ],
};

function makeValidScript() {
  const paragraph =
    'Respira suavemente y nota el aire entrando y saliendo sin forzar nada. Podés mantener los ojos abiertos o detenerte si lo necesitás.';
  const segments = [
    { text: paragraph.repeat(8), pauseAfterMs: 10000 },
    { text: paragraph.repeat(8), pauseAfterMs: 10000 },
    { text: paragraph.repeat(8), pauseAfterMs: 10000 },
  ];
  const fullText = segments.map((s) => s.text).join('\n\n');
  return {
    title: 'Pausa de 5 minutos',
    intentionLabel: 'Descansar',
    segments,
    fullText,
    usedDetails: ['moment', 'perceivedState'],
  };
}

describe('server/core validators', () => {
  it('rechaza claves extra en raíz, payload, operational, personal y context', () => {
    expect(validateRequestBody({ payload: validPayload, extra: true })).toContain(
      'ROOT_EXTRA_KEYS',
    );
    expect(
      validatePayload({ ...validPayload, consents: { sessionProcessing: true } }),
    ).toContain('PAYLOAD_EXTRA_KEYS');
    expect(
      validatePayload({
        ...validPayload,
        operational: { ...validPayload.operational, extra: 1 },
      }),
    ).toContain('OPERATIONAL_EXTRA_KEYS');
    expect(
      validatePayload({
        ...validPayload,
        personal: [{ label: 'Momento', value: 'Ahora', field: 'moment' }],
      }),
    ).toContain('PERSONAL_ITEM_EXTRA_KEYS');
    expect(
      validatePayload({
        ...validPayload,
        context: [{ label: 'Diario', value: 'Texto', id: 'x' }],
      }),
    ).toContain('CONTEXT_ITEM_EXTRA_KEYS');
  });

  it('rechaza duplicados, exceso de campos y valores inválidos en personal', () => {
    const tooMany = Array.from({ length: 8 }, (_, i) => ({
      label: `Campo ${i}`,
      value: 'valor',
    }));
    expect(validatePayload({ ...validPayload, personal: tooMany })).toContain(
      'PERSONAL_TOO_MANY',
    );

    expect(
      validatePayload({
        ...validPayload,
        personal: [
          { label: 'Momento del día', value: 'Ahora' },
          { label: 'Momento del día', value: 'Otra' },
        ],
      }),
    ).toContain('PERSONAL_LABEL_DUPLICATE');

    expect(
      validatePayload({
        ...validPayload,
        personal: [{ label: '', value: 'sin label' }],
      }),
    ).toContain('PERSONAL_LABEL_INVALID');

    expect(
      validatePayload({
        ...validPayload,
        personal: [{ label: 'Momento', value: 'x'.repeat(201) }],
      }),
    ).toContain('PERSONAL_VALUE_INVALID');
  });

  it('valida enums operacionales y cantidad de contexto', () => {
    expect(
      validatePayload({
        ...validPayload,
        operational: { duration: 7, voiceVariant: 'es-neutro' },
      }),
    ).toContain('OPERATIONAL_DURATION_INVALID');

    expect(
      validatePayload({
        ...validPayload,
        operational: { duration: 5, voiceVariant: 'es-MX' },
      }),
    ).toContain('OPERATIONAL_VOICE_INVALID');

    const manyContext = Array.from({ length: 11 }, (_, i) => ({
      label: `Fuente ${i}`,
      value: 'texto',
    }));
    expect(validatePayload({ ...validPayload, context: manyContext })).toContain(
      'CONTEXT_TOO_MANY',
    );
  });

  it('valida salida: claves extra, pausas enteras, fullText y duración', () => {
    const script = makeValidScript();
    expect(validateScriptOutput(script, 5, validPayload)).toEqual([]);

    expect(validateScriptOutput({ ...script, extra: true }, 5)).toContain(
      'SCRIPT_EXTRA_KEYS',
    );

    const badPause = {
      ...script,
      segments: script.segments.map((s, i) =>
        i === 0 ? { ...s, pauseAfterMs: 2999 } : s,
      ),
    };
    expect(validateScriptOutput(badPause, 5)).toContain('SCRIPT_SEGMENT_PAUSE_INVALID');

    const floatPause = {
      ...script,
      segments: script.segments.map((s, i) =>
        i === 0 ? { ...s, pauseAfterMs: 4000.5 } : s,
      ),
    };
    expect(validateScriptOutput(floatPause, 5)).toContain(
      'SCRIPT_SEGMENT_PAUSE_INVALID',
    );

    const inconsistent = {
      ...script,
      fullText: 'texto distinto',
    };
    expect(validateScriptOutput(inconsistent, 5)).toContain(
      'SCRIPT_FULLTEXT_INCONSISTENT',
    );

    const shortDuration = {
      ...script,
      segments: [
        { text: 'Breve.', pauseAfterMs: 3000 },
        { text: 'Breve dos.', pauseAfterMs: 3000 },
        { text: 'Breve tres.', pauseAfterMs: 3000 },
      ],
      fullText: 'Breve.\n\nBreve dos.\n\nBreve tres.',
    };
    expect(validateScriptOutput(shortDuration, 10)).toContain(
      'SCRIPT_DURATION_OUT_OF_TOLERANCE',
    );

    const badDetail = {
      ...script,
      usedDetails: ['moment', ''],
    };
    expect(validateScriptOutput(badDetail, 5, validPayload)).toContain(
      'SCRIPT_USED_DETAIL_INVALID',
    );

    const badAllowlist = {
      ...script,
      usedDetails: ['moment', 'texto libre no permitido'],
    };
    expect(validateScriptOutput(badAllowlist, 5, validPayload)).toContain(
      'SCRIPT_USED_DETAIL_NOT_ALLOWED',
    );

    const missingAutonomy = {
      ...script,
      segments: script.segments.map(() => ({
        text: 'Respira suavemente sin forzar nada en este momento presente repetido muchas veces.',
        pauseAfterMs: 10000,
      })),
      fullText: script.segments
        .map(
          () =>
            'Respira suavemente sin forzar nada en este momento presente repetido muchas veces.',
        )
        .join('\n\n'),
    };
    expect(validateScriptOutput(missingAutonomy, 5, validPayload)).toContain(
      'SCRIPT_AUTONOMY_MISSING',
    );

    const copied = {
      ...script,
      fullText: `${script.fullText}\n\nTexto breve de contexto personal con varias palabras seguidas aquí.`,
    };
    expect(validateScriptOutput(copied, 5, validPayload)).toContain(
      'SCRIPT_SENSITIVE_OVERLAP',
    );
  });

  it('buildPrompt prohíbe copiar más de 3 palabras y exige allowlist', () => {
    const prompt = buildPrompt(validPayload);
    expect(prompt).toMatch(/más de 3 palabras consecutivas/i);
    expect(prompt).toMatch(/usedDetails debe ser un arreglo/i);
    expect(prompt).toMatch(/moment/);
  });

  it('detecta OpenAI oficial por hostname parseado', () => {
    expect(usesOpenAiStructuredOutputs('https://api.openai.com/v1')).toBe(true);
    expect(usesOpenAiStructuredOutputs('https://evil-openai.com.fake/v1')).toBe(false);
    expect(usesOpenAiStructuredOutputs('https://notopenai.com/v1')).toBe(false);
  });

  it('system prompt declara contexto como dato no confiable', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/no confiable/i);
    expect(prompt).toMatch(/ignora/i);
  });

  it('buildPrompt delimita contexto del usuario', () => {
    const prompt = buildPrompt(validPayload);
    expect(prompt).toMatch(/INICIO CONTEXTO DEL USUARIO/);
    expect(prompt).toMatch(/FIN CONTEXTO DEL USUARIO/);
    expect(prompt).toMatch(/dato no confiable/i);
  });
});

describe('server integration', () => {
  it('acepta health sin Origin e incluye version; rechaza orígenes no permitidos', async () => {
    const { createServer } = await import('node:http');
    const handler = createAiServerHandler({
      apiKey: 'test-key',
      version: '0.1.0-test',
    });
    const server = createServer(handler);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const healthNoOrigin = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(healthNoOrigin.status).toBe(200);
    const healthNoOriginBody = await healthNoOrigin.json();
    expect(healthNoOriginBody).toEqual({
      status: 'ok',
      aiEnabled: true,
      version: '0.1.0-test',
    });

    const healthWithQuery = await fetch(`http://127.0.0.1:${port}/api/health?probe=1`);
    expect(healthWithQuery.status).toBe(200);

    const healthBad = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Origin: 'http://evil.example' },
    });
    expect(healthBad.status).toBe(403);
    const healthBadBody = await healthBad.json();
    expect(healthBadBody.error).toBe('ORIGIN_NOT_ALLOWED');

    const postBad = await fetch(`http://127.0.0.1:${port}/api/generate-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://evil.example',
      },
      body: serializeBody(validPayload),
    });
    expect(postBad.status).toBe(403);

    for (const origin of ALLOWED_ORIGINS) {
      const healthOk = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { Origin: origin },
      });
      expect(healthOk.status).toBe(200);
      const healthOkBody = await healthOk.json();
      expect(healthOkBody.version).toBe('0.1.0-test');
    }

    server.close();
  });

  it('rechaza cuerpos mayores a 16 KiB', async () => {
    const { createServer } = await import('node:http');
    const handler = createAiServerHandler({ apiKey: 'test-key' });
    const server = createServer(handler);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const origin = 'http://localhost:5173';

    const huge = 'a'.repeat(MAX_BODY_BYTES + 1);
    const res = await fetch(`http://127.0.0.1:${port}/api/generate-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: huge,
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe('BODY_TOO_LARGE');

    server.close();
  });

  it('sanitiza errores del proveedor y cuerpo inválido', async () => {
    const { createServer } = await import('node:http');
    const handler = createAiServerHandler({
      apiKey: 'test-key',
      callProvider: async () => {
        throw new Error('OpenAI API error 401: intimate user diary content');
      },
    });
    const server = createServer(handler);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const origin = 'http://localhost:5173';

    const invalidJson = await fetch(`http://127.0.0.1:${port}/api/generate-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: '{not-json',
    });
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error).toBe('BODY_INVALID');

    const invalidPayload = await fetch(`http://127.0.0.1:${port}/api/generate-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: JSON.stringify({ payload: { extra: true } }),
    });
    expect(invalidPayload.status).toBe(400);
    const invalidBody = await invalidPayload.json();
    expect(invalidBody.error).toBe('INVALID_PAYLOAD');
    expect(JSON.stringify(invalidBody)).not.toMatch(/intimate|diary/i);

    const providerFail = await fetch(`http://127.0.0.1:${port}/api/generate-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: serializeBody(validPayload),
    });
    expect(providerFail.status).toBe(500);
    const failBody = await providerFail.json();
    expect(failBody.error).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(failBody)).not.toContain('intimate');

    server.close();
  });

  it('valida salida del proveedor mockeado', async () => {
    const { createServer } = await import('node:http');
    const badScript = makeValidScript();
    badScript.segments[0].pauseAfterMs = 1000;

    const handler = createAiServerHandler({
      apiKey: 'test-key',
      callProvider: async () => badScript,
    });
    const server = createServer(handler);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const origin = 'http://localhost:5173';

    const res = await fetch(`http://127.0.0.1:${port}/api/generate-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: serializeBody(validPayload),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.issues).toContain('SCRIPT_SEGMENT_PAUSE_INVALID');

    server.close();
  });

  it('acepta payload válido con proveedor mockeado', async () => {
    const { createServer } = await import('node:http');
    const script = makeValidScript();

    const handler = createAiServerHandler({
      apiKey: 'test-key',
      callProvider: async () => script,
    });
    const server = createServer(handler);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const origin = 'http://localhost:5173';

    const res = await fetch(`http://127.0.0.1:${port}/api/generate-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: serializeBody(validPayload),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.script.engine).toBe('ai');
    expect(body.script.estimatedMinutes).toBe(estimateMinutes(script.segments));

    server.close();
  });
});

function serializeBody(payload) {
  return JSON.stringify({ payload });
}

describe('origin helpers', () => {
  it('isOriginAllowed acepta sólo orígenes locales explícitos', () => {
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://evil.example')).toBe(false);
    expect(isOriginAllowed(undefined)).toBe(false);
  });

  it('parseAllowedOrigins usa localhost por defecto y soporta lista separada por comas', () => {
    const fallback = parseAllowedOrigins('');
    expect(fallback).toEqual(new Set(ALLOWED_ORIGINS));

    const custom = parseAllowedOrigins(
      'https://app.example.com, http://localhost:5173 ,https://api.example.com',
    );
    expect(custom).toEqual(
      new Set([
        'https://app.example.com',
        'http://localhost:5173',
        'https://api.example.com',
      ]),
    );
  });

  it('rechaza wildcard para credenciales pero lo permite sin credenciales', () => {
    const wildcard = new Set(['*']);
    expect(getCorsAllowOrigin('https://any.example', wildcard, true)).toBeNull();
    expect(getCorsAllowOrigin('https://any.example', wildcard, false)).toBe('*');
  });

  it('resolveAppVersion usa APP_VERSION o fallback 0.1.0', () => {
    expect(resolveAppVersion({ APP_VERSION: '1.2.3' })).toBe('1.2.3');
    expect(resolveAppVersion({ APP_VERSION: '  ' })).toBe('0.1.0');
    expect(resolveAppVersion({})).toBe('0.1.0');
  });

  it('isHealthPath acepta /api/health con o sin query', () => {
    expect(isHealthPath('/api/health')).toBe(true);
    expect(isHealthPath('/api/health?probe=1')).toBe(true);
    expect(isHealthPath('/api/generate-script')).toBe(false);
    expect(isHealthPath(undefined)).toBe(false);
  });
});
