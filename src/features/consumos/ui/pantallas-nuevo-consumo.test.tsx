import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Borrador, CampoBorrador } from './flujo-nuevo-consumo';
import {
  PantallaError,
  PantallaGuardado,
  PantallaGuardando,
  PantallaInicio,
  PantallaProcesando,
  PantallaRevision,
} from './pantallas-nuevo-consumo';

const BORRADOR: Borrador = {
  descripcion: 'Milanesa con puré',
  calorias: '650',
  carbohidratos: '30',
  proteinas: '40',
  grasas: '25',
  otros: '5',
};

/**
 * `renderToStaticMarkup` (ADR-008) da HTML, no los `props` de cada elemento: para probar que un
 * `onChange` despacha lo que corresponde hay que recorrer el árbol de `ReactElement` que devuelve
 * el propio componente (llamado como función, sin JSX) y quedarse con los `<input>`.
 */
type InputConOnChange = ReactElement<{
  onChange: (evento: ChangeEvent<HTMLInputElement>) => void;
}>;

function inputsDe(nodo: ReactNode): InputConOnChange[] {
  if (nodo === null || nodo === undefined || typeof nodo !== 'object' || !('props' in nodo)) {
    return [];
  }
  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  const propios = elemento.type === 'input' ? [elemento as InputConOnChange] : [];
  const hijos = elemento.props.children;
  const deHijos = (Array.isArray(hijos) ? hijos : [hijos]).flatMap((hijo: ReactNode) =>
    inputsDe(hijo),
  );
  return [...propios, ...deHijos];
}

function eventoConArchivos(archivos: File[]): ChangeEvent<HTMLInputElement> {
  return { target: { files: archivos } } as unknown as ChangeEvent<HTMLInputElement>;
}

function eventoConValor(valor: string): ChangeEvent<HTMLInputElement> {
  return { target: { value: valor } } as unknown as ChangeEvent<HTMLInputElement>;
}

describe('pantallas-nuevo-consumo', () => {
  describe('PantallaInicio', () => {
    it('renderiza un input con capture="environment" y otro sin capture, ambos accept="image/*"', () => {
      const html = renderToStaticMarkup(<PantallaInicio onSeleccionarImagen={vi.fn()} />);

      const inputs = html.match(/<input[^>]*>/g) ?? [];
      expect(inputs).toHaveLength(2);
      expect(inputs.every((input) => input.includes('accept="image/*"'))).toBe(true);
      expect(inputs.some((input) => input.includes('capture="environment"'))).toBe(true);
      expect(inputs.some((input) => !input.includes('capture='))).toBe(true);
    });

    it('renderiza un link "Cancelar" con href="/"', () => {
      const html = renderToStaticMarkup(<PantallaInicio onSeleccionarImagen={vi.fn()} />);

      expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Cancelar<\/a>/);
    });

    // H-1 (VERIFY, loop correctivo): `renderToStaticMarkup` no ejecuta eventos, así que nada
    // probaba que el input de cámara despache 'camara' y el de galería 'galeria'. Si se
    // invirtieran, un consumo fotografiado con la cámara quedaría guardado como 'galeria' sin que
    // ningún test lo note.
    it("el input con capture despacha 'camara' y el otro despacha 'galeria'", () => {
      const espia = vi.fn();
      const inputs = inputsDe(PantallaInicio({ onSeleccionarImagen: espia }));
      expect(inputs).toHaveLength(2);

      const archivoCamara = {} as File;
      inputs[0]?.props.onChange(eventoConArchivos([archivoCamara]));
      expect(espia).toHaveBeenCalledWith(archivoCamara, 'camara');

      const archivoGaleria = {} as File;
      inputs[1]?.props.onChange(eventoConArchivos([archivoGaleria]));
      expect(espia).toHaveBeenCalledWith(archivoGaleria, 'galeria');
    });

    it('no llama a onSeleccionarImagen si se cancela la selección (sin archivo)', () => {
      const espia = vi.fn();
      const inputs = inputsDe(PantallaInicio({ onSeleccionarImagen: espia }));

      inputs[0]?.props.onChange(eventoConArchivos([]));

      expect(espia).not.toHaveBeenCalled();
    });

    // W-3 (ronda 3 del Block 8): el link quedó afuera al pasar de selectores por etiqueta a clases
    // explícitas (A-F1); sin `class`, no tiene el alto táctil mínimo de 44px. No se afirma el
    // valor de la clase (ADR-008, está hasheada), solo que el atributo esté presente.
    it('el link "Cancelar" tiene una clase de estilos (alto táctil mínimo)', () => {
      const html = renderToStaticMarkup(<PantallaInicio onSeleccionarImagen={vi.fn()} />);

      expect(html).toMatch(/<a[^>]*class="[^"]+"[^>]*href="\/"/);
    });
  });

  describe('PantallaProcesando', () => {
    it('renderiza el indicador con role="status" y el botón "Cancelar"', () => {
      const html = renderToStaticMarkup(<PantallaProcesando onCancelar={vi.fn()} />);

      expect(html).toMatch(/role="status"[^>]*>Analizando tu foto/);
      expect(html).toContain('Cancelar');
    });
  });

  describe('PantallaRevision', () => {
    it('muestra la descripción, las calorías y los 4 porcentajes con sus etiquetas como campos editables', () => {
      const html = renderToStaticMarkup(
        <PantallaRevision
          borrador={BORRADOR}
          onCampoEditado={vi.fn()}
          onGuardar={vi.fn()}
          onCancelar={vi.fn()}
        />,
      );

      expect(html).toContain('value="Milanesa con puré"');
      expect(html).toContain('value="650"');
      expect(html).toContain('value="30"');
      expect(html).toContain('value="40"');
      expect(html).toContain('value="25"');
      expect(html).toContain('value="5"');
      expect(html).toContain('Carbohidratos');
      expect(html).toContain('Proteínas');
      expect(html).toContain('Grasas');
      expect(html).toContain('Otros Nutrientes');
      // W-1 (ronda 2 del Block 8): que muestre el valor no alcanza para "editable"; si Calorías (u
      // otro campo) se volviera de solo lectura, este test debe fallar.
      expect(html).not.toContain('readOnly');
      expect(html).not.toContain('disabled');
    });

    it('valida los límites de entrada del Block 8 (maxLength de descripción, min/max de cada campo numérico)', () => {
      const html = renderToStaticMarkup(
        <PantallaRevision
          borrador={BORRADOR}
          onCampoEditado={vi.fn()}
          onGuardar={vi.fn()}
          onCancelar={vi.fn()}
        />,
      );

      // W-2 (ronda 2 del Block 8): falla si se saca `maxLength` de descripción o si el `max` de un
      // porcentaje sube por encima de 100 (p. ej. a 1000).
      expect(html).toContain('maxLength="500"');
      expect(html).toContain('max="10000"'); // calorías (CALORIAS_MAX)
      const maxCienPorcentajes = html.match(/max="100"/g) ?? [];
      expect(maxCienPorcentajes).toHaveLength(4); // carbohidratos, proteínas, grasas, otros
      expect(html).not.toContain('max="1000"');

      // W-2 residual (ronda 3 del Block 8): falla si falta `min="0"`, `step="1"` o si `inputMode`
      // deja de ser "numeric" en calorías o en cualquiera de los 4 porcentajes (5 campos en total).
      expect(html.match(/min="0"/g) ?? []).toHaveLength(5);
      expect(html.match(/step="1"/g) ?? []).toHaveLength(5);
      expect(html.match(/inputMode="numeric"/g) ?? []).toHaveLength(5);
    });

    it('incluye la línea "puede ser inexacta"', () => {
      const html = renderToStaticMarkup(
        <PantallaRevision
          borrador={BORRADOR}
          onCampoEditado={vi.fn()}
          onGuardar={vi.fn()}
          onCancelar={vi.fn()}
        />,
      );

      expect(html).toContain('puede ser inexacta');
    });

    it.each([
      ['desglose-no-suma-100', 'Los porcentajes deben sumar 100.'],
      ['datos-invalidos', 'Revisá los datos: hay valores que no son válidos.'],
      ['error-al-guardar', 'No pudimos guardar. Probá de nuevo.'],
    ] as const)('muestra el texto del aviso %s', (aviso, texto) => {
      const html = renderToStaticMarkup(
        <PantallaRevision
          borrador={BORRADOR}
          aviso={aviso}
          onCampoEditado={vi.fn()}
          onGuardar={vi.fn()}
          onCancelar={vi.fn()}
        />,
      );

      expect(html).toContain(texto);
    });

    it('no muestra ningún aviso cuando no está definido', () => {
      const html = renderToStaticMarkup(
        <PantallaRevision
          borrador={BORRADOR}
          onCampoEditado={vi.fn()}
          onGuardar={vi.fn()}
          onCancelar={vi.fn()}
        />,
      );

      expect(html).not.toContain('deben sumar 100');
      expect(html).not.toContain('no son válidos');
      expect(html).not.toContain('Probá de nuevo');
    });

    it('renderiza los botones Guardar y Cancelar', () => {
      const html = renderToStaticMarkup(
        <PantallaRevision
          borrador={BORRADOR}
          onCampoEditado={vi.fn()}
          onGuardar={vi.fn()}
          onCancelar={vi.fn()}
        />,
      );

      expect(html).toContain('Guardar');
      expect(html).toContain('Cancelar');
    });

    // H-1 (VERIFY, loop correctivo): igual que en PantallaInicio, nada probaba que cada input
    // edite su propio campo del borrador. Si dos campos se cruzaran (p. ej. "Proteínas" editando
    // "grasas"), ningún test lo detectaría.
    it('cada input llama a onCampoEditado con su propio campo (AC-11)', () => {
      const espia = vi.fn();
      const inputs = inputsDe(
        PantallaRevision({
          borrador: BORRADOR,
          onCampoEditado: espia,
          onGuardar: vi.fn(),
          onCancelar: vi.fn(),
        }),
      );
      const camposEnOrden: CampoBorrador[] = [
        'descripcion',
        'calorias',
        'carbohidratos',
        'proteinas',
        'grasas',
        'otros',
      ];
      expect(inputs).toHaveLength(camposEnOrden.length);

      camposEnOrden.forEach((campo, indice) => {
        espia.mockClear();
        inputs[indice]?.props.onChange(eventoConValor('42'));
        expect(espia).toHaveBeenCalledWith(campo, '42');
      });
    });
  });

  describe('PantallaGuardando', () => {
    it('muestra el indicador con role="status" y no tiene botón "Cancelar"', () => {
      const html = renderToStaticMarkup(<PantallaGuardando />);

      expect(html).toMatch(/role="status"[^>]*>Guardando/);
      expect(html).not.toContain('Cancelar');
    });
  });

  describe('PantallaGuardado', () => {
    it('muestra "Consumo guardado" y el botón "Registrar otro"', () => {
      const html = renderToStaticMarkup(<PantallaGuardado onRegistrarOtro={vi.fn()} />);

      expect(html).toContain('Consumo guardado');
      expect(html).toContain('Registrar otro');
    });
  });

  describe('PantallaError', () => {
    it('muestra el mensaje fijo y los botones "Reintentar" y "Cancelar"', () => {
      const html = renderToStaticMarkup(
        <PantallaError onReintentar={vi.fn()} onCancelar={vi.fn()} />,
      );

      expect(html).toContain('No pudimos analizar la imagen. Probá de nuevo.');
      expect(html).toContain('Reintentar');
      expect(html).toContain('Cancelar');
    });
  });

  describe('sin fugas de detalles técnicos (AC-10)', () => {
    it('ninguna pantalla contiene gemini, generativelanguage, apiKey ni inlineData en el HTML', () => {
      const htmls = [
        renderToStaticMarkup(<PantallaInicio onSeleccionarImagen={vi.fn()} />),
        renderToStaticMarkup(<PantallaProcesando onCancelar={vi.fn()} />),
        renderToStaticMarkup(
          <PantallaRevision
            borrador={BORRADOR}
            aviso="error-al-guardar"
            onCampoEditado={vi.fn()}
            onGuardar={vi.fn()}
            onCancelar={vi.fn()}
          />,
        ),
        renderToStaticMarkup(<PantallaGuardando />),
        renderToStaticMarkup(<PantallaGuardado onRegistrarOtro={vi.fn()} />),
        renderToStaticMarkup(<PantallaError onReintentar={vi.fn()} onCancelar={vi.fn()} />),
      ].join('\n');

      for (const prohibido of ['gemini', 'generativelanguage', 'apiKey', 'inlineData']) {
        expect(htmls.toLowerCase()).not.toContain(prohibido.toLowerCase());
      }
    });
  });
});
