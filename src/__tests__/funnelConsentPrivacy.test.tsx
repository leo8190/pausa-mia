import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProductFunnelConsent } from '../components/ProductFunnelConsent';
import { productFunnel } from '../lib/productFunnel';

afterEach(() => {
  act(() => productFunnel.setConsent(false));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([{ doNotTrack: '1' }, { globalPrivacyControl: true }])(
  'keeps deletion and retries available with opt-out %j',
  (preferences) => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_ACCOUNT_API_URL', 'https://pausa-mia-api.fly.dev');
    vi.stubGlobal('navigator', preferences);
    vi.spyOn(productFunnel, 'deletionStatus').mockReturnValue('failed');
    const retry = vi.spyOn(productFunnel, 'retryDeletion').mockImplementation(() => {});
    const revoke = vi.spyOn(productFunnel, 'setConsent').mockImplementation(() => {});
    render(<ProductFunnelConsent />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/preferencias de tu navegador/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /borrar estadísticas de esta pestaña/i }),
    );
    expect(revoke).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: /reintentar borrado/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  },
);

it('does not hide a pending deletion after browser preferences change', () => {
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_ACCOUNT_API_URL', 'https://pausa-mia-api.fly.dev');
  vi.stubGlobal('navigator', { globalPrivacyControl: true });
  vi.spyOn(productFunnel, 'deletionStatus').mockReturnValue('pending');
  render(<ProductFunnelConsent deleted />);
  expect(screen.getByRole('status')).toHaveTextContent(/confirmando el borrado/);
});
