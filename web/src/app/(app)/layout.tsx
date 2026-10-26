import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { servidorSupabase } from "@/lib/supabase/server";
export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const supabase = await servidorSupabase();
  if (!supabase) redirect("/login");
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
