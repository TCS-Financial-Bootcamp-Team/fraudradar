"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useAppContext } from "@/components/app-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { useAlertQueue } from "../hooks/use-alerts";
import { AlertsTable, statusLabels } from "./alerts-table";
import { WeekPicker } from "./week-picker";

export function AlertQueue() {
  const { week } = useAppContext();
  // A key zera filtros e página quando a semana muda.
  return <WeeklyAlertQueue key={week} />;
}
function WeeklyAlertQueue() {
  const [status, setStatus] = useState("");
  const [country, setCountry] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queue = useAlertQueue(status, country, page, search);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Triagem e investigação</p>
          <h1>Fila de alertas</h1>
          <p>Comece pelos maiores riscos e registre cada decisão.</p>
        </div>
        <span className="rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground">
          {queue.data?.total ?? "…"} alertas encontrados
        </span>
      </div>
      <section className="panel flex flex-wrap items-end gap-4 p-5">
        <SlidersHorizontal className="mb-3 hidden size-4 text-muted-foreground sm:block" />
        <div className="min-w-44 flex-1">
          <Field label="Buscar">
            <Input
              placeholder="Alerta ou conta"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
            />
          </Field>
        </div>
        <div className="min-w-44 flex-1">
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os status</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="min-w-40 flex-1">
          <Field label="País">
            <Select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os países</option>
              {queue.data?.countries.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid min-w-48 flex-1 gap-2 text-sm font-medium">
          <span>Semana</span>
          <WeekPicker />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setStatus("");
            setCountry("");
            setSearchInput("");
            setSearch("");
            setPage(1);
          }}
        >
          Limpar filtros
        </Button>
      </section>
      {queue.loading ? (
        <LoadingState />
      ) : queue.error || !queue.data ? (
        <ResourceError
          message={queue.error ?? "Dados indisponíveis."}
          onRetry={queue.reload}
        />
      ) : (
        <section className="panel overflow-hidden">
          <div className="panel-title">
            <h2>Prioridade na fila</h2>
            <span className="text-xs font-normal text-muted-foreground">
              Nota de risco de 0 a 100: ordena a fila, não é a chance de ser
              lavagem
            </span>
          </div>
          <AlertsTable items={queue.data.items} />
          <div className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-4">
            <span className="text-xs text-muted-foreground">
              Página {page} de {Math.max(1, Math.ceil(queue.data.total / 10))}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * 10 >= queue.data.total}
                onClick={() => setPage((p) => p + 1)}
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
