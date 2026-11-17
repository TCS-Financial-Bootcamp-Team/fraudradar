"use client";

import { useTranslations } from "next-intl";
import { cn } from "cn";
import { accountAlias } from "@/lib/account-alias";

export interface AccountLabelProps {
  account: string | number;
  /** "stacked" exibe apelido acima e número abaixo; "inline" exibe lado a lado. */
  layout?: "stacked" | "inline";
  className?: string;
  aliasClassName?: string;
  numberClassName?: string;
}

/**
 * Exibe o apelido fictício determinístico junto ao número da conta.
 * Uso exclusivo visual para facilitar a leitura do analista.
 */
export function AccountLabel({
  account,
  layout = "stacked",
  className,
  aliasClassName,
  numberClassName,
}: AccountLabelProps) {
  const t = useTranslations("common.accountAlias");
  const accountText = String(account);
  const alias = accountAlias(account);

  return (
    <span
      title={t("hint")}
      className={cn(
        layout === "inline"
          ? "inline-flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5"
          : "inline-flex min-w-0 flex-col",
        className,
      )}
    >
      <span
        className={cn(
          "whitespace-nowrap text-[13px] font-medium leading-snug text-foreground",
          aliasClassName,
        )}
      >
        {alias}
      </span>
      <span
        className={cn(
          "font-mono text-xs leading-tight text-muted-foreground",
          numberClassName,
        )}
      >
        {accountText}
      </span>
    </span>
  );
}
