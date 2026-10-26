import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

async function Redirecionar() {
  await connection();
  return redirect("/dashboard");
}

export default function Inicio() {
  return (
    <Suspense fallback={<p role="status">Abrindo painel…</p>}>
      <Redirecionar />
    </Suspense>
  );
}
