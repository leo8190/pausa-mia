import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WhoMakesThis } from '../components/WhoMakesThis';

const EMAIL = 'leonardo23322@gmail.com';

describe('WhoMakesThis trust strip', () => {
  it('renders the heading Quién hace esto', () => {
    render(<WhoMakesThis />);
    expect(
      screen.getByRole('heading', { name: /^quién hace esto$/i }),
    ).toBeVisible();
  });

  it('shows a short indie/beta mission in Spanish', () => {
    const { container } = render(<WhoMakesThis />);
    const mission = container.querySelector('.who-makes-this-mission');
    expect(mission).toBeTruthy();
    expect(mission).toBeVisible();
    const text = mission!.textContent ?? '';
    expect(text).toMatch(/indie|beta/i);
    expect(text).toMatch(/español/i);
    expect(text).toMatch(/navegador/i);
    expect(text).toMatch(/no somos una corporación/i);
    expect(text).toMatch(/terapia/i);
  });

  it('has a mailto contact to leonardo23322@gmail.com', () => {
    render(<WhoMakesThis />);
    const link = screen.getByRole('link', { name: /escribir al equipo/i });
    expect(link).toBeVisible();
    const href = link.getAttribute('href') ?? '';
    const url = new URL(href);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe(EMAIL);
    expect(url.searchParams.get('subject')).toBe('Pausa Mía — contacto');
    expect(screen.getByText(EMAIL)).toBeVisible();
  });

  it('does not mention empleo, carreras, hiring or jobs', () => {
    const { container } = render(<WhoMakesThis />);
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toMatch(/empleo|carreras?|hiring|jobs?|vacantes?|trabajar con nosotros/);
  });
});
