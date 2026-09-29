import { describe, expect, it } from 'vitest';
import type { EstimacionNutricional } from '../domain/types';
import {
  ESTADO_INICIAL,
  datosDesdeBorrador,
  reducirFlujo,
  type Borrador,
  type EstadoFlujo,
  type EventoFlujo,
} from './flujo-nuevo-consumo';

const ID = 'solicitud-1';
const ID_VIEJO = 'solicitud-0';

const ESTIMACION: EstimacionNutricional = {
  descripcion: 'Milanesa con puré',
  calorias: 850,
  desglose: { carbohidratos: 40, proteinas: 30, grasas: 25, otros: 5 },
  confianza: 85,
};

const BORRADOR: Borrador = {
  descripcion: 'Milanesa con puré',
  calorias: '850',
  carbohidratos: '40',
  proteinas: '30',
  grasas: '25',
  otros: '5',
};

const PROCESANDO: EstadoFlujo = { tipo: 'procesando', solicitudId: ID, origen: 'camara' };
const REVISION: EstadoFlujo = {
  tipo: 'revision',
  solicitudId: ID,
  origen: 'camara',
  borrador: BORRADOR,
};
const GUARDANDO: EstadoFlujo = {
  tipo: 'guardando',
  solicitudId: ID,
  origen: 'camara',
  borrador: BORRADOR,
};
const GUARDADO: EstadoFlujo = { tipo: 'guardado' };
const ERROR: EstadoFlujo = { tipo: 'error' };

/** Aplica una secuencia de eventos desde el estado dado. */
function aplicar(estado: EstadoFlujo, ...eventos: EventoFlujo[]): EstadoFlujo {
  return eventos.reduce(reducirFlujo, estado);
}

function revisionCon(cambios: Partial<Borrador>): EstadoFlujo {
  return { ...REVISION, borrador: { ...BORRADOR, ...cambios } } as EstadoFlujo;
}

describe('flujo-nuevo-consumo', () => {
  describe('estado inicial', () => {
    it('debe arrancar en inicio', () => {
      expect(ESTADO_INICIAL).toEqual({ tipo: 'inicio' });
    });
  });

  describe('imagen-elegida', () => {
    it('debe pasar de inicio a procesando con origen camara', () => {
      const estado = reducirFlujo(ESTADO_INICIAL, {
        tipo: 'imagen-elegida',
        origen: 'camara',
        solicitudId: ID,
      });

      expect(estado).toEqual({ tipo: 'procesando', solicitudId: ID, origen: 'camara' });
    });

    it('debe pasar de inicio a procesando con origen galeria', () => {
      const estado = reducirFlujo(ESTADO_INICIAL, {
        tipo: 'imagen-elegida',
        origen: 'galeria',
        solicitudId: ID,
      });

      expect(estado).toEqual({ tipo: 'procesando', solicitudId: ID, origen: 'galeria' });
    });

    it('debe ignorarse fuera de inicio', () => {
      const evento: EventoFlujo = {
        tipo: 'imagen-elegida',
        origen: 'galeria',
        solicitudId: 'otra',
      };

      expect(reducirFlujo(PROCESANDO, evento)).toBe(PROCESANDO);
      expect(reducirFlujo(REVISION, evento)).toBe(REVISION);
    });
  });

  describe('analisis-ok', () => {
    it('vigente debe pasar a revision con el borrador precargado', () => {
      const estado = reducirFlujo(PROCESANDO, {
        tipo: 'analisis-ok',
        solicitudId: ID,
        estimacion: ESTIMACION,
      });

      expect(estado).toEqual({
        tipo: 'revision',
        solicitudId: ID,
        origen: 'camara',
        borrador: BORRADOR,
      });
    });

    it('con solicitudId viejo debe ignorarse después de cancelar', () => {
      const tras = aplicar(
        PROCESANDO,
        { tipo: 'cancelar' },
        { tipo: 'imagen-elegida', origen: 'galeria', solicitudId: 'solicitud-2' },
      );

      const estado = reducirFlujo(tras, {
        tipo: 'analisis-ok',
        solicitudId: ID,
        estimacion: ESTIMACION,
      });

      expect(estado).toBe(tras);
      expect(estado).toEqual({ tipo: 'procesando', solicitudId: 'solicitud-2', origen: 'galeria' });
    });

    it('con solicitudId viejo debe ignorarse después de tiempo-agotado', () => {
      const tras = reducirFlujo(PROCESANDO, { tipo: 'tiempo-agotado', solicitudId: ID });

      const estado = reducirFlujo(tras, {
        tipo: 'analisis-ok',
        solicitudId: ID,
        estimacion: ESTIMACION,
      });

      expect(estado).toBe(tras);
      expect(estado).toEqual({ tipo: 'error' });
    });

    it('con solicitudId distinto del vigente en procesando debe ignorarse', () => {
      const estado = reducirFlujo(PROCESANDO, {
        tipo: 'analisis-ok',
        solicitudId: ID_VIEJO,
        estimacion: ESTIMACION,
      });

      expect(estado).toBe(PROCESANDO);
    });
  });

  describe('campo-editado', () => {
    it('debe actualizar solo ese campo del borrador', () => {
      const estado = reducirFlujo(REVISION, {
        tipo: 'campo-editado',
        campo: 'proteinas',
        valor: '35',
      });

      expect(estado).toEqual({ ...REVISION, borrador: { ...BORRADOR, proteinas: '35' } });
      // El borrador original no se muta.
      expect(BORRADOR.proteinas).toBe('30');
    });

    it.each(['desglose-no-suma-100', 'datos-invalidos', 'error-al-guardar'] as const)(
      'debe borrar el aviso %s al editar',
      (aviso) => {
        const conAviso = { ...REVISION, aviso } as EstadoFlujo;

        const estado = reducirFlujo(conAviso, {
          tipo: 'campo-editado',
          campo: 'descripcion',
          valor: 'Otra cosa',
        });

        expect(estado).toEqual({
          ...REVISION,
          borrador: { ...BORRADOR, descripcion: 'Otra cosa' },
        });
        expect(estado).not.toHaveProperty('aviso');
      },
    );

    it('si la edición deja el desglose mal, el aviso reaparece al próximo guardar', () => {
      const conAviso = {
        ...revisionCon({ otros: '4' }),
        aviso: 'desglose-no-suma-100',
      } as EstadoFlujo;

      const editado = reducirFlujo(conAviso, { tipo: 'campo-editado', campo: 'otros', valor: '3' });
      expect(editado).not.toHaveProperty('aviso');

      const estado = reducirFlujo(editado, { tipo: 'guardar', solicitudId: ID });
      expect(estado).toEqual({ ...revisionCon({ otros: '3' }), aviso: 'desglose-no-suma-100' });
    });

    it('debe cortar la descripción a DESCRIPCION_MAX code points sin partir emojis', () => {
      const estado = reducirFlujo(REVISION, {
        tipo: 'campo-editado',
        campo: 'descripcion',
        valor: '🍕'.repeat(501),
      });

      const descripcion = estado.tipo === 'revision' ? estado.borrador.descripcion : '';
      expect(descripcion).toBe('🍕'.repeat(500));
      expect(Array.from(descripcion)).toHaveLength(500);
      // Sin surrogate suelto: cada code point es el emoji completo.
      expect(Array.from(descripcion).every((c) => c === '🍕')).toBe(true);
    });

    it('debe dejar intacta una descripción de exactamente DESCRIPCION_MAX code points', () => {
      const valor = 'a'.repeat(499) + '🍕';

      const estado = reducirFlujo(REVISION, { tipo: 'campo-editado', campo: 'descripcion', valor });

      expect(estado.tipo === 'revision' && estado.borrador.descripcion).toBe(valor);
    });

    it('no debe cortar los campos numéricos', () => {
      const valor = '1'.repeat(600);

      const estado = reducirFlujo(REVISION, { tipo: 'campo-editado', campo: 'calorias', valor });

      expect(estado.tipo === 'revision' && estado.borrador.calorias).toBe(valor);
    });

    it.each(['usuarioId', 'toString', 'constructor'])(
      'con un campo desconocido (%s) debe devolver el mismo estado',
      (campo) => {
        const evento = {
          tipo: 'campo-editado',
          campo,
          valor: 'x',
        } as unknown as EventoFlujo;

        expect(reducirFlujo(REVISION, evento)).toBe(REVISION);
      },
    );

    it('con un valor que no es string debe devolver el mismo estado', () => {
      const evento = {
        tipo: 'campo-editado',
        campo: 'calorias',
        valor: 12,
      } as unknown as EventoFlujo;

      expect(reducirFlujo(REVISION, evento)).toBe(REVISION);
    });
  });

  describe('guardar', () => {
    it('con porcentajes que suman 100 debe pasar a guardando y guardado-ok a guardado', () => {
      const guardando = reducirFlujo(REVISION, { tipo: 'guardar', solicitudId: ID });

      expect(guardando).toEqual({
        tipo: 'guardando',
        solicitudId: ID,
        origen: 'camara',
        borrador: BORRADOR,
      });
      expect(reducirFlujo(guardando, { tipo: 'guardado-ok', solicitudId: ID })).toEqual({
        tipo: 'guardado',
      });
    });

    it('debe descartar el aviso anterior al pasar a guardando', () => {
      const conAviso = { ...REVISION, aviso: 'error-al-guardar' } as EstadoFlujo;

      const estado = reducirFlujo(conAviso, { tipo: 'guardar', solicitudId: ID });

      expect(estado).toEqual(GUARDANDO);
      expect(estado).not.toHaveProperty('aviso');
    });

    it('un segundo guardar en guardando debe devolver el mismo estado (doble clic)', () => {
      expect(reducirFlujo(GUARDANDO, { tipo: 'guardar', solicitudId: ID })).toBe(GUARDANDO);
    });

    it('con porcentajes que suman 99 debe quedar en revision con aviso desglose-no-suma-100', () => {
      const revision = revisionCon({ otros: '4' });

      const estado = reducirFlujo(revision, { tipo: 'guardar', solicitudId: ID });

      expect(estado).toEqual({ ...revision, aviso: 'desglose-no-suma-100' });
    });

    it('con un porcentaje vacío o no numérico debe quedar en revision con aviso', () => {
      for (const otros of ['', 'abc']) {
        const revision = revisionCon({ otros });

        const estado = reducirFlujo(revision, { tipo: 'guardar', solicitudId: ID });

        expect(estado).toEqual({ ...revision, aviso: 'desglose-no-suma-100' });
      }
    });

    it('con solicitudId no vigente debe ignorarse', () => {
      expect(reducirFlujo(REVISION, { tipo: 'guardar', solicitudId: ID_VIEJO })).toBe(REVISION);
    });
  });

  describe('guardado-ok y guardado-fallo', () => {
    it('guardado-fallo datos-invalidos debe volver a revision con aviso datos-invalidos', () => {
      const estado = reducirFlujo(GUARDANDO, {
        tipo: 'guardado-fallo',
        solicitudId: ID,
        motivo: 'datos-invalidos',
      });

      expect(estado).toEqual({ ...REVISION, aviso: 'datos-invalidos' });
    });

    it('guardado-fallo error debe volver a revision con aviso error-al-guardar y el mismo borrador', () => {
      const editado: Borrador = { ...BORRADOR, descripcion: 'Editada por el usuario' };
      const guardando = { ...GUARDANDO, borrador: editado } as EstadoFlujo;

      const estado = reducirFlujo(guardando, {
        tipo: 'guardado-fallo',
        solicitudId: ID,
        motivo: 'error',
      });

      expect(estado).toEqual({
        tipo: 'revision',
        solicitudId: ID,
        origen: 'camara',
        borrador: editado,
        aviso: 'error-al-guardar',
      });
    });

    it('con solicitudId no vigente deben ignorarse', () => {
      expect(reducirFlujo(GUARDANDO, { tipo: 'guardado-ok', solicitudId: ID_VIEJO })).toBe(
        GUARDANDO,
      );
      expect(
        reducirFlujo(GUARDANDO, {
          tipo: 'guardado-fallo',
          solicitudId: ID_VIEJO,
          motivo: 'error',
        }),
      ).toBe(GUARDANDO);
    });

    it('fuera de guardando deben ignorarse', () => {
      expect(reducirFlujo(REVISION, { tipo: 'guardado-ok', solicitudId: ID })).toBe(REVISION);
      expect(
        reducirFlujo(REVISION, { tipo: 'guardado-fallo', solicitudId: ID, motivo: 'error' }),
      ).toBe(REVISION);
    });
  });

  describe('cancelar', () => {
    it.each<[string, EstadoFlujo]>([
      ['inicio', ESTADO_INICIAL],
      ['procesando', PROCESANDO],
      ['revision', REVISION],
      ['error', ERROR],
    ])('desde %s debe volver a inicio sin datos', (_nombre, estado) => {
      expect(reducirFlujo(estado, { tipo: 'cancelar' })).toEqual({ tipo: 'inicio' });
    });

    it('en guardando debe devolver el mismo estado', () => {
      expect(reducirFlujo(GUARDANDO, { tipo: 'cancelar' })).toBe(GUARDANDO);
    });

    it('en guardado debe devolver el mismo estado', () => {
      expect(reducirFlujo(GUARDADO, { tipo: 'cancelar' })).toBe(GUARDADO);
    });
  });

  describe('reintentar y registrar-otro', () => {
    it('reintentar en error debe volver a inicio', () => {
      expect(reducirFlujo(ERROR, { tipo: 'reintentar' })).toEqual({ tipo: 'inicio' });
    });

    it('registrar-otro en guardado debe volver a inicio', () => {
      expect(reducirFlujo(GUARDADO, { tipo: 'registrar-otro' })).toEqual({ tipo: 'inicio' });
    });
  });

  describe('errores del análisis', () => {
    it('analisis-fallo vigente debe pasar a error', () => {
      expect(reducirFlujo(PROCESANDO, { tipo: 'analisis-fallo', solicitudId: ID })).toEqual({
        tipo: 'error',
      });
    });

    it('tiempo-agotado vigente en procesando debe pasar a error', () => {
      expect(reducirFlujo(PROCESANDO, { tipo: 'tiempo-agotado', solicitudId: ID })).toEqual({
        tipo: 'error',
      });
    });

    it('analisis-fallo y tiempo-agotado no vigentes deben ignorarse', () => {
      expect(reducirFlujo(PROCESANDO, { tipo: 'analisis-fallo', solicitudId: ID_VIEJO })).toBe(
        PROCESANDO,
      );
      expect(reducirFlujo(PROCESANDO, { tipo: 'tiempo-agotado', solicitudId: ID_VIEJO })).toBe(
        PROCESANDO,
      );
    });

    it('tiempo-agotado fuera de procesando debe ignorarse', () => {
      expect(reducirFlujo(REVISION, { tipo: 'tiempo-agotado', solicitudId: ID })).toBe(REVISION);
    });
  });

  describe('sin-sesion', () => {
    it.each<[string, EstadoFlujo]>([
      ['procesando', PROCESANDO],
      ['guardando', GUARDANDO],
    ])('desde %s debe volver a inicio', (_nombre, estado) => {
      expect(reducirFlujo(estado, { tipo: 'sin-sesion' })).toEqual({ tipo: 'inicio' });
    });
  });

  describe('eventos no válidos para el estado', () => {
    it.each<[string, EstadoFlujo, EventoFlujo]>([
      ['guardar en inicio', ESTADO_INICIAL, { tipo: 'guardar', solicitudId: ID }],
      [
        'analisis-ok en revision',
        REVISION,
        { tipo: 'analisis-ok', solicitudId: ID, estimacion: ESTIMACION },
      ],
      [
        'campo-editado en procesando',
        PROCESANDO,
        { tipo: 'campo-editado', campo: 'calorias', valor: '1' },
      ],
      ['reintentar en revision', REVISION, { tipo: 'reintentar' }],
      ['registrar-otro en inicio', ESTADO_INICIAL, { tipo: 'registrar-otro' }],
      ['registrar-otro en revision', REVISION, { tipo: 'registrar-otro' }],
      ['registrar-otro en error', ERROR, { tipo: 'registrar-otro' }],
      ['analisis-fallo en revision', REVISION, { tipo: 'analisis-fallo', solicitudId: ID }],
      ['evento desconocido', REVISION, { tipo: 'no-existe' } as unknown as EventoFlujo],
    ])('%s debe devolver el mismo estado sin lanzar', (_nombre, estado, evento) => {
      expect(() => reducirFlujo(estado, evento)).not.toThrow();
      expect(reducirFlujo(estado, evento)).toBe(estado);
    });
  });

  describe('datosDesdeBorrador', () => {
    it('debe convertir los strings a números e incluir el origen y el solicitudId', () => {
      expect(datosDesdeBorrador(BORRADOR, 'galeria', ID)).toEqual({
        descripcion: 'Milanesa con puré',
        calorias: 850,
        desglose: { carbohidratos: 40, proteinas: 30, grasas: 25, otros: 5 },
        origen: 'galeria',
        solicitudId: ID,
      });
    });

    it('debe convertir un campo vacío en NaN para que el servidor lo rechace', () => {
      const datos = datosDesdeBorrador({ ...BORRADOR, calorias: '  ' }, 'camara', ID) as {
        calorias: number;
      };

      expect(datos.calorias).toBeNaN();
    });
  });
});
