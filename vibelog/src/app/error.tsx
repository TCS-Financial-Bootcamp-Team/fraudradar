"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-content-center gap-4 p-8">
      <h1 className="text-2xl">Não foi possível abrir o VibeLog.</h1>
      <p>Confira a conexão e tente novamente.</p>
      <button onClick={reset} className="campo">
        Tentar novamente
      </button>
    </main>
  );
}
