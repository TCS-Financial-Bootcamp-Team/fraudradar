import Link from "next/link";
import { Radar } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations("shell.errorPages");
  return (
    <main className="grid min-h-[70dvh] place-content-center gap-4 p-8 text-center">
      <Radar className="mx-auto size-12 text-primary" />
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">
        {t("notFoundBody")}
      </p>
      <Link className="text-primary underline" href="/accounts">
        {t("backHome")}
      </Link>
    </main>
  );
}
