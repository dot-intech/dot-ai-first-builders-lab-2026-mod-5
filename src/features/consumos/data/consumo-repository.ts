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
    solicitudId: fila.solicitudId,
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
        solicitudId: nuevo.solicitudId,
      })
      // Un mismo intento (usuario + solicitud) deja una sola fila; gana la última escritura (D3).
      // Columnas explícitas: el `set` nunca toca `id`, `usuario_id`, `solicitud_id` ni `created_at`.
      .onConflictDoUpdate({
        target: [consumos.usuarioId, consumos.solicitudId],
        set: {
          descripcion: nuevo.descripcion,
          calorias: nuevo.calorias,
          pctCarbohidratos: nuevo.desglose.carbohidratos,
          pctProteinas: nuevo.desglose.proteinas,
          pctGrasas: nuevo.desglose.grasas,
          pctOtros: nuevo.desglose.otros,
          origen: nuevo.origen,
        },
      })
      .returning(),
  );

  if (!fila) {
    throw new RepositoryError('consumos.crear');
  }
  return aConsumo(fila);
}
