import { Suspense } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Explorador } from "@/features/registros/components/explorador";
export default async function Page() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  return (
    <Suspense fallback={<p className="p-10">Carregando a história…</p>}>
      <Explorador email={user.email ?? "Equipe"} />
    </Suspense>
  );
}
