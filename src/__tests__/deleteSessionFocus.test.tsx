import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DeleteSessionButton } from '../components/StepLayout';
import type { SessionApi } from '../hooks/useSession';

it('enfoca Cancelar al pedir borrado y devuelve el foco sin borrar al cancelar', () => {
  const deleteSession = vi.fn();
  render(
    <>
      <button type="button">Otra acción</button>
      <DeleteSessionButton sessionApi={{ deleteSession } as unknown as SessionApi} />
    </>,
  );
  expect(screen.getByRole('button', { name: 'Borrar esta sesión' })).not.toHaveFocus();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const trigger = screen.getByRole('button', { name: 'Borrar esta sesión' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('alertdialog', {
      name: '¿Borrar todos los datos de esta sesión?',
    });
    const cancel = within(dialog).getByRole('button', { name: 'Cancelar' });
    expect(cancel).toHaveFocus();
    fireEvent.click(cancel);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Borrar esta sesión' })).toHaveFocus();
    expect(deleteSession).not.toHaveBeenCalled();
  }
});

it('Escape cancela la confirmación sin borrar y devuelve el foco', () => {
  const deleteSession = vi.fn();
  render(
    <DeleteSessionButton sessionApi={{ deleteSession } as unknown as SessionApi} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Borrar esta sesión' }));

  const dialog = screen.getByRole('alertdialog');
  fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Cancelar' }), {
    key: 'Escape',
  });

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Borrar esta sesión' })).toHaveFocus();
  expect(deleteSession).not.toHaveBeenCalled();
});

it('usa ids únicos cuando hay más de una confirmación abierta', () => {
  const api = { deleteSession: vi.fn() } as unknown as SessionApi;
  render(
    <>
      <DeleteSessionButton sessionApi={api} />
      <DeleteSessionButton sessionApi={api} />
    </>,
  );
  for (const trigger of screen.getAllByRole('button', { name: 'Borrar esta sesión' })) {
    fireEvent.click(trigger);
  }
  const dialogs = screen.getAllByRole('alertdialog', {
    name: '¿Borrar todos los datos de esta sesión?',
  });
  expect(dialogs).toHaveLength(2);
  const labels = dialogs.map((d) => d.getAttribute('aria-labelledby'));
  expect(new Set(labels).size).toBe(2);
});
