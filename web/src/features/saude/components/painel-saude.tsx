"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_URL } from "@/lib/api";

import { useSaude } from "../hooks/use-saude";

function Item({ nome, ok, detalhe }: { nome: string; ok: boolean; detalhe: string }) {
  return (
    <li className="flex items-center justify-between gap-4 py-2">
      <span className="font-medium">{nome}</span>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {detalhe}
        <Badge variant={ok ? "default" : "destructive"}>{ok ? "ok" : "fora"}</Badge>
      </span>
    </li>
  );
}

export function PainelSaude() {
  const { estado, recarregar } = useSaude();

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Saúde do sistema</CardTitle>
        <CardDescription>GET {API_URL}/saude</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {estado.tipo === "carregando" && <p className="text-sm">Consultando a API…</p>}
        {estado.tipo === "erro" && (
          <p className="text-sm text-destructive">API inacessível: {estado.mensagem}</p>
        )}
        {estado.tipo === "ok" && (
          <ul className="divide-y">
            <Item nome="Banco" ok={estado.saude.banco.ok} detalhe={estado.saude.banco.detalhe} />
            <Item nome="Modelo" ok={estado.saude.modelo.ok} detalhe={estado.saude.modelo.arquivo} />
            <Item
              nome="Chave do LLM"
              ok={estado.saude.llm.ok}
              detalhe={estado.saude.llm.provedor}
            />
          </ul>
        )}
        <Button variant="outline" onClick={recarregar}>
          Atualizar
        </Button>
      </CardContent>
    </Card>
  );
}
