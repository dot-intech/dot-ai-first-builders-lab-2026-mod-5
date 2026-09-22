import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>NutraShot</h1>
      <p>
        <Link href="/dev-login">Acceso de QA</Link>
      </p>
    </main>
  );
}
