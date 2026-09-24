import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { env } from '../../env';
import { NOMBRE_COOKIE_SESION } from '../../shared/sesion/ui/cookie-sesion';
import { esEntornoPermitidoParaAccesoQa } from '../../features/qa-access/domain/rules';
import { qaBackdoorLogin } from '../../features/qa-access/ui/actions';
import { resolverEstadoSesion } from '../../features/qa-access/ui/estado-sesion';
import { QaLoginButton } from '../../features/qa-access/ui/qa-login-button';

export const dynamic = 'force-dynamic';

type DevLoginPageProps = {
  searchParams: Promise<{ error?: string | string[] }>;
};

export default async function DevLoginPage({ searchParams }: DevLoginPageProps) {
  // Segunda capa, independiente de la server action: en un entorno no permitido la ruta no existe.
  if (!esEntornoPermitidoParaAccesoQa(env.nodeEnv)) {
    notFound();
  }

  const estado = await resolverEstadoSesion((await cookies()).get(NOMBRE_COOKIE_SESION)?.value);

  if (estado.tipo === 'conectada') {
    return (
      <main>
        <p>Conectado como {estado.email}</p>
      </main>
    );
  }

  if (estado.tipo === 'error') {
    return (
      <main>
        <p>No se pudo verificar la sesión</p>
      </main>
    );
  }

  const { error } = await searchParams;

  return (
    <main>
      {error === '1' && <p>No se pudo iniciar sesión</p>}
      <form action={qaBackdoorLogin}>
        <QaLoginButton />
      </form>
    </main>
  );
}
