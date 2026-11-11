"use client";
import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import { useAppTheme } from "@/components/theme";
import type { Graph } from "../schemas/alerts";

export function AccountGraph({ graph }: { graph: Graph }) {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark, tokens } = useAppTheme();
  useEffect(() => {
    if (!ref.current) return;
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const cy = cytoscape({
      container: ref.current,
      elements: [
        ...graph.nodes.map((node) => ({
          data: {
            id: node.id,
            label: node.label,
            central: node.central ? "yes" : "no",
          },
        })),
        ...graph.edges.map((edge) => ({
          data: { id: edge.id, source: edge.source, target: edge.target },
        })),
      ],
      style: [
        {
          // Demais contas: círculo vazado, com a borda em tom neutro.
          selector: "node",
          style: {
            "background-color": color("--card"),
            "border-width": 1.4,
            "border-color": color("--muted-foreground"),
            label: "data(label)",
            color: color("--muted-foreground"),
            "font-family": "Geist Mono, monospace",
            "font-size": 10,
            "text-valign": "bottom",
            "text-margin-y": 8,
            width: 14,
            height: 14,
          },
        },
        {
          // Conta do alerta: nó cheio na cor primária.
          selector: 'node[central = "yes"]',
          style: {
            "background-color": color("--primary"),
            "border-width": 0,
            color: color("--foreground"),
            width: 24,
            height: 24,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.4,
            "line-color": color("--chart-muted"),
            "target-arrow-color": color("--chart-muted"),
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
      ],
      layout: {
        name: "breadthfirst",
        roots: graph.nodes.filter((n) => n.central).map((n) => n.id),
        directed: true,
        padding: 40,
        animate: false,
      },
      wheelSensitivity: 0.2,
      minZoom: 0.3,
      maxZoom: 3,
    });
    const observer = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 40);
    });
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      cy.destroy();
    };
  }, [graph, isDark, tokens]);
  return (
    <>
      <div
        ref={ref}
        className="h-72 w-full"
        role="img"
        aria-label="Rede de contas pseudonimizadas em até dois saltos"
      />
      <details className="mt-3 border-t border-soft pt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Consultar conexões em texto · alternativa ao grafo
        </summary>
        <ul className="mt-3 space-y-2">
          {graph.edges.map((edge) => (
            <li key={edge.id}>
              {edge.source} → {edge.target}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
