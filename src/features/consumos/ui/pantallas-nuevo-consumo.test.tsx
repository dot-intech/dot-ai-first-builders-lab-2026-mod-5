import type { ChangeEvent, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Borrador, CampoBorrador } from './flujo-nuevo-consumo';
import { PantallaBajaConfianza } from './pantalla-baja-confianza';
import { PantallaSesionVencida } from './pantalla-sesion-vencida';
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

const CONFIRMACION_OFF = {
  esManual: false,
  requiereConfirmacion: false,
  confirmado: false,
  onConfirmar: vi.fn(),
};

type BotonConOnClick = ReactElement<{ children?: ReactNode; onClick: () => void }>;

/** Igual que `inputsDe`, pero para los `<button>`: permite invocar su `onClick` sin DOM. */
function botonesDe(nodo: ReactNode): BotonConOnClick[] {
  if (nodo === null || nodo === undefined || typeof nodo !== 'object' || !('props' in nodo)) {
    return [];
  }
  const elemento = nodo as ReactElement<{ children?: ReactNode }>;
  const propios = elemento.type === 'button' ? [elemento as BotonConOnClick] : [];
  const hijos = elemento.props.children;
  const deHijos = (Array.isArray(hijos) ? hijos : [hijos]).flatMap((hijo: ReactNode) =>
    botonesDe(hijo),
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
          {...CONFIRMACION_OFF}
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
          {...CONFIRMACION_OFF}
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
          {...CONFIRMACION_OFF}
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
      ['confirmar-revision', 'Confirmá que revisaste la descripción y las calorías.'],
      ['guardado-sin-respuesta', 'No recibimos respuesta al guardar. Podés reintentar.'],
    ] as const)('muestra el texto del aviso %s', (aviso, texto) => {
      const html = renderToStaticMarkup(
        <PantallaRevision
          borrador={BORRADOR}
          {...CONFIRMACION_OFF}
          aviso={aviso}
          onCampoEditado={vi.fn()}
          onGuardar={vi.fn()}
          onCancelar={vi.fn()}
        />,
      );

      expect(html).toContain(`<p role="alert">${texto}</p>`);
    });

    it('no muestra ningún aviso cuando no está definido', () => {
      const html = renderToStaticMarkup(
        <PantallaRevision
          borrador={BORRADOR}
          {...CONFIRMACION_OFF}
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
          {...CONFIRMACION_OFF}
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
          ...CONFIRMACION_OFF,
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
        <PantallaError onReintentar={vi.fn()} onCancelar={vi.fn()} onCargarManual={vi.fn()} />,
      );

      expect(html).toContain('No pudimos analizar la imagen. Probá de nuevo.');
      expect(html).toContain('Reintentar');
      expect(html).toContain('Cancelar');
    });
  });

  describe('PantallaError con carga manual', () => {
    it('muestra "Cargar manualmente" y su onClick llama a onCargarManual', () => {
      const onCargarManual = vi.fn();
      const props = { onReintentar: vi.fn(), onCancelar: vi.fn(), onCargarManual };

      const html = renderToStaticMarkup(<PantallaError {...props} />);
      const boton = botonesDe(PantallaError(props)).find(
        (b) => b.props.children === 'Cargar manualmente',
      );

      expect(html).toContain('Cargar manualmente');
      expect(html).toContain('Reintentar');
      expect(html).toContain('Cancelar');
      boton?.props.onClick();
      expect(onCargarManual).toHaveBeenCalledTimes(1);
    });
  });

  describe('PantallaRevision con confirmación y carga manual', () => {
    const base = {
      borrador: BORRADOR,
      onCampoEditado: vi.fn(),
      onGuardar: vi.fn(),
      onCancelar: vi.fn(),
    };

    it('con requiereConfirmacion muestra la casilla y su onChange llama a onConfirmar', () => {
      const onConfirmar = vi.fn();
      const props = {
        ...base,
        esManual: false,
        requiereConfirmacion: true,
        confirmado: false,
        onConfirmar,
      };

      const html = renderToStaticMarkup(<PantallaRevision {...props} />);
      const casilla = inputsDe(PantallaRevision(props)).find(
        (i) => (i.props as { type?: string }).type === 'checkbox',
      );

      expect(html).toContain('Revisé la descripción y las calorías');
      expect(html).toContain('type="checkbox"');
      casilla?.props.onChange({ target: { checked: true } } as ChangeEvent<HTMLInputElement>);
      expect(onConfirmar).toHaveBeenCalledWith(true);
    });

    it('con confirmado true la casilla sale marcada', () => {
      const html = renderToStaticMarkup(
        <PantallaRevision
          {...base}
          esManual={false}
          requiereConfirmacion
          confirmado
          onConfirmar={vi.fn()}
        />,
      );

      expect(html).toContain('checked');
    });

    it('sin requiereConfirmacion no muestra la casilla', () => {
      const html = renderToStaticMarkup(
        <PantallaRevision
          {...base}
          esManual={false}
          requiereConfirmacion={false}
          confirmado={false}
          onConfirmar={vi.fn()}
        />,
      );

      expect(html).not.toContain('Revisé la descripción y las calorías');
      expect(html).not.toContain('checkbox');
    });

    it('en carga manual no muestra "Esta información es una estimación"; con foto sí', () => {
      const manual = renderToStaticMarkup(
        <PantallaRevision
          {...base}
          esManual
          requiereConfirmacion={false}
          confirmado={false}
          onConfirmar={vi.fn()}
        />,
      );
      const foto = renderToStaticMarkup(
        <PantallaRevision
          {...base}
          esManual={false}
          requiereConfirmacion={false}
          confirmado={false}
          onConfirmar={vi.fn()}
        />,
      );

      expect(manual).not.toContain('Esta información es una estimación');
      expect(foto).toContain('Esta información es una estimación');
    });
  });

  describe('PantallaBajaConfianza', () => {
    it('muestra la advertencia y los tres botones (AC-02, AC-03)', () => {
      const html = renderToStaticMarkup(
        <PantallaBajaConfianza
          onCargarOtraImagen={vi.fn()}
          onRevisarDatos={vi.fn()}
          onCancelar={vi.fn()}
        />,
      );

      expect(html).toContain('La estimación de esta foto es poco confiable');
      expect(html).toContain('Cargar otra imagen');
      expect(html).toContain('Revisar datos');
      expect(html).toContain('Cancelar');
      expect(html.match(/<button/g)).toHaveLength(3);
    });

    it('cada botón llama a su callback (AC-03, AC-05)', () => {
      const cargar = vi.fn();
      const revisar = vi.fn();
      const cancelar = vi.fn();
      const botones = botonesDe(
        PantallaBajaConfianza({
          onCargarOtraImagen: cargar,
          onRevisarDatos: revisar,
          onCancelar: cancelar,
        }),
      );
      expect(botones).toHaveLength(3);

      botones[0]?.props.onClick();
      expect([
        cargar.mock.calls.length,
        revisar.mock.calls.length,
        cancelar.mock.calls.length,
      ]).toEqual([1, 0, 0]);
      botones[1]?.props.onClick();
      expect([
        cargar.mock.calls.length,
        revisar.mock.calls.length,
        cancelar.mock.calls.length,
      ]).toEqual([1, 1, 0]);
      botones[2]?.props.onClick();
      expect([
        cargar.mock.calls.length,
        revisar.mock.calls.length,
        cancelar.mock.calls.length,
      ]).toEqual([1, 1, 1]);
    });
  });

  describe('PantallaSesionVencida', () => {
    it('muestra el mensaje y el botón "Iniciar sesión" (AC-08)', () => {
      const html = renderToStaticMarkup(<PantallaSesionVencida onIniciarSesion={vi.fn()} />);

      expect(html).toContain('Tu sesión venció.');
      expect(html).toContain('Iniciar sesión');
    });

    it('el botón llama a onIniciarSesion (AC-08)', () => {
      const espia = vi.fn();
      const botones = botonesDe(PantallaSesionVencida({ onIniciarSesion: espia }));
      expect(botones).toHaveLength(1);

      botones[0]?.props.onClick();

      expect(espia).toHaveBeenCalledTimes(1);
    });
  });

  describe('pantallas nuevas sin texto técnico', () => {
    it('no contienen endpoint, gemini, 500 ni stack', () => {
      const html = [
        renderToStaticMarkup(
          <PantallaBajaConfianza
            onCargarOtraImagen={vi.fn()}
            onRevisarDatos={vi.fn()}
            onCancelar={vi.fn()}
          />,
        ),
        renderToStaticMarkup(<PantallaSesionVencida onIniciarSesion={vi.fn()} />),
      ]
        .join('\n')
        .toLowerCase();

      for (const prohibido of ['/api', 'endpoint', 'gemini', '500', 'stack']) {
        expect(html).not.toContain(prohibido);
      }
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
            {...CONFIRMACION_OFF}
            aviso="error-al-guardar"
            onCampoEditado={vi.fn()}
            onGuardar={vi.fn()}
            onCancelar={vi.fn()}
          />,
        ),
        renderToStaticMarkup(<PantallaGuardando />),
        renderToStaticMarkup(<PantallaGuardado onRegistrarOtro={vi.fn()} />),
        renderToStaticMarkup(
          <PantallaError onReintentar={vi.fn()} onCancelar={vi.fn()} onCargarManual={vi.fn()} />,
        ),
      ].join('\n');

      for (const prohibido of ['gemini', 'generativelanguage', 'apiKey', 'inlineData']) {
        expect(htmls.toLowerCase()).not.toContain(prohibido.toLowerCase());
      }
    });
  });
});
