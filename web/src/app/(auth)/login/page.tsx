import { TelaAutenticacao } from "@/features/autenticacao/components/tela-autenticacao";
export default async function Login({ searchParams }: PageProps<"/login">) {
  const busca = await searchParams;
  return (
    <TelaAutenticacao
      modo="login"
      erro={typeof busca.erro === "string" ? busca.erro : undefined}
    />
  );
}
