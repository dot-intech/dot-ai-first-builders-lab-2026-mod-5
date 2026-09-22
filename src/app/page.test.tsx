import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('app/page (home)', () => {
  it('debe mostrar el título de la aplicación', () => {
    expect(renderToStaticMarkup(<Home />)).toContain('NutraShot');
  });

  it('debe enlazar a /dev-login', () => {
    expect(renderToStaticMarkup(<Home />)).toContain('href="/dev-login"');
  });
});
