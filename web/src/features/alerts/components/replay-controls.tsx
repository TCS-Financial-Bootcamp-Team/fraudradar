"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useReplay } from "../hooks/use-alerts";

export function ReplayControls() {
  const t = useTranslations("processing");
  const replay = useReplay();

  return (
    <Button
      type="button"
      onClick={() => void replay.advance()}
      disabled={replay.busy || !replay.nextRelease}
    >
      <RefreshCw
        className={replay.busy ? "size-4 animate-spin" : "size-4"}
      />
      {replay.busy ? t("working") : t("processNow")}
    </Button>
  );
}