"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { Health } from "../schemas/health";
import { fetchHealth } from "../services/health-service";

type HealthState =
  | { status: "loading" }
  | { status: "ok"; health: Health }
  | { status: "error"; message: string };

export function useHealth() {
  const t = useTranslations("health");
  const [state, setState] = useState<HealthState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => setState({ status: "ok", health }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : t("apiUnreachableShort"),
        });
      });
    return () => controller.abort();
  }, [version, t]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setVersion((v) => v + 1);
  }, []);

  return { state, reload };
}
