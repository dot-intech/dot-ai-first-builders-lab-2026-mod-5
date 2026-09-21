import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RootLayout, { metadata } from './layout';

describe('app/layout', () => {
  it('debe declarar el título NutraShot', () => {
    expect(metadata.title).toBe('NutraShot');
  });

  it('debe renderizar html en español con los hijos dentro del body', () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>contenido</p>
      </RootLayout>,
    );

    expect(html).toContain('<html lang="es">');
    expect(html).toMatch(/<body[^>]*><p>contenido<\/p><\/body>/);
  });
});
