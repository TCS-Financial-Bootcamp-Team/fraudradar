"use client";
import { useTheme } from "next-themes";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePerfil } from "@/features/autenticacao/hooks/use-perfil";
import {
  perfilSchema,
  type Perfil,
} from "@/features/autenticacao/schemas/autenticacao";
import { PainelSaude } from "@/features/saude/components/painel-saude";
import { API_URL, USA_MOCKS } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/campo";
import { Carregando, ErroRecurso } from "@/components/ui/estados";

function FormPerfil({
  nome,
  email,
  ocupado,
  salvar,
}: {
  nome: string;
  email: string;
  ocupado: boolean;
  salvar: (nome: string) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Perfil>({
    resolver: zodResolver(perfilSchema),
    defaultValues: { nome },
  });
  return (
    <form
      onSubmit={handleSubmit((d) => salvar(d.nome))}
      className="grid gap-5 p-6"
    >
      <Campo nome="Nome" erro={errors.nome?.message}>
        <Input autoComplete="name" {...register("nome")} />
      </Campo>
      <Campo nome="E-mail da conta">
        <Input type="email" value={email} readOnly />
      </Campo>
      <Button type="submit" className="justify-self-start" disabled={ocupado}>
        {ocupado ? "Salvando…" : "Salvar perfil"}
      </Button>
    </form>
  );
}
export function Configuracoes() {
  const r = usePerfil();
  const { theme, setTheme } = useTheme();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Seu ambiente de trabalho</p>
          <h1>Configurações</h1>
          <p>Gerencie seu perfil, aparência e conexão com o sistema.</p>
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <section className="panel">
            <h2 className="panel-title">Perfil do analista</h2>
            {r.carregando ? (
              <div className="p-6">
                <Carregando />
              </div>
            ) : r.erro || !r.dados ? (
              <ErroRecurso
                mensagem={r.erro ?? "Perfil indisponível."}
                tentar={r.recarregar}
              />
            ) : (
              <FormPerfil
                key={r.dados.nome}
                {...r.dados}
                ocupado={r.ocupado}
                salvar={r.salvar}
              />
            )}
          </section>
          <section className="panel">
            <h2 className="panel-title">Aparência</h2>
            <div className="p-6">
              <Campo nome="Tema da plataforma">
                <Select
                  value={theme ?? "system"}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  <option value="system">Seguir o sistema</option>
                  <option value="light">Claro</option>
                  <option value="dark">Escuro</option>
                </Select>
              </Campo>
            </div>
          </section>
        </div>
        <div className="grid gap-6">
          <section className="panel">
            <h2 className="panel-title">Conexão da plataforma</h2>
            <dl className="grid gap-5 p-6 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">
                  Endereço da API
                </dt>
                <dd className="mt-2 break-all font-mono text-xs">{API_URL}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Origem dos dados
                </dt>
                <dd className="mt-2">
                  {USA_MOCKS
                    ? "Demonstração · dados simulados"
                    : "API de monitoramento"}
                </dd>
              </div>
            </dl>
          </section>
          <PainelSaude />
        </div>
      </div>
    </>
  );
}
