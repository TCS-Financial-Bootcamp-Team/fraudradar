"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppearancePanel, ThemePreviewCards, useAppTheme } from "@/components/theme";
import { useProfile } from "@/features/auth/hooks/use-profile";
import { profileSchema, type Profile } from "@/features/auth/schemas/auth";
import { HealthPanel } from "@/features/health/components/health-panel";
import { ProcessingSettingsCard } from "@/features/processing/components/processing-settings";
import { ModelSection } from "@/features/models/components/model-section";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { LocaleSwitcher } from "@/i18n/locale-switcher";

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
  const t = useTranslations("settings.profile");
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
      <Field label={t("name")} error={errors.name?.message}>
        <Input autoComplete="name" {...register("name")} />
      </Field>
      <Field label={t("role")}>
        <Input defaultValue={t("roleValue")} readOnly className="opacity-80" />
      </Field>
      <div className="sm:col-span-2 flex flex-col gap-1.5">
        <Field label={t("email")}>
          <Input type="email" value={email} readOnly className="opacity-80" />
        </Field>
        <span className="text-xs text-muted-foreground">
          {t("emailHint")}
        </span>
      </div>
      <div className="sm:col-span-2 pt-2">
        <Button type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

export function Settings() {
  const t = useTranslations("settings");
  const profile = useProfile();
  const { config, setConfig } = useAppTheme();
  const [showCustomizer, setShowCustomizer] = useState(
    config.mode === "custom"
  );

  return (
    <div className="flex flex-col gap-7 max-w-[880px]">
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-[13px] text-muted-foreground">
          {t("subtitle")}
        </p>
        <h1 className="m-0 text-[30px] font-semibold tracking-[-0.025em] leading-[1.15] text-foreground">
          {t("title")}
        </h1>
      </div>

      {/* Card 1: Perfil */}
      <section className="bg-card border border-border rounded-[14px] p-[22px] flex flex-col gap-4">
        <h2 className="m-0 text-sm font-semibold text-foreground">
          {t("profile.title")}
        </h2>
        {profile.loading ? (
          <div className="py-6">
            <LoadingState />
          </div>
        ) : profile.error || !profile.data ? (
          <ResourceError
            message={profile.error ?? t("profile.unavailable")}
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
            {t("appearance.title")}
          </h2>
          <button
            type="button"
            onClick={() => setShowCustomizer((prev) => !prev)}
            className="border-0 bg-transparent p-0 text-[13px] text-foreground underline underline-offset-[3px] cursor-pointer hover:opacity-80"
          >
            {showCustomizer
              ? t("appearance.hideCustomizer")
              : t("appearance.showCustomizer")}
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="grid gap-0.5">
            <span className="text-[13px] font-medium text-foreground">
              {t("appearance.language")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("appearance.languageHint")}
            </span>
          </div>
          <LocaleSwitcher />
        </div>

        {showCustomizer && (
          <div className="pt-4 border-t border-border">
            <AppearancePanel />
          </div>
        )}
      </section>

      <ProcessingSettingsCard />

      {/* Card 4: Modelo — versões, validação contra o gabarito e trava de promoção */}
      <ModelSection />

      {/* Card 5: Sistema */}
      <HealthPanel />
    </div>
  );
}
