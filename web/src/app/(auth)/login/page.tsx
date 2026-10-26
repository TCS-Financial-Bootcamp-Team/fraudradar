import { TelaAutenticacao } from "@/features/autenticacao/components/tela-autenticacao";
import { Suspense } from "react";
async function Formulario({ searchParams }: PageProps<"/login">) {
  const busca = await searchParams;
  return (
    <TelaAutenticacao
      modo="login"
      erro={typeof busca.erro === "string" ? busca.erro : undefined}
    />
  );
}
export default function Login(props: PageProps<"/login">) {
  return (
    <Suspense fallback={<p role="status">Carregando login…</p>}>
      <Formulario {...props} />
    </Suspense>
  );
}
