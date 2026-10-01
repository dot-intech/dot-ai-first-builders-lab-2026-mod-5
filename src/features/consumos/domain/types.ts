/**
 * Cómo se originó el consumo: foto sacada con la cámara, foto elegida de la galería o carga manual
 * sin foto. Conserva su nombre para no renombrar la columna `origen` ya migrada (ADR-010).
 */
export type OrigenImagen = 'camara' | 'galeria' | 'manual';

/** Porcentajes enteros (0..100) que suman exactamente 100. */
export type DesgloseNutricional = {
  carbohidratos: number;
  proteinas: number;
  grasas: number;
  otros: number;
};

/** Lo que describe un consumo: base común de la estimación, lo que se guarda y lo que se lee. */
export type ContenidoNutricional = {
  descripcion: string;
  calorias: number;
  desglose: DesgloseNutricional;
};

/**
 * Lo que se muestra al usuario tras analizar la foto. `confianza` es un entero 0..100 autorreportado
 * por el modelo; no se persiste ni forma parte de `DatosConsumo` (A3).
 */
export type EstimacionNutricional = ContenidoNutricional & { confianza: number };

/** `solicitudId` identifica un mismo intento de registro: reintentar con él no duplica el consumo. */
export type DatosConsumo = ContenidoNutricional & { origen: OrigenImagen; solicitudId: string };

export type NuevoConsumo = DatosConsumo & { usuarioId: string };

/** `solicitudId` es nulo en los consumos anteriores a la idempotencia (FEAT-001b). */
export type Consumo = ContenidoNutricional & {
  usuarioId: string;
  origen: OrigenImagen;
  solicitudId: string | null;
  id: string;
  createdAt: Date;
};
