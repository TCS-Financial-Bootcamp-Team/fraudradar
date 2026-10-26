"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useContextoApp } from "@/components/app-context";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/campo";
import { Carregando, ErroRecurso } from "@/components/ui/estados";
import { useFila } from "../hooks/use-alertas";
import { TabelaAlertas, rotulosStatus } from "./tabela-alertas";

export function FilaAlertas() {
  const { semana, setSemana } = useContextoApp();
  return <FilaSemana key={semana} semana={semana} setSemana={setSemana} />;
}
function FilaSemana({
  semana,
  setSemana,
}: {
  semana: string;
  setSemana: (v: string) => void;
}) {
  const [status, setStatus] = useState("");
  const [pais, setPais] = useState("");
  const [pagina, setPagina] = useState(1);
  const recurso = useFila(status, pais, pagina);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Triagem e investigação</p>
          <h1>Fila de alertas</h1>
          <p>Comece pelos maiores riscos e registre cada decisão.</p>
        </div>
        <span className="rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground">
          {recurso.dados?.total ?? "…"} alertas encontrados
        </span>
      </div>
      <section className="panel flex flex-wrap items-end gap-4 p-5">
        <SlidersHorizontal className="mb-3 hidden size-4 text-muted-foreground sm:block" />
        <div className="min-w-44 flex-1">
          <Campo nome="Status">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPagina(1);
              }}
            >
              <option value="">Todos os status</option>
              {Object.entries(rotulosStatus).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
        <div className="min-w-40 flex-1">
          <Campo nome="País">
            <Select
              value={pais}
              onChange={(e) => {
                setPais(e.target.value);
                setPagina(1);
              }}
            >
              <option value="">Todos os países</option>
              {recurso.dados?.paises.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Campo>
        </div>
        <div className="min-w-40 flex-1">
          <Campo nome="Semana">
            <Input
              type="date"
              value={semana}
              onChange={(e) => {
                if (e.target.value) setSemana(e.target.value);
              }}
            />
          </Campo>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setStatus("");
            setPais("");
            setPagina(1);
          }}
        >
          Limpar filtros
        </Button>
      </section>
      {recurso.carregando ? (
        <Carregando />
      ) : recurso.erro || !recurso.dados ? (
        <ErroRecurso
          mensagem={recurso.erro ?? "Dados indisponíveis."}
          tentar={recurso.recarregar}
        />
      ) : (
        <section className="panel overflow-hidden">
          <div className="panel-title">
            <h2>Prioridade por score</h2>
            <span className="text-xs font-normal text-muted-foreground">
              Maior → menor
            </span>
          </div>
          <TabelaAlertas itens={recurso.dados.itens} />
          <div className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-4">
            <span className="text-xs text-muted-foreground">
              Página {pagina} de{" "}
              {Math.max(1, Math.ceil(recurso.dados.total / 10))}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina === 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                <ChevronLeft />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina * 10 >= recurso.dados.total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
                <ChevronRight />
              </Button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
