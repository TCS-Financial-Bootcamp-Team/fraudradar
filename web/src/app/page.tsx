import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

async function RedirectToDashboard() {
  await connection();
  return redirect("/dashboard");
}

export default function HomePage() {
  return (
    <Suspense fallback={<p role="status">Abrindo painel…</p>}>
      <RedirectToDashboard />
    </Suspense>
  );
}
