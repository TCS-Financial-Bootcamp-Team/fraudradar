"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { API_URL } from "@/lib/api";

import { useHealth } from "../hooks/use-health";

function HealthItem({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {detail}
        <Badge variant={ok ? "default" : "destructive"}>
          {ok ? "ok" : "fora"}
        </Badge>
      </span>
    </li>
  );
}

export function HealthPanel() {
  const { state, reload } = useHealth();

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Saúde do sistema</CardTitle>
        <CardDescription>GET {API_URL}/health</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.status === "loading" && (
          <p className="text-sm">Consultando a API…</p>
        )}
        {state.status === "error" && (
          <p className="text-sm text-destructive">
            API inacessível: {state.message}
          </p>
        )}
        {state.status === "ok" && (
          <ul className="divide-y">
            <HealthItem
              label="Banco"
              ok={state.health.database.ok}
              detail={state.health.database.detail}
            />
            <HealthItem
              label="Modelo"
              ok={state.health.model.ok}
              detail={state.health.model.file}
            />
            <HealthItem
              label="Chave do LLM"
              ok={state.health.llm.ok}
              detail={state.health.llm.provider}
            />
          </ul>
        )}
        <Button variant="outline" onClick={reload}>
          Atualizar
        </Button>
      </CardContent>
    </Card>
  );
}
