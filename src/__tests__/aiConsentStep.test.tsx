import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AiConsentStep } from '../components/AiConsentStep';
import {
  buildAiTransmissionData,
  payloadToPreviewEntries,
} from '../lib/aiTransmissionPayload';
import { createEmptyCheckIn, createEmptyConsent } from '../lib/session';
import type { SessionApi } from '../hooks/useSession';

describe('AI consent in plain language', () => {
  it('keeps every shared value visible and requires permission without showing technical JSON', () => {
    const checkIn = {
      ...createEmptyCheckIn(),
      name: 'Prueba',
      recentSituation: 'Un día con mucho trabajo',
    };
    const summaryExcluded = new Set<string>();
    const consent = createEmptyConsent();
    const sessionApi = {
      session: { checkIn, summaryExcluded, contextSources: [], consent },
      setStep: vi.fn(),
      updateConsent: vi.fn(),
      confirmAiGenerate: vi.fn(),
      deleteSession: vi.fn(),
    } as unknown as SessionApi;
    const { container, rerender } = render(<AiConsentStep sessionApi={sessionApi} />);
    for (const entry of payloadToPreviewEntries(
      buildAiTransmissionData(checkIn, summaryExcluded, []),
    )) {
      expect(screen.getByText(entry.value)).toBeVisible();
    }
    expect(container.textContent).not.toMatch(
      /JSON|API|configuración operativa|motor local|servidor local|cuerpo transmitido/i,
    );
    expect(container.querySelector('pre')).toBeNull();
    const button = screen.getByRole('button', { name: /crear mi meditación con ia/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(sessionApi.confirmAiGenerate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('checkbox', { name: /autorizo enviar sólo los datos/i }),
    );
    expect(sessionApi.updateConsent).toHaveBeenCalledWith({ aiTransmission: true });
    consent.aiTransmission = true;
    rerender(<AiConsentStep sessionApi={sessionApi} />);
    fireEvent.click(button);
    expect(sessionApi.confirmAiGenerate).toHaveBeenCalledTimes(1);
  });
});
