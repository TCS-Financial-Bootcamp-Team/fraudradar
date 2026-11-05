import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SIDEBAR_COOKIE, isSidebarOpenFromCookie } from "@/lib/sidebar";

async function AppSession({ children }: { children: React.ReactNode }) {
  // O cliente de autenticação também consulta o relógio ao inicializar.
  await connection();
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get(SIDEBAR_COOKIE)?.value;
  const initialSidebarOpen = isSidebarOpenFromCookie(sidebarCookie);
  return (
    <AppShell initialSidebarOpen={initialSidebarOpen}>
      {children}
    </AppShell>
  );
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
