import { describe, expect, it } from 'vitest';

import * as rules from './rules';

import { emailCoincideConQa, esEntornoPermitidoParaAccesoQa } from './rules';

describe('esEntornoPermitidoParaAccesoQa', () => {
  it.each(['development', 'test', 'staging'])('debe devolver true para %j', (nodeEnv) => {
    expect(esEntornoPermitidoParaAccesoQa(nodeEnv)).toBe(true);
  });

  it.each([
    'production',
    'Production',
    'PRODUCTION',
    ' production ',
    'prod',
    'prd',
    '',
    '   ',
    'qa',
    'preview',
    'Development',
    'STAGING',
  ])('debe devolver false para %j (lista de permitidos, comparación exacta)', (nodeEnv) => {
    expect(esEntornoPermitidoParaAccesoQa(nodeEnv)).toBe(false);
  });
});

describe('lista de entornos permitidos', () => {
  it('no debe exportarse: un array exportado es mutable en runtime y el control debe fallar cerrado', () => {
    expect(Object.keys(rules)).not.toContain('ENTORNOS_PERMITIDOS_ACCESO_QA');
  });
});

describe('emailCoincideConQa', () => {
  it('debe devolver false si qaAccessEmail es undefined', () => {
    expect(emailCoincideConQa('qa@example.com', undefined)).toBe(false);
  });

  it('debe devolver true si el email coincide con el de QA', () => {
    expect(emailCoincideConQa('qa@example.com', 'qa@example.com')).toBe(true);
  });

  it('debe devolver false si el email es distinto al de QA', () => {
    expect(emailCoincideConQa('otro@example.com', 'qa@example.com')).toBe(false);
  });

  it('debe devolver false si qaAccessEmail es un string vacío, aunque el email también lo sea', () => {
    expect(emailCoincideConQa('', '')).toBe(false);
    expect(emailCoincideConQa('qa@example.com', '')).toBe(false);
  });

  it('debe devolver false si qaAccessEmail es solo espacios, aunque el email también lo sea', () => {
    expect(emailCoincideConQa('   ', '   ')).toBe(false);
    expect(emailCoincideConQa('qa@example.com', '   ')).toBe(false);
  });

  it('debe ignorar diferencias de mayúsculas y espacios en los extremos', () => {
    expect(emailCoincideConQa('QA@Example.com', 'qa@example.com')).toBe(true);
    expect(emailCoincideConQa(' qa@example.com ', 'QA@EXAMPLE.COM')).toBe(true);
  });
});
