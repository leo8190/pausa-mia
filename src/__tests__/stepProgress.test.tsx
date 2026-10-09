import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StepProgress } from '../components/StepProgress';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  DEFAULT_DOCUMENT_TITLE,
  FLOW_STEP_TOTAL,
  getFlowStepInfo,
} from '../lib/stepProgress';
import type { AppStep } from '../types';

function TitleProbe({ step }: { step: AppStep }) {
  useDocumentTitle(step);
  return null;
}

describe('stepProgress mapping', () => {
  it('maps the guided flow to Spanish labels and 8 main steps', () => {
    expect(getFlowStepInfo('welcome').hideProgress).toBe(true);
    expect(getFlowStepInfo('deleted').hideProgress).toBe(true);

    expect(getFlowStepInfo('consent')).toMatchObject({
      index: 2,
      label: 'Permiso',
    });
    expect(getFlowStepInfo('checkin')).toMatchObject({
      index: 3,
      label: 'Tu pausa',
    });
    expect(getFlowStepInfo('context')).toMatchObject({
      index: 4,
      label: 'Contexto',
    });
    expect(getFlowStepInfo('summary')).toMatchObject({
      index: 5,
      label: 'Resumen',
    });
    expect(getFlowStepInfo('review')).toMatchObject({
      index: 6,
      label: 'Revisar',
    });
    expect(getFlowStepInfo('playback')).toMatchObject({
      index: 7,
      label: 'Escuchar',
    });
    expect(getFlowStepInfo('feedback')).toMatchObject({
      index: 8,
      label: 'Cierre',
    });
    expect(FLOW_STEP_TOTAL).toBe(8);
  });
});

describe('StepProgress UI', () => {
  afterEach(() => cleanup());

  it('hides on welcome and deleted', () => {
    const { rerender } = render(<StepProgress step="welcome" />);
    expect(screen.queryByRole('navigation', { name: /progreso de la pausa/i })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();

    rerender(<StepProgress step="deleted" />);
    expect(screen.queryByRole('navigation', { name: /progreso de la pausa/i })).toBeNull();
  });

  it('shows accessible progress for mid-flow steps', () => {
    render(<StepProgress step="checkin" />);
    const nav = screen.getByRole('navigation', { name: /progreso de la pausa/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
    expect(screen.getByText(/tu pausa/i)).toBeInTheDocument();
    expect(screen.getByText(/paso 3 de 8/i)).toBeInTheDocument();
    expect(screen.getByText(/tu pausa/i).closest('[aria-current="step"]')).toBeTruthy();
  });
});

describe('useDocumentTitle', () => {
  afterEach(() => {
    cleanup();
    document.title = DEFAULT_DOCUMENT_TITLE;
  });

  it('sets step titles and restores the default on unmount', () => {
    const { unmount, rerender } = render(<TitleProbe step="welcome" />);
    expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE);

    rerender(<TitleProbe step="checkin" />);
    expect(document.title).toBe('Tu pausa · Pausa Mía');

    rerender(<TitleProbe step="playback" />);
    expect(document.title).toBe('Escuchar · Pausa Mía');

    unmount();
    expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE);
  });
});
