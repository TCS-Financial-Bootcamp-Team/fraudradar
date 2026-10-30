"use client";
import { useTheme } from "next-themes";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useProfile } from "@/features/auth/hooks/use-profile";
import { profileSchema, type Profile } from "@/features/auth/schemas/auth";
import { HealthPanel } from "@/features/health/components/health-panel";
import { API_URL, USE_MOCKS } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { LoadingState, ResourceError } from "@/components/ui/states";

function ProfileForm({
  name,
  email,
  busy,
  onSave,
}: {
  name: string;
  email: string;
  busy: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Profile>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name },
  });
  return (
    <form
      onSubmit={handleSubmit((d) => onSave(d.name))}
      className="grid gap-5 p-6"
    >
      <Field label="Nome" error={errors.name?.message}>
        <Input autoComplete="name" {...register("name")} />
      </Field>
      <Field label="E-mail da conta">
        <Input type="email" value={email} readOnly />
      </Field>
      <Button type="submit" className="justify-self-start" disabled={busy}>
        {busy ? "Salvando…" : "Salvar perfil"}
      </Button>
    </form>
  );
}
export function Settings() {
  const profile = useProfile();
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
            {profile.loading ? (
              <div className="p-6">
                <LoadingState />
              </div>
            ) : profile.error || !profile.data ? (
              <ResourceError
                message={profile.error ?? "Perfil indisponível."}
                onRetry={profile.reload}
              />
            ) : (
              <ProfileForm
                key={profile.data.name}
                {...profile.data}
                busy={profile.busy}
                onSave={profile.save}
              />
            )}
          </section>
          <section className="panel">
            <h2 className="panel-title">Aparência</h2>
            <div className="p-6">
              <Field label="Tema da plataforma">
                <Select
                  value={theme ?? "system"}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  <option value="system">Seguir o sistema</option>
                  <option value="light">Claro</option>
                  <option value="dark">Escuro</option>
                </Select>
              </Field>
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
                  {USE_MOCKS
                    ? "Demonstração · dados simulados"
                    : "API de monitoramento"}
                </dd>
              </div>
            </dl>
          </section>
          <HealthPanel />
        </div>
      </div>
    </>
  );
}
