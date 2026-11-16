"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { LOCALES, writeLocaleCookie, type AppLocale } from "./config";

const SHORT_LABEL: Record<AppLocale, string> = { "pt-BR": "PT", en: "EN" };

// Grava o cookie NEXT_LOCALE e pede ao servidor que renderize de novo no idioma escolhido.
export function LocaleSwitcher({
  variant = "default",
  className,
}: {
  variant?: "default" | "topbar";
  className?: string;
}) {
  const t = useTranslations("common.language");
  const locale = useLocale();
  const router = useRouter();

  const choose = (next: AppLocale) => {
    if (next === locale) return;
    writeLocaleCookie(next);
    router.refresh();
  };

  const topbar = variant === "topbar";
  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-lg border p-0.5 text-xs font-medium",
        topbar ? "border-topbar-border" : "border-border",
        className,
      )}
    >
      {LOCALES.map((item) => {
        const active = item === locale;
        const name = t(item === "en" ? "english" : "portuguese");
        return (
          <button
            key={item}
            type="button"
            lang={item}
            aria-pressed={active}
            aria-label={name}
            title={name}
            onClick={() => choose(item)}
            className={cn(
              "grid h-8 min-w-8 place-items-center rounded-md px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2",
              topbar
                ? "focus-visible:ring-topbar-foreground"
                : "focus-visible:ring-ring",
              active
                ? topbar
                  ? "bg-topbar-border text-topbar-foreground"
                  : "bg-primary text-primary-foreground"
                : topbar
                  ? "text-topbar-muted hover:text-topbar-foreground"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {SHORT_LABEL[item]}
          </button>
        );
      })}
    </div>
  );
}
