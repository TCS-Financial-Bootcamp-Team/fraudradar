"use client";
import { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { useTranslations } from "next-intl";
import { AccountLabel } from "@/components/account-label";
import { useAppTheme } from "@/components/theme";
import { accountAlias } from "@/lib/account-alias";
import type { Graph } from "../schemas/alerts";

type HoveredNode = {
  graph: Graph;
  alias: string;
  account: string;
  left: number;
  top: number;
};

export function AccountGraph({ graph }: { graph: Graph }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations("alerts.graph");
  const tAlias = useTranslations("common.accountAlias");
  const { isDark, tokens } = useAppTheme();
  const [hoveredNode, setHoveredNode] = useState<HoveredNode | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const cy = cytoscape({
      container,
      elements: [
        ...graph.nodes.map((node) => {
          const accountNumber = node.label || node.id;
          return {
            data: {
              id: node.id,
              account: accountNumber,
              label: accountAlias(accountNumber),
              central: node.central ? "yes" : "no",
            },
          };
        }),
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
            "font-family": "Geist, sans-serif",
            "font-size": 10,
            "text-wrap": "wrap",
            "text-max-width": "120px",
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

    const showTooltip = (node: cytoscape.NodeSingular) => {
      const pos = node.renderedPosition();
      const width = container.clientWidth || 320;
      setHoveredNode({
        graph,
        alias: String(node.data("label")),
        account: String(node.data("account")),
        left: Math.min(Math.max(pos.x, 80), Math.max(80, width - 80)),
        top: Math.max(pos.y - 14, 42),
      });
    };
    const hideTooltip = () => setHoveredNode(null);

    cy.on("mouseover", "node", (event) => showTooltip(event.target));
    cy.on("tap", "node", (event) => showTooltip(event.target));
    cy.on("mouseout", "node", hideTooltip);
    cy.on("pan zoom", hideTooltip);

    const observer = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 40);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      cy.destroy();
    };
  }, [graph, isDark, tokens]);

  const activeTooltip =
    hoveredNode && hoveredNode.graph === graph ? hoveredNode : null;

  return (
    <>
      <div className="relative h-72 w-full">
        <div
          ref={ref}
          className="h-full w-full"
          role="img"
          aria-label={t("label")}
          title={tAlias("hint")}
        />
        {activeTooltip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground"
            style={{
              left: `${activeTooltip.left}px`,
              top: `${activeTooltip.top}px`,
            }}
          >
            <div className="whitespace-nowrap font-medium">
              {activeTooltip.alias}
            </div>
            <div className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
              {activeTooltip.account}
            </div>
          </div>
        )}
      </div>
      <details className="mt-3 border-t border-soft pt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          {t("textAlt")}
        </summary>
        <ul className="mt-3 space-y-2">
          {graph.edges.map((edge) => (
            <li
              key={edge.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              <AccountLabel account={edge.source} layout="inline" />
              <span aria-hidden="true">→</span>
              <AccountLabel account={edge.target} layout="inline" />
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
