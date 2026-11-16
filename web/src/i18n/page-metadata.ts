import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Título da aba: "<página> · <nome do produto>", no idioma do cookie.
export async function pageMetadata(
  item: "accounts" | "dashboard" | "alerts" | "monitoring" | "ingestion" | "settings",
): Promise<Metadata> {
  const nav = await getTranslations("shell.nav");
  const meta = await getTranslations("shell.meta");
  return { title: `${nav(`items.${item}`)} · ${meta("title")}` };
}
