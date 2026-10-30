"use client";

import { useCallback, useEffect, useState } from "react";

import type { Health } from "../schemas/health";
import { fetchHealth } from "../services/health-service";

type HealthState =
  | { status: "loading" }
  | { status: "ok"; health: Health }
  | { status: "error"; message: string };

export function useHealth() {
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
          message: error instanceof Error ? error.message : "API inacessível",
        });
      });
    return () => controller.abort();
  }, [version]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setVersion((v) => v + 1);
  }, []);

  return { state, reload };
}
