import { db } from '../../../shared/db/client';
import { conRepositoryError } from '../../../shared/db/con-repository-error';
import { consumos } from '../../../shared/db/schema';
import { RepositoryError } from '../../../shared/errors/repository-error';
import type { Consumo, NuevoConsumo, OrigenImagen } from '../domain/types';

type FilaConsumo = typeof consumos.$inferSelect;

function aConsumo(fila: FilaConsumo): Consumo {
  return {
    id: fila.id,
    usuarioId: fila.usuarioId,
    descripcion: fila.descripcion,
    calorias: fila.calorias,
    desglose: {
      carbohidratos: fila.pctCarbohidratos,
      proteinas: fila.pctProteinas,
      grasas: fila.pctGrasas,
      otros: fila.pctOtros,
    },
    // La columna es `text`, pero `consumos_origen_check` solo admite los valores de `OrigenImagen`.
    origen: fila.origen as OrigenImagen,
    createdAt: fila.createdAt,
  };
}

/** Persiste un consumo ya validado por el service; la BD vuelve a imponer sus CHECKs. */
export async function crearConsumo(nuevo: NuevoConsumo): Promise<Consumo> {
  const [fila] = await conRepositoryError('consumos.crear', () =>
    db
      .insert(consumos)
      .values({
        usuarioId: nuevo.usuarioId,
        descripcion: nuevo.descripcion,
        calorias: nuevo.calorias,
        pctCarbohidratos: nuevo.desglose.carbohidratos,
        pctProteinas: nuevo.desglose.proteinas,
        pctGrasas: nuevo.desglose.grasas,
        pctOtros: nuevo.desglose.otros,
        origen: nuevo.origen,
      })
      .returning(),
  );

  if (!fila) {
    throw new RepositoryError('consumos.crear');
  }
  return aConsumo(fila);
}
