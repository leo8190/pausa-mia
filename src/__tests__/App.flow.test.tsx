import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

function acceptSessionConsent() {
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: /permito usar mis respuestas de esta sesión únicamente/i,
    }),
  );
}

function fillMinimalCheckIn() {
  fireEvent.click(screen.getByLabelText(/ahora, en este momento/i));
  fireEvent.click(screen.getByLabelText(/^acelerado$/i));
  fireEvent.click(screen.getByLabelText(/calmar el ritmo/i));
  fireEvent.click(screen.getByLabelText(/experiencia básica/i));
  fireEvent.click(screen.getByLabelText(/respiración natural/i));
}

async function renderApp() {
  render(<App />);
  await waitFor(() => {
    expect(globalThis.fetch).toHaveBeenCalled();
  });
}

describe('App flow', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ aiEnabled: false }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('renders welcome screen and navigates to consent', async () => {
    await renderApp();
    expect(
      screen.getByRole('heading', { level: 2, name: /meditación a medida/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    expect(screen.getByText(/consentimiento de sesión/i)).toBeInTheDocument();
  });

  it('requires session processing consent before continuing', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    const continueBtn = screen.getByRole('button', { name: /continuar al check-in/i });
    expect(continueBtn).toBeDisabled();
    acceptSessionConsent();
    expect(continueBtn).not.toBeDisabled();
  });

  it('navigates through check-in to context step', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    acceptSessionConsent();
    fireEvent.click(screen.getByRole('button', { name: /continuar al check-in/i }));

    fillMinimalCheckIn();

    const contextBtn = screen.getByRole('button', {
      name: /personalizar contexto y resumen/i,
    });
    expect(contextBtn).not.toBeDisabled();
    fireEvent.click(contextBtn);
    expect(screen.getByText(/contexto adicional/i)).toBeInTheDocument();
  });

  it('short first-visit path skips context, summary and review to reach playback', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    acceptSessionConsent();
    fireEvent.click(screen.getByRole('button', { name: /continuar al check-in/i }));

    fillMinimalCheckIn();

    fireEvent.click(screen.getByRole('button', { name: /empezar ahora/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: /^reproducción$/i }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/contexto adicional/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/resumen editable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/consentimiento para ia/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/revisión del guion/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /guion en reproducción/i }),
    ).toBeInTheDocument();
  });

  it('shows safety step on danger text via empezar ahora', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    acceptSessionConsent();
    fireEvent.click(screen.getByRole('button', { name: /continuar al check-in/i }));

    fireEvent.click(screen.getByLabelText(/ahora, en este momento/i));
    fireEvent.click(screen.getByLabelText(/^sensible$/i));
    fireEvent.click(screen.getByLabelText(/descansar/i));
    fireEvent.click(screen.getByLabelText(/primera vez/i));
    fireEvent.click(screen.getByLabelText(/respiración natural/i));

    const textarea = screen.getByLabelText(/situación reciente/i);
    fireEvent.change(textarea, { target: { value: 'quiero suicidarme' } });

    fireEvent.click(screen.getByRole('button', { name: /empezar ahora/i }));

    await waitFor(() => {
      expect(screen.getByText(/pausa de seguridad/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/revisión del guion/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: /^reproducción$/i }),
    ).not.toBeInTheDocument();
  });

  it('shows safety step on danger text in check-in', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    acceptSessionConsent();
    fireEvent.click(screen.getByRole('button', { name: /continuar al check-in/i }));

    fireEvent.click(screen.getByLabelText(/ahora, en este momento/i));
    fireEvent.click(screen.getByLabelText(/^sensible$/i));
    fireEvent.click(screen.getByLabelText(/descansar/i));
    fireEvent.click(screen.getByLabelText(/primera vez/i));
    fireEvent.click(screen.getByLabelText(/respiración natural/i));

    const textarea = screen.getByLabelText(/situación reciente/i);
    fireEvent.change(textarea, { target: { value: 'quiero suicidarme' } });

    fireEvent.click(
      screen.getByRole('button', { name: /personalizar contexto y resumen/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /continuar al resumen/i }));
    fireEvent.click(screen.getByRole('button', { name: /generar guion/i }));

    expect(screen.getByText(/pausa de seguridad/i)).toBeInTheDocument();
    expect(screen.getAllByText(/0800-999-0091/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /fuente oficial/i })).toHaveAttribute(
      'href',
      'https://www.argentina.gob.ar/node/492429',
    );
  });

  it('keeps es-AR visible in check-in when remote endpoint is configured', async () => {
    vi.stubEnv('VITE_ARGENTINE_TTS_ENDPOINT', 'https://tts.example.com');

    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /comenzar/i }));
    acceptSessionConsent();
    fireEvent.click(screen.getByRole('button', { name: /continuar al check-in/i }));

    const argentineOption = screen.getByLabelText(/español argentino/i);
    const neutralOption = screen.getByLabelText(/español neutro/i);

    expect(argentineOption).toBeInTheDocument();
    expect(neutralOption).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(/motores de voz en este dispositivo/i),
      ).toBeInTheDocument();
    });
  });
});
