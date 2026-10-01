'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useRef } from 'react';
import { TIEMPO_LIMITE_GUARDADO_MS } from '../domain/rules';
import { analizarFotoConsumo, guardarNuevoConsumo } from './actions';
import { reencodearComoJpeg } from './canvas-imagen';
import {
  ESTADO_INICIAL,
  reducirFlujo,
  type CampoBorrador,
  type EventoFlujo,
  type OrigenFoto,
} from './flujo-nuevo-consumo';
import estilos from './nuevo-consumo.module.css';
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
import { procesarGuardado, procesarImagen } from './procesar-imagen';

/*
 * Contenedor fino (ADR-008): toda decisión vive en el reductor (`flujo-nuevo-consumo.ts`); esto
 * solo cablea eventos del navegador, timers y las server actions. Excluido de cobertura (ADR-008,
 * `vitest.config.ts`): canvas y `useEffect` no se pueden ejercitar en `node`.
 */

// Cubre el reencodeo y la action: ninguna espera supera 30 s desde que se eligió la foto (NFR-02).
const TIEMPO_LIMITE_MS = 30_000;

export function NuevoConsumo() {
  const [estado, despachar] = useReducer(reducirFlujo, ESTADO_INICIAL);
  const router = useRouter();
  // La foto elegida no vive en el estado del reductor (no es serializable ni parte del dominio):
  // se guarda aparte, indexada por `solicitudId`, para que el efecto de análisis la recupere.
  const archivoElegidoRef = useRef<{ solicitudId: string; archivo: File } | null>(null);
  // Evita el doble-análisis por el doble montaje de efectos de StrictMode en dev (nota I-5,
  // revisión del Block 7): sin este ref, un remount volvería a llamar a la action.
  const analisisDisparadoRef = useRef<string | null>(null);
  const guardadoDisparadoRef = useRef<string | null>(null);

  function despacharEvento(evento: EventoFlujo) {
    despachar(evento);
  }

  // Temporizador de guardado (NFR-03): al entrar a `guardando` corta a los 30 s y vuelve a la
  // revisión con el borrador; se limpia al salir. El reintento reusa el `solicitudId` (idempotente).
  useEffect(() => {
    if (estado.tipo !== 'guardando') {
      return;
    }
    const { solicitudId } = estado;
    const temporizador = setTimeout(() => {
      despacharEvento({ tipo: 'guardado-tiempo-agotado', solicitudId });
    }, TIEMPO_LIMITE_GUARDADO_MS);
    return () => clearTimeout(temporizador);
  }, [estado]);

  // Temporizador de 30 s: arranca al entrar a `procesando` (justo lo que dispara `imagen-elegida`)
  // y se limpia al salir de ese estado, para cualquier motivo.
  useEffect(() => {
    if (estado.tipo !== 'procesando') {
      return;
    }
    const { solicitudId } = estado;
    const temporizador = setTimeout(() => {
      despacharEvento({ tipo: 'tiempo-agotado', solicitudId });
    }, TIEMPO_LIMITE_MS);
    return () => clearTimeout(temporizador);
  }, [estado]);

  // Análisis de la foto: reacciona a la transición a `procesando`, nunca al `onChange` directamente.
  useEffect(() => {
    if (estado.tipo !== 'procesando') {
      return;
    }
    const { solicitudId } = estado;
    if (analisisDisparadoRef.current === solicitudId) {
      return;
    }
    analisisDisparadoRef.current = solicitudId;

    const elegido = archivoElegidoRef.current;
    if (elegido === null || elegido.solicitudId !== solicitudId) {
      despacharEvento({ tipo: 'analisis-fallo', solicitudId });
      return;
    }

    procesarImagen(
      { archivo: elegido.archivo, solicitudId },
      { reencodear: reencodearComoJpeg, analizar: analizarFotoConsumo },
    ).then(despacharEvento);
  }, [estado]);

  // Guardado: reacciona a la transición a `guardando` (Block 7), nunca al clic de "Guardar": así
  // un doble clic no dispara un segundo insert (ya lo evita el reductor) y aquí, además, un
  // remount de StrictMode tampoco lo dispara dos veces. El reductor (`pedirGuardado`, Block 7,
  // 27aae3e) exige que `evento.solicitudId` coincida con el de la revisión vigente, así que
  // `onGuardar` reenvía siempre `estado.solicitudId` (no un id nuevo) y un reintento tras
  // `guardado-fallo` llega con el MISMO id que el intento fallido (`guardado-fallo` conserva el id
  // al volver a `revision`). Por eso este ref, por sí solo, no alcanza para distinguir "reintento
  // legítimo" de "remount de StrictMode del mismo intento": ambos comparten el mismo `solicitudId`.
  // La diferencia real es otra: el remount de StrictMode ocurre SIN que el estado deje de ser
  // `guardando` en el medio; un reintento, en cambio, pasa por `revision` (u otro estado) antes de
  // volver a `guardando`. Por eso el ref se libera en la rama `else` de abajo apenas se sale de
  // `guardando`: un remount (mismo montaje, mismo estado `guardando`) nunca pasa por esa rama, así
  // que sigue bloqueado; un reintento sí, porque antes pasó por `revision` (ronda 3, S-F1).
  useEffect(() => {
    if (estado.tipo !== 'guardando') {
      guardadoDisparadoRef.current = null;
      return;
    }
    const { solicitudId, origen, borrador } = estado;
    if (guardadoDisparadoRef.current === solicitudId) {
      return;
    }
    guardadoDisparadoRef.current = solicitudId;

    procesarGuardado({ borrador, origen, solicitudId }, { guardar: guardarNuevoConsumo }).then(
      despacharEvento,
    );
  }, [estado]);

  function manejarSeleccionarImagen(archivo: File, origen: OrigenFoto) {
    const solicitudId = crypto.randomUUID();
    archivoElegidoRef.current = { solicitudId, archivo };
    despacharEvento({ tipo: 'imagen-elegida', origen, solicitudId });
  }

  function manejarCampoEditado(campo: CampoBorrador, valor: string) {
    despacharEvento({ tipo: 'campo-editado', campo, valor });
  }

  function manejarCancelar() {
    despacharEvento({ tipo: 'cancelar' });
  }

  function pantalla() {
    switch (estado.tipo) {
      case 'inicio':
        return <PantallaInicio onSeleccionarImagen={manejarSeleccionarImagen} />;
      case 'procesando':
        return <PantallaProcesando onCancelar={manejarCancelar} />;
      case 'revision':
        return (
          <PantallaRevision
            borrador={estado.borrador}
            esManual={estado.origen === 'manual'}
            requiereConfirmacion={estado.requiereConfirmacion}
            confirmado={estado.confirmado}
            onConfirmar={(confirmado) =>
              despacharEvento({ tipo: 'confirmar-revision', confirmado })
            }
            aviso={estado.aviso}
            onCampoEditado={manejarCampoEditado}
            // El reductor (`pedirGuardado`, Block 7, 27aae3e) exige que el id coincida con el de
            // la revisión vigente: reenviar `estado.solicitudId` (no uno nuevo) es lo que ese
            // contrato pide. La protección contra el doble-disparo de StrictMode en un reintento
            // con este MISMO id vive en el efecto de guardado, no acá (ronda 3, S-F1).
            onGuardar={() => despacharEvento({ tipo: 'guardar', solicitudId: estado.solicitudId })}
            onCancelar={manejarCancelar}
          />
        );
      case 'baja-confianza':
        return (
          <PantallaBajaConfianza
            onCargarOtraImagen={() => despacharEvento({ tipo: 'cargar-otra-imagen' })}
            onRevisarDatos={() => despacharEvento({ tipo: 'continuar-a-revision' })}
            onCancelar={manejarCancelar}
          />
        );
      case 'guardando':
        return <PantallaGuardando />;
      case 'sesion-vencida':
        // Solo refresca: la página redirige a `RUTA_LOGIN` (MC-6). El borrador ya no está en el
        // estado (MC-8).
        return <PantallaSesionVencida onIniciarSesion={() => router.refresh()} />;
      case 'guardado':
        return (
          <PantallaGuardado onRegistrarOtro={() => despacharEvento({ tipo: 'registrar-otro' })} />
        );
      case 'error':
        return (
          <PantallaError
            onReintentar={() => despacharEvento({ tipo: 'reintentar' })}
            onCargarManual={() =>
              despacharEvento({ tipo: 'carga-manual', solicitudId: crypto.randomUUID() })
            }
            onCancelar={manejarCancelar}
          />
        );
      default:
        // Exhaustivo en compilación: un `tipo` nuevo en `EstadoFlujo` sin su `case` no compila.
        estado satisfies never;
        return null;
    }
  }

  return <div className={estilos.contenedor}>{pantalla()}</div>;
}
