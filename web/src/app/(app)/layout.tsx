import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
async function AppSession({ children }: { children: React.ReactNode }) {
  // O cliente de autenticação também consulta o relógio ao inicializar.
  await connection();
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <p className="p-6" role="status">
          Carregando sessão…
        </p>
      }
    >
      <AppSession>{children}</AppSession>
    </Suspense>
  );
}
