import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DeviceCompatibilityPanel } from '../components/DeviceCompatibilityPanel';
import {
  copyDeviceCompatibilityDiagnostic,
  detectDeviceCompatibility,
  serializeDeviceCompatibilityDiagnostic,
  verdictLabel,
  type DeviceCompatibilityReport,
} from '../lib/deviceCompatibility';

function makeReport(
  overrides: Partial<DeviceCompatibilityReport> = {},
): DeviceCompatibilityReport {
  return {
    checkedAt: '2026-08-19T14:00:00.000Z',
    checks: [
      {
        id: 'html-audio-wav',
        label: 'HTMLAudioElement (WAV)',
        present: true,
        verdict: 'compatible',
        detail: 'ok wav',
      },
      {
        id: 'webassembly',
        label: 'WebAssembly',
        present: true,
        verdict: 'compatible',
        detail: 'ok wasm',
      },
      {
        id: 'cache-storage',
        label: 'Cache Storage',
        present: false,
        verdict: 'no-compatible',
        detail: 'sin caches',
      },
      {
        id: 'text-decoder',
        label: 'TextDecoder',
        present: true,
        verdict: 'compatible',
        detail: 'ok decoder',
      },
      {
        id: 'web-speech',
        label: 'Web Speech API',
        present: true,
        verdict: 'compatible',
        detail: 'ok speech',
      },
      {
        id: 'remote-endpoint',
        label: 'Endpoint remoto de voz argentina',
        present: false,
        verdict: 'unverified',
        detail: 'sin endpoint',
      },
    ],
    ...overrides,
  };
}

describe('deviceCompatibility detector', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { open: vi.fn(), match: vi.fn() },
    });
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reports offline API checks without calling fetch', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const report = detectDeviceCompatibility(new Date('2026-08-19T12:00:00.000Z'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.checkedAt).toBe('2026-08-19T12:00:00.000Z');

    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    expect(byId['html-audio-wav']?.verdict).toBe('compatible');
    expect(byId.webassembly?.verdict).toBe('compatible');
    expect(byId['cache-storage']?.verdict).toBe('compatible');
    expect(byId['text-decoder']?.verdict).toBe('compatible');
    expect(byId['web-speech']?.verdict).toBe('compatible');
    expect(byId['remote-endpoint']?.verdict).toBe('unverified');
    expect(byId['remote-endpoint']?.present).toBe(false);
    expect(byId['remote-endpoint']?.detail).not.toMatch(/funciona|disponible/i);
  });

  it('marks remote endpoint as configured/opt-in without claiming the server works', () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const report = detectDeviceCompatibility();
    const remote = report.checks.find((c) => c.id === 'remote-endpoint');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(remote?.present).toBe(true);
    expect(remote?.verdict).toBe('configured-opt-in');
    expect(verdictLabel(remote!.verdict)).toBe('Configurado / opt-in');
    expect(remote?.detail).toMatch(/síntesis real/i);
    expect(remote?.detail).not.toMatch(/servidor (está )?disponible/i);
  });

  it('marks Cache Storage as no-compatible when caches is missing', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'caches');
    // @ts-expect-error intentional deletion for capability probe
    delete window.caches;

    const report = detectDeviceCompatibility();
    const cache = report.checks.find((c) => c.id === 'cache-storage');
    expect(cache?.present).toBe(false);
    expect(cache?.verdict).toBe('no-compatible');

    if (descriptor) {
      Object.defineProperty(window, 'caches', descriptor);
    } else {
      Object.defineProperty(window, 'caches', {
        configurable: true,
        value: { open: vi.fn(), match: vi.fn() },
      });
    }
  });
});

describe('deviceCompatibility serializer', () => {
  it('serializes only technical booleans, date and verdicts — no script or profile', () => {
    const report = makeReport();
    const text = serializeDeviceCompatibilityDiagnostic(report);

    expect(text).toContain('fecha: 2026-08-19T14:00:00.000Z');
    expect(text).toContain('html-audio-wav: si (compatible)');
    expect(text).toContain('cache-storage: no (no-compatible)');
    expect(text).toContain('remote-endpoint: no (unverified)');
    expect(text).toMatch(/síntesis real/i);

    expect(text).not.toMatch(/guion|diario|perfil|Cerrá los ojos|nombre/i);
    expect(text).not.toContain('https://');
    expect(text).not.toContain('tts.example');
  });

  it('copyDeviceCompatibilityDiagnostic writes the serialized text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const report = makeReport();
    const result = await copyDeviceCompatibilityDiagnostic(report);

    expect(result).toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toBe(
      serializeDeviceCompatibilityDiagnostic(report),
    );
  });

  it('copyDeviceCompatibilityDiagnostic reports unavailable when clipboard is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    const result = await copyDeviceCompatibilityDiagnostic(makeReport());
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('DeviceCompatibilityPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Spanish title, verdicts and copy control without claiming remote availability', () => {
    render(<DeviceCompatibilityPanel report={makeReport()} />);

    expect(
      screen.getByRole('heading', { name: /compatibilidad de este dispositivo/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Compatible').length).toBeGreaterThan(0);
    expect(screen.getByText('No compatible')).toBeInTheDocument();
    expect(screen.getByText('Sin verificar')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copiar diagnóstico/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/servidor remoto funciona/i)).not.toBeInTheDocument();
  });

  it('copies the diagnostic and announces success via aria-live', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<DeviceCompatibilityPanel report={makeReport()} />);
    fireEvent.click(screen.getByRole('button', { name: /copiar diagnóstico/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/diagnóstico técnico copiado al portapapeles/i),
      ).toBeInTheDocument();
    });
    expect(writeText).toHaveBeenCalledOnce();
  });

  it('shows an accessible message when clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    render(<DeviceCompatibilityPanel report={makeReport()} />);
    fireEvent.click(screen.getByRole('button', { name: /copiar diagnóstico/i }));

    await waitFor(() => {
      expect(screen.getByText(/portapapeles no está disponible/i)).toBeInTheDocument();
    });
  });
});
