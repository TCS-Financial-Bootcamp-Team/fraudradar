import { TelaAutenticacao } from "@/features/autenticacao/components/tela-autenticacao";
import { Suspense } from "react";
async function Formulario({ searchParams }: PageProps<"/recuperar-senha">) {
  const busca = await searchParams;
  return (
    <TelaAutenticacao
      modo={busca.modo === "redefinir" ? "redefinir" : "recuperar"}
    />
  );
}
export default function Recuperar(props: PageProps<"/recuperar-senha">) {
  return (
    <Suspense fallback={<p role="status">Carregando recuperação…</p>}>
      <Formulario {...props} />
    </Suspense>
  );
}
