import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Login } from "@/features/autenticacao/components/login";
export default async function Page() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user) redirect("/");
  return <Login />;
}
