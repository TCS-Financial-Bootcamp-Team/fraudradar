"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppearancePanel, ThemePreviewCards, useAppTheme } from "@/components/theme";
import { useProfile } from "@/features/auth/hooks/use-profile";
import { profileSchema, type Profile } from "@/features/auth/schemas/auth";
import { HealthPanel } from "@/features/health/components/health-panel";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
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
      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      <Field label="Nome" error={errors.name?.message}>
        <Input autoComplete="name" {...register("name")} />
      </Field>
      <Field label="Cargo">
        <Input defaultValue="Analista PLD" readOnly className="opacity-80" />
      </Field>
      <div className="sm:col-span-2 flex flex-col gap-1.5">
        <Field label="E-mail">
          <Input type="email" value={email} readOnly className="opacity-80" />
        </Field>
        <span className="text-xs text-muted-foreground">
          Vem do login; muda só pelo Supabase.
        </span>
      </div>
      <div className="sm:col-span-2 pt-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar perfil"}
        </Button>
      </div>
    </form>
  );
}

export function Settings() {
  const profile = useProfile();
  const { config, setConfig } = useAppTheme();
  const [showCustomizer, setShowCustomizer] = useState(
    config.mode === "custom"
  );

  return (
    <div className="flex flex-col gap-7 max-w-[880px]">
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-[13px] text-muted-foreground">
          Seu ambiente de trabalho
        </p>
        <h1 className="m-0 text-[30px] font-semibold tracking-[-0.025em] leading-[1.15] text-foreground">
          Configurações
        </h1>
      </div>

      {/* Card 1: Perfil */}
      <section className="bg-card border border-border rounded-[14px] p-[22px] flex flex-col gap-4">
        <h2 className="m-0 text-sm font-semibold text-foreground">Perfil</h2>
        {profile.loading ? (
          <div className="py-6">
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

      {/* Card 2: Aparência */}
      <section className="bg-card border border-border rounded-[14px] p-[22px] flex flex-col gap-3.5">
        <div className="flex justify-between items-baseline">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            Aparência
          </h2>
          <button
            type="button"
            onClick={() => setShowCustomizer((prev) => !prev)}
            className="border-0 bg-transparent p-0 text-[13px] text-foreground underline underline-offset-[3px] cursor-pointer hover:opacity-80"
          >
            {showCustomizer ? "Ocultar personalização" : "Personalizar cores"}
          </button>
        </div>

        <div>
          <ThemePreviewCards
            mode={config.mode}
            onSelectMode={(mode) => {
              setConfig((prev) => ({ ...prev, mode }));
              if (mode === "custom") setShowCustomizer(true);
            }}
            custom={config.custom}
          />
        </div>

        {showCustomizer && (
          <div className="pt-4 border-t border-border">
            <AppearancePanel />
          </div>
        )}
      </section>

      {/* Card 3: Sistema */}
      <HealthPanel />
    </div>
  );
}
