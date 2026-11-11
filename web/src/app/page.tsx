import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

async function RedirectToAccounts() {
  await connection();
  return redirect("/accounts");
}

export default function HomePage() {
  return (
    <Suspense fallback={<p role="status">Abrindo painel…</p>}>
      <RedirectToAccounts />
    </Suspense>
  );
}
