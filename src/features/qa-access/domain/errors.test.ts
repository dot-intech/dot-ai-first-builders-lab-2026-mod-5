import { describe, expect, it } from 'vitest';

import {
  QaAccessDeniedError,
  SessionExpiredError,
  SessionNotFoundError,
  type QaAccessDeniedReason,
} from './errors';

const RAZONES: QaAccessDeniedReason[] = ['environment_not_allowed', 'not_configured'];

describe('errores tipados de qa-access', () => {
  it.each(RAZONES)(
    'QaAccessDeniedError (reason=%s) debe ser instancia de Error y de su clase, con su name propio',
    (reason) => {
      const error = new QaAccessDeniedError(reason);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(QaAccessDeniedError);
      expect(error.name).toBe('QaAccessDeniedError');
    },
  );

  it.each([
    ['SessionExpiredError', SessionExpiredError],
    ['SessionNotFoundError', SessionNotFoundError],
  ])(
    '%s debe ser instancia de Error y de su propia clase, con su name propio',
    (name, ErrorClass) => {
      const error = new ErrorClass();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ErrorClass);
      expect(error.name).toBe(name);
    },
  );

  it('las clases de error deben poder distinguirse entre sí con instanceof', () => {
    const error = new SessionExpiredError();

    expect(error).not.toBeInstanceOf(SessionNotFoundError);
    expect(error).not.toBeInstanceOf(QaAccessDeniedError);
  });
});

describe('QaAccessDeniedError', () => {
  it.each(RAZONES)('debe exponer reason=%s como propiedad pública', (reason) => {
    expect(new QaAccessDeniedError(reason).reason).toBe(reason);
  });

  it.each(RAZONES)(
    'el message (reason=%s) no debe revelar la causa ni nombres de configuración',
    (reason) => {
      const message = new QaAccessDeniedError(reason).message.toLowerCase();

      const terminosProhibidos = [
        'production',
        'node_env',
        'qa_access_email',
        'reason',
        'environment',
        'entorno',
        'not_configured',
        'configur',
      ];

      for (const termino of terminosProhibidos) {
        expect(message).not.toContain(termino);
      }
    },
  );

  it('debe usar el mismo message para ambas razones', () => {
    expect(new QaAccessDeniedError('environment_not_allowed').message).toBe(
      new QaAccessDeniedError('not_configured').message,
    );
  });
});

describe('propagación de cause', () => {
  const causa = new Error('causa original');

  it('QaAccessDeniedError debe propagar cause', () => {
    expect(new QaAccessDeniedError('environment_not_allowed', { cause: causa }).cause).toBe(causa);
  });

  it('SessionExpiredError debe propagar cause', () => {
    expect(new SessionExpiredError({ cause: causa }).cause).toBe(causa);
  });

  it('SessionNotFoundError debe propagar cause', () => {
    expect(new SessionNotFoundError({ cause: causa }).cause).toBe(causa);
  });
});
