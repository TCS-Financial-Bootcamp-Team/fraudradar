"use client";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { ChevronDown, ChevronRight, Focus, Maximize } from "lucide-react";
import type { NodeIndex, View } from "../schemas";
import { LABELS } from "../schemas";
import { layoutBoard } from "../services/board";
import { TypeIcon, ShortDate } from "./record-visual";

type RecordFlowNode = Node<
  {
    node: NodeIndex;
    ancestor: boolean;
    children: number;
    collapsed: boolean;
    toggle: (id: string) => void;
  },
  "record"
>;
const Card = memo(function Card({ data, selected }: NodeProps<RecordFlowNode>) {
  const { node } = data;
  return (
    <article
      className={`canvas-card ${selected ? "selected" : ""} ${data.ancestor ? "ancestor" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="canvas-card-head">
        <TypeIcon type={node.tipo} />
        <span>{LABELS[node.tipo]}</span>
        <span className="chip">{LABELS[node.area]}</span>
      </div>
      <h3 title={node.titulo}>{node.titulo ?? node.id}</h3>
      <div className="canvas-card-foot">
        <span title={node.autor}>{node.autor}</span>
        <ShortDate value={node.criado_em} />
      </div>
      {data.children > 0 && (
        <button
          type="button"
          className="canvas-collapse nodrag nopan"
          aria-label={`${data.collapsed ? "Expandir" : "Recolher"} ${node.titulo}`}
          aria-expanded={!data.collapsed}
          onClick={(e) => {
            e.stopPropagation();
            data.toggle(node.id);
          }}
        >
          {data.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          {data.children}
        </button>
      )}
      <Handle type="source" position={Position.Bottom} />
    </article>
  );
});
const nodeTypes = { record: Card };
const ariaLabels = {
  "controls.zoomIn.ariaLabel": "Aproximar",
  "controls.zoomOut.ariaLabel": "Afastar",
  "controls.fitView.ariaLabel": "Ajustar quadro",
  "minimap.ariaLabel": "Minimapa",
  "node.a11yDescription.default": "Pressione Enter ou espaço para selecionar o registro.",
};
type Props = {
  view: View;
  selected: string | null;
  onSelect: (id: string) => void;
  presentation: boolean;
};
function BoardContent({ view, selected, onSelect, presentation }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = useCallback(
    (id: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const graph = useMemo(
    () => layoutBoard(view, collapsed, presentation),
    [view, collapsed, presentation],
  );
  const nodes = useMemo<RecordFlowNode[]>(
    () =>
      graph.nodes.map((n) => ({
        id: n.node.id,
        type: "record",
        position: n.position,
        width: n.width,
        height: n.height,
        selected: selected === n.node.id,
        data: {
          node: n.node,
          ancestor: n.ancestor,
          children: n.children,
          collapsed: collapsed.has(n.node.id),
          toggle,
        },
      })),
    [graph, selected, collapsed, toggle],
  );
  const flow = useReactFlow<RecordFlowNode>();
  const { resolvedTheme } = useTheme();
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, item: RecordFlowNode) => onSelect(item.id),
    [onSelect],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.18, maxZoom: 1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [graph, flow]);
  const centerSelected = () => {
    if (!selected) return;
    const item = flow.getNode(selected);
    if (item)
      void flow.setCenter(
        item.position.x + (item.width ?? 264) / 2,
        item.position.y + (item.height ?? 148) / 2,
        { zoom: 1, duration: 250 },
      );
  };
  return (
    <div className="canvas" aria-label="Quadro de registros">
      <ReactFlow<RecordFlowNode>
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        onlyRenderVisibleElements
        fitView
        minZoom={0.04}
        maxZoom={2}
        panOnScroll
        panOnDrag
        zoomOnPinch
        colorMode={resolvedTheme === "light" ? "light" : "dark"}
        ariaLabelConfig={ariaLabels}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} showFitView={false}>
          <ControlButton
            onClick={() => void flow.fitView({ padding: 0.18, maxZoom: 1 })}
            title="Ajustar quadro"
            aria-label="Ajustar quadro"
          >
            <Maximize size={16} />
          </ControlButton>
          <ControlButton
            onClick={centerSelected}
            disabled={!nodes.some((n) => n.id === selected)}
            title="Centralizar no selecionado"
            aria-label="Centralizar no selecionado"
          >
            <Focus size={16} />
          </ControlButton>
        </Controls>
        <MiniMap pannable zoomable nodeColor="var(--primary)" maskColor="var(--canvas-mask)" />
      </ReactFlow>
      <span className="canvas-hint">Arraste para mover · Ctrl + rolagem para ampliar</span>
    </div>
  );
}
export function Board(props: Props) {
  return (
    <ReactFlowProvider>
      <BoardContent {...props} />
    </ReactFlowProvider>
  );
}
