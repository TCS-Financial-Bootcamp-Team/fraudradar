import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { AppShell } from "@/components/app-shell";
import { servidorSupabase } from "@/lib/supabase/server";
async function SessaoApp({ children }: { children: React.ReactNode }) {
  // O cliente de autenticação também consulta o relógio ao inicializar.
  await connection();
  const supabase = await servidorSupabase();
  if (!supabase) redirect("/login");
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
export default function LayoutApp({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <p className="p-6" role="status">
          Carregando sessão…
        </p>
      }
    >
      <SessaoApp>{children}</SessaoApp>
    </Suspense>
  );
}
