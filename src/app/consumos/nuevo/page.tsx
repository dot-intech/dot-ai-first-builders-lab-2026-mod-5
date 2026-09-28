import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolverUsuarioConsumo } from '../../../features/consumos/ui/sesion-consumo';
import { NuevoConsumo } from '../../../features/consumos/ui/nuevo-consumo';
import { NOMBRE_COOKIE_SESION } from '../../../shared/sesion/ui/cookie-sesion';
import { RUTA_LOGIN } from '../../rutas';

// Depende de la cookie de sesión en cada request: no se puede cachear ni generar estáticamente.
export const dynamic = 'force-dynamic';

export default async function NuevoConsumoPage() {
  const token = (await cookies()).get(NOMBRE_COOKIE_SESION)?.value;
  const resultado = await resolverUsuarioConsumo(token);

  if (resultado.tipo === 'sin-sesion') {
    // En producción `/dev-login` no existe: la redirección termina en 404 (D1).
    redirect(RUTA_LOGIN);
  }

  if (resultado.tipo === 'error') {
    return (
      <main>
        <p>No se pudo verificar la sesión</p>
      </main>
    );
  }

  return <NuevoConsumo />;
}
