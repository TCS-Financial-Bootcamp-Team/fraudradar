"use client";
import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import { useTheme } from "next-themes";
import type { Grafo } from "../schemas/alertas";

export function GrafoContas({ grafo }: { grafo: Grafo }) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!ref.current) return;
    const css = getComputedStyle(document.documentElement);
    const cy = cytoscape({
      container: ref.current,
      elements: [
        ...grafo.nos.map((n) => ({
          data: {
            id: n.id,
            label: n.rotulo,
            central: n.central ? "sim" : "nao",
          },
        })),
        ...grafo.arestas.map((a) => ({
          data: { id: a.id, source: a.origem, target: a.destino },
        })),
      ],
      style: [
        {
          selector: "node",
          style: {
            "background-color": css.getPropertyValue("--chart-2").trim(),
            label: "data(label)",
            color: css.getPropertyValue("--foreground").trim(),
            "font-size": 10,
            "text-valign": "bottom",
            "text-margin-y": 8,
            width: 22,
            height: 22,
          },
        },
        {
          selector: 'node[central = "sim"]',
          style: {
            "background-color": css.getPropertyValue("--chart-1").trim(),
            width: 40,
            height: 40,
            "border-width": 6,
            "border-color": css.getPropertyValue("--accent").trim(),
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": css.getPropertyValue("--input").trim(),
            "target-arrow-color": css
              .getPropertyValue("--muted-foreground")
              .trim(),
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
      ],
      layout: {
        name: "breadthfirst",
        roots: grafo.nos.filter((n) => n.central).map((n) => n.id),
        directed: true,
        padding: 40,
        animate: false,
      },
      wheelSensitivity: 0.2,
      minZoom: 0.3,
      maxZoom: 3,
    });
    const observador = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 40);
    });
    observador.observe(ref.current);
    return () => {
      observador.disconnect();
      cy.destroy();
    };
  }, [grafo, resolvedTheme]);
  return (
    <>
      <div
        ref={ref}
        className="h-80 w-full"
        role="img"
        aria-label="Rede de contas pseudonimizadas em até dois saltos"
      />
      <details className="border-t px-5 py-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Consultar conexões em texto · alternativa ao grafo
        </summary>
        <ul className="mt-3 space-y-2">
          {grafo.arestas.map((a) => (
            <li key={a.id}>
              {a.origem} → {a.destino}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
