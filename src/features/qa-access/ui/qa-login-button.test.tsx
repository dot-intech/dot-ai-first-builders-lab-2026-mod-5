import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QaLoginButton } from './qa-login-button';

const holder = vi.hoisted(() => ({ pending: false }));

// `useFormStatus` solo devuelve `pending: true` dentro de un envío real: se simula ese estado.
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  useFormStatus: () => ({ pending: holder.pending }),
}));

beforeEach(() => {
  holder.pending = false;
});

describe('qa-login-button/QaLoginButton', () => {
  it('debe renderizar un botón de tipo submit habilitado', () => {
    const html = renderToStaticMarkup(<QaLoginButton />);

    expect(html).toContain('type="submit"');
    expect(html).not.toContain('disabled');
  });

  it('debe mostrar un texto en español para ingresar', () => {
    expect(renderToStaticMarkup(<QaLoginButton />)).toContain('Ingresar como QA');
  });

  it('debe deshabilitarse y cambiar el texto mientras el envío está pendiente', () => {
    holder.pending = true;

    const html = renderToStaticMarkup(<QaLoginButton />);

    expect(html).toContain('disabled');
    expect(html).toContain('Ingresando');
  });
});
