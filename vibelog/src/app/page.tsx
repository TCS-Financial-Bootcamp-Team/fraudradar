import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { Explorer } from "@/features/records/components/explorer";
async function SessionGate() {
  await connection();
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  return <Explorer email={user.email ?? "Equipe"} />;
}
export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="p-10" role="status">
          Carregando a história…
        </p>
      }
    >
      <SessionGate />
    </Suspense>
  );
}
