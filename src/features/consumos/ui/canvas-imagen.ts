import {
  CALIDAD_INICIAL,
  ImagenNoProcesableError,
  dimensionesParaReencodear,
  siguienteCalidad,
} from './reducir-imagen';

/*
 * Reencodea la foto a JPEG con canvas. Sin tests (ADR-008): canvas no existe en `node`; las
 * decisiones (dimensiones y calidad) viven en `reducir-imagen.ts`, que sí está testeado. Dibujar en
 * un canvas y exportar descarta el EXIF (M-5).
 */

function aJpeg(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImagenNoProcesableError('no-legible'))),
      'image/jpeg',
      calidad,
    );
  });
}

/**
 * Lanza `ImagenNoProcesableError('no-legible')` si el navegador no decodifica la imagen (p. ej.
 * HEIC) y `('demasiado-grande')` si con la calidad mínima sigue superando el objetivo de bytes.
 */
export async function reencodearComoJpeg(archivo: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // Explícito: el reencodeo descarta el EXIF, así que la rotación que indica la cámara hay que
    // aplicarla al decodificar; sin esto una foto vertical puede quedar acostada.
    bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch (error) {
    throw new ImagenNoProcesableError('no-legible', { cause: error });
  }
  try {
    const { ancho, alto } = dimensionesParaReencodear(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const contexto = canvas.getContext('2d');
    if (contexto === null) {
      throw new ImagenNoProcesableError('no-legible');
    }
    contexto.drawImage(bitmap, 0, 0, ancho, alto);

    let calidad = CALIDAD_INICIAL;
    for (;;) {
      const blob = await aJpeg(canvas, calidad);
      const siguiente = siguienteCalidad(blob.size, calidad);
      if (siguiente === null) {
        throw new ImagenNoProcesableError('demasiado-grande');
      }
      if (siguiente === calidad) {
        return blob;
      }
      calidad = siguiente;
    }
  } finally {
    bitmap.close();
  }
}
