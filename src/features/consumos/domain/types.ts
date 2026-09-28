/** Cómo llegó la foto: sacada con la cámara o elegida de la galería. */
export type OrigenImagen = 'camara' | 'galeria';

/** Porcentajes enteros (0..100) que suman exactamente 100. */
export type DesgloseNutricional = {
  carbohidratos: number;
  proteinas: number;
  grasas: number;
  otros: number;
};

/** Lo que se muestra al usuario tras analizar la foto. */
export type EstimacionNutricional = {
  descripcion: string;
  calorias: number;
  desglose: DesgloseNutricional;
};

export type DatosConsumo = EstimacionNutricional & { origen: OrigenImagen };

export type NuevoConsumo = DatosConsumo & { usuarioId: string };

export type Consumo = NuevoConsumo & { id: string; createdAt: Date };
