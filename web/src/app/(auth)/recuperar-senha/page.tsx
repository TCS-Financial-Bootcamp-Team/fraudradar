import { TelaAutenticacao } from "@/features/autenticacao/components/tela-autenticacao";
export default async function Recuperar({
  searchParams,
}: PageProps<"/recuperar-senha">) {
  const busca = await searchParams;
  return (
    <TelaAutenticacao
      modo={busca.modo === "redefinir" ? "redefinir" : "recuperar"}
    />
  );
}
