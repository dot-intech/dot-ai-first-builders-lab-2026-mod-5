import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { RepositoryError } from '../../../shared/errors/repository-error';
import type { Usuario } from '../../../shared/sesion/domain/types';
import { resolverUsuarioDeSesion } from '../../../shared/sesion/ui/usuario-de-sesion';
import { analizarImagen, guardarConsumo } from '../domain/consumo-service';
import {
  AnalisisImagenError,
  DatosConsumoInvalidosError,
  type AnalisisImagenReason,
} from '../domain/errors';
import { IMAGEN_MAX_BYTES } from '../domain/rules';
import type { Consumo, EstimacionNutricional } from '../domain/types';
import { analizarFoto, guardar } from './operaciones-consumo';

/**
 * Unitario, sin BD ni red: el service (que llama al modelo de visión y al repository) y la
 * resolución de la sesión se simulan con factory. Aquí se verifican las decisiones de la capa ui:
 * resultado discriminado, nivel y contenido del log, y qué errores se relanzan.
 */

// Factory explícita: el automock importaría el service real y con él `@google/genai`, `client.ts` y `env.ts`.
vi.mock('../domain/consumo-service', () => ({
  analizarImagen: vi.fn(),
  guardarConsumo: vi.fn(),
}));
vi.mock('../../../shared/sesion/ui/usuario-de-sesion', () => ({
  resolverUsuarioDeSesion: vi.fn(),
}));

const TOKEN = 'token-crudo-secreto';
const USUARIO_ID = 'usuario-secreto-1';
const usuario: Usuario = {
  id: USUARIO_ID,
  email: 'qa@example.com',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
};
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const JPEG_BASE64 = Buffer.from(JPEG).toString('base64');
const estimacion: EstimacionNutricional = {
  descripcion: 'Milanesa con papas fritas y una gaseosa',
  calorias: 850,
  desglose: { carbohidratos: 45, proteinas: 25, grasas: 28, otros: 2 },
};
const SOLICITUD_ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const datos = { ...estimacion, origen: 'camara' as const, solicitudId: SOLICITUD_ID };
const consumo: Consumo = {
  ...datos,
  usuarioId: USUARIO_ID,
  id: 'consumo-1',
  solicitudId: SOLICITUD_ID,
  createdAt: new Date('2026-09-26T12:00:00.000Z'),
};

let info: MockInstance<typeof console.info>;
let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolverUsuarioDeSesion).mockResolvedValue({ tipo: 'usuario', usuario });
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function formDataCon(imagen: Blob | string): FormData {
  const formData = new FormData();
  formData.append('imagen', imagen);
  return formData;
}

function lineasDe(espia: MockInstance<typeof console.info>): Record<string, unknown>[] {
  return espia.mock.calls.map(
    (llamado) => JSON.parse(String(llamado[0])) as Record<string, unknown>,
  );
}

function logCompleto(): string {
  return [info, warn, error]
    .flatMap((espia) => espia.mock.calls.map((llamado) => String(llamado[0])))
    .join('\n');
}

describe('operaciones-consumo/analizarFoto', () => {
  it('debe devolver la estimación del service con sesión y un JPEG válido (AC-05..AC-08)', async () => {
    vi.mocked(analizarImagen).mockResolvedValue(estimacion);

    const resultado = await analizarFoto(TOKEN, formDataCon(new Blob([JPEG])));

    expect(resultado).toEqual({ tipo: 'estimacion', estimacion });
    expect(resolverUsuarioDeSesion).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(analizarImagen).toHaveBeenCalledTimes(1);
    expect(vi.mocked(analizarImagen).mock.calls[0]?.[0]).toEqual(JPEG);
  });

  it('debe registrar consumo_analisis ok en nivel info, sin bytes ni usuarioId', async () => {
    vi.mocked(analizarImagen).mockResolvedValue(estimacion);

    await analizarFoto(TOKEN, formDataCon(new Blob([JPEG])));

    expect(lineasDe(info)).toEqual([
      expect.objectContaining({ event: 'consumo_analisis', outcome: 'ok' }),
    ]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const log = logCompleto();
    expect(log).not.toContain(USUARIO_ID);
    expect(log).not.toContain(JPEG_BASE64);
    expect(log).not.toContain(estimacion.descripcion);
  });

  it('debe aceptar una imagen de exactamente IMAGEN_MAX_BYTES', async () => {
    vi.mocked(analizarImagen).mockResolvedValue(estimacion);

    const resultado = await analizarFoto(
      TOKEN,
      formDataCon(new Blob([new Uint8Array(IMAGEN_MAX_BYTES)])),
    );

    expect(resultado).toEqual({ tipo: 'estimacion', estimacion });
    expect(vi.mocked(analizarImagen).mock.calls[0]?.[0]).toHaveLength(IMAGEN_MAX_BYTES);
  });

  it('debe devolver sin-sesion sin llamar al service ni registrar logs', async () => {
    vi.mocked(resolverUsuarioDeSesion).mockResolvedValue({ tipo: 'sin-sesion' });

    const resultado = await analizarFoto(undefined, formDataCon(new Blob([JPEG])));

    expect(resultado).toStrictEqual({ tipo: 'sin-sesion' });
    expect(analizarImagen).not.toHaveBeenCalled();
    expect(logCompleto()).toBe('');
  });

  it('debe devolver error sin llamar al service si la resolución de la sesión falla', async () => {
    vi.mocked(resolverUsuarioDeSesion).mockResolvedValue({
      tipo: 'error',
      operation: 'sesion.findByTokenHash',
    });

    const resultado = await analizarFoto(TOKEN, formDataCon(new Blob([JPEG])));

    expect(resultado).toStrictEqual({ tipo: 'error' });
    expect(analizarImagen).not.toHaveBeenCalled();
    expect(lineasDe(error)).toEqual([
      expect.objectContaining({
        event: 'consumo_sesion',
        outcome: 'error',
        operation: 'sesion.findByTokenHash',
      }),
    ]);
  });

  describe('entrada inválida (antes de llamar al service)', () => {
    const sinImagen = new FormData();
    sinImagen.append('otro', new Blob([JPEG]));

    it.each([
      { caso: 'un objeto plano en lugar de FormData', entrada: { imagen: new Blob([JPEG]) } },
      { caso: 'null', entrada: null },
      { caso: 'un string', entrada: 'imagen' },
      { caso: 'un FormData sin imagen', entrada: sinImagen },
      { caso: 'una imagen string', entrada: formDataCon(JPEG_BASE64) },
      {
        caso: `un Blob de ${IMAGEN_MAX_BYTES + 1} bytes`,
        entrada: formDataCon(new Blob([new Uint8Array(IMAGEN_MAX_BYTES + 1)])),
      },
    ])('debe devolver error y registrar imagen-invalida con $caso', async ({ entrada }) => {
      const resultado = await analizarFoto(TOKEN, entrada);

      expect(resultado).toEqual({ tipo: 'error' });
      expect(analizarImagen).not.toHaveBeenCalled();
      expect(lineasDe(warn)).toEqual([
        expect.objectContaining({
          event: 'consumo_analisis',
          outcome: 'rechazado',
          reason: 'imagen-invalida',
        }),
      ]);
      expect(info).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(logCompleto()).not.toContain(JPEG_BASE64);
    });

    it('no debe leer los bytes de una imagen demasiado grande', async () => {
      // Solo `arrayBuffer`: `Blob.prototype.bytes` no existe en Node 20 (runtime del Stack).
      const arrayBuffer = vi.spyOn(Blob.prototype, 'arrayBuffer');
      vi.mocked(analizarImagen).mockResolvedValue(estimacion);
      // Control: con una imagen válida el espía sí detecta la lectura.
      await analizarFoto(TOKEN, formDataCon(new Blob([JPEG])));
      expect(arrayBuffer).toHaveBeenCalledTimes(1);
      arrayBuffer.mockClear();

      await analizarFoto(TOKEN, formDataCon(new Blob([new Uint8Array(IMAGEN_MAX_BYTES + 1)])));

      expect(arrayBuffer).not.toHaveBeenCalled();
    });
  });

  describe('errores del service (AnalisisImagenError)', () => {
    it.each<AnalisisImagenReason>(['timeout', 'fallo', 'no-configurado', 'respuesta-invalida'])(
      'debe devolver solo { tipo: error } y registrar outcome error con reason %s (AC-10, AC-15)',
      async (reason) => {
        vi.mocked(analizarImagen).mockRejectedValue(new AnalisisImagenError(reason));

        const resultado = await analizarFoto(TOKEN, formDataCon(new Blob([JPEG])));

        expect(resultado).toStrictEqual({ tipo: 'error' });
        expect(lineasDe(error)).toEqual([
          expect.objectContaining({ event: 'consumo_analisis', outcome: 'error', reason }),
        ]);
        expect(info).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
      },
    );

    it('debe registrar imagen-invalida del service como rechazado en nivel warn', async () => {
      vi.mocked(analizarImagen).mockRejectedValue(new AnalisisImagenError('imagen-invalida'));

      const resultado = await analizarFoto(TOKEN, formDataCon(new Blob([JPEG])));

      expect(resultado).toStrictEqual({ tipo: 'error' });
      expect(lineasDe(warn)).toEqual([
        expect.objectContaining({
          event: 'consumo_analisis',
          outcome: 'rechazado',
          reason: 'imagen-invalida',
        }),
      ]);
      expect(info).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });

    it('no debe copiar el cause, el message, los bytes ni el usuarioId al log ni al resultado', async () => {
      const cause = new Error(
        `ApiError 500 gemini-3.1-flash-lite key=AIza-secreta data=${JPEG_BASE64}`,
      );
      vi.mocked(analizarImagen).mockRejectedValue(new AnalisisImagenError('fallo', { cause }));

      const resultado = await analizarFoto(TOKEN, formDataCon(new Blob([JPEG])));

      expect(lineasDe(error)).toEqual([expect.objectContaining({ reason: 'fallo' })]);
      const log = logCompleto();
      expect(log).not.toMatch(/ApiError|gemini|AIza|No se pudo/);
      expect(log).not.toContain(JPEG_BASE64);
      expect(log).not.toContain(USUARIO_ID);
      expect(JSON.stringify(resultado)).toBe('{"tipo":"error"}');
    });
  });

  it('debe relanzar la misma instancia de un error genérico del service', async () => {
    const inesperado = new Error('fallo imprevisto');
    vi.mocked(analizarImagen).mockRejectedValue(inesperado);

    await expect(analizarFoto(TOKEN, formDataCon(new Blob([JPEG])))).rejects.toBe(inesperado);
    expect(logCompleto()).toBe('');
  });
});

describe('operaciones-consumo/guardar', () => {
  it('debe devolver guardado y pasar al service el usuarioId de la sesión (AC-02, AC-04, AC-14)', async () => {
    vi.mocked(guardarConsumo).mockResolvedValue(consumo);
    const conUsuarioAjeno = { ...datos, usuarioId: 'otro-usuario' };

    const resultado = await guardar(TOKEN, conUsuarioAjeno);

    expect(resultado).toStrictEqual({ tipo: 'guardado' });
    expect(resolverUsuarioDeSesion).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(guardarConsumo).toHaveBeenCalledExactlyOnceWith(USUARIO_ID, conUsuarioAjeno);
  });

  it('debe devolver datos-invalidos y registrar el campo si falta el solicitudId', async () => {
    vi.mocked(guardarConsumo).mockRejectedValue(new DatosConsumoInvalidosError('solicitudId'));
    const sinSolicitudId: Record<string, unknown> = { ...datos };
    delete sinSolicitudId.solicitudId;

    const resultado = await guardar(TOKEN, sinSolicitudId);

    expect(resultado).toStrictEqual({ tipo: 'datos-invalidos' });
    expect(guardarConsumo).toHaveBeenCalledExactlyOnceWith(USUARIO_ID, sinSolicitudId);
    expect(lineasDe(warn)).toEqual([
      expect.objectContaining({
        event: 'consumo_guardado',
        outcome: 'rechazado',
        reason: 'solicitudId',
      }),
    ]);
  });

  it('debe registrar consumo_guardado ok en nivel info, sin usuarioId', async () => {
    vi.mocked(guardarConsumo).mockResolvedValue(consumo);

    await guardar(TOKEN, datos);

    expect(lineasDe(info)).toEqual([
      expect.objectContaining({ event: 'consumo_guardado', outcome: 'ok' }),
    ]);
    expect(logCompleto()).not.toContain(USUARIO_ID);
    expect(logCompleto()).not.toContain(datos.descripcion);
  });

  it('debe devolver datos-invalidos y registrar rechazado con el campo', async () => {
    vi.mocked(guardarConsumo).mockRejectedValue(new DatosConsumoInvalidosError('desglose'));

    const resultado = await guardar(TOKEN, { ...datos, desglose: { ...datos.desglose, otros: 1 } });

    expect(resultado).toStrictEqual({ tipo: 'datos-invalidos' });
    expect(lineasDe(warn)).toEqual([
      expect.objectContaining({
        event: 'consumo_guardado',
        outcome: 'rechazado',
        reason: 'desglose',
      }),
    ]);
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('debe devolver error ante RepositoryError y registrar solo la operation', async () => {
    const cause = new Error(`insert into consumos ... usuario_id = '${USUARIO_ID}'`);
    vi.mocked(guardarConsumo).mockRejectedValue(new RepositoryError('consumos.crear', { cause }));

    const resultado = await guardar(TOKEN, datos);

    expect(resultado).toStrictEqual({ tipo: 'error' });
    expect(lineasDe(error)).toEqual([
      expect.objectContaining({
        event: 'consumo_guardado',
        outcome: 'error',
        operation: 'consumos.crear',
      }),
    ]);
    const log = logCompleto();
    expect(log).not.toMatch(/insert|Error de acceso/i);
    expect(log).not.toContain(USUARIO_ID);
  });

  it('debe devolver sin-sesion sin llamar al service ni registrar logs', async () => {
    vi.mocked(resolverUsuarioDeSesion).mockResolvedValue({ tipo: 'sin-sesion' });

    const resultado = await guardar(undefined, datos);

    expect(resultado).toStrictEqual({ tipo: 'sin-sesion' });
    expect(guardarConsumo).not.toHaveBeenCalled();
    expect(logCompleto()).toBe('');
  });

  it('debe devolver error sin llamar al service si la resolución de la sesión falla', async () => {
    vi.mocked(resolverUsuarioDeSesion).mockResolvedValue({
      tipo: 'error',
      operation: 'sesion.findByTokenHash',
    });

    const resultado = await guardar(TOKEN, datos);

    expect(resultado).toStrictEqual({ tipo: 'error' });
    expect(guardarConsumo).not.toHaveBeenCalled();
    expect(lineasDe(error)).toEqual([
      expect.objectContaining({
        event: 'consumo_sesion',
        outcome: 'error',
        operation: 'sesion.findByTokenHash',
      }),
    ]);
  });

  it('debe relanzar la misma instancia de un error genérico del service', async () => {
    const inesperado = new Error('fallo imprevisto');
    vi.mocked(guardarConsumo).mockRejectedValue(inesperado);

    await expect(guardar(TOKEN, datos)).rejects.toBe(inesperado);
    expect(logCompleto()).toBe('');
  });
});
