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
import type { Indice, Visao } from "../schemas";
import { rotulos } from "../schemas";
import { organizarQuadro } from "../services/quadro";
import { IconeTipo, Data } from "./registro-visual";

type RegistroNode = Node<
  {
    no: Indice;
    ancestral: boolean;
    filhos: number;
    recolhido: boolean;
    alternar: (id: string) => void;
  },
  "registro"
>;
const Cartao = memo(function Cartao({ data, selected }: NodeProps<RegistroNode>) {
  const { no } = data;
  return (
    <article
      className={`canvas-card ${selected ? "selected" : ""} ${data.ancestral ? "ancestor" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="canvas-card-head">
        <IconeTipo tipo={no.tipo} />
        <span>{rotulos[no.tipo]}</span>
        <span className="chip">{rotulos[no.area]}</span>
      </div>
      <h3 title={no.titulo}>{no.titulo ?? no.id}</h3>
      <div className="canvas-card-foot">
        <span title={no.autor}>{no.autor}</span>
        <Data valor={no.criado_em} />
      </div>
      {data.filhos > 0 && (
        <button
          type="button"
          className="canvas-collapse nodrag nopan"
          aria-label={`${data.recolhido ? "Expandir" : "Recolher"} ${no.titulo}`}
          aria-expanded={!data.recolhido}
          onClick={(e) => {
            e.stopPropagation();
            data.alternar(no.id);
          }}
        >
          {data.recolhido ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          {data.filhos}
        </button>
      )}
      <Handle type="source" position={Position.Bottom} />
    </article>
  );
});
const nodeTypes = { registro: Cartao };
const ariaLabels = {
  "controls.zoomIn.ariaLabel": "Aproximar",
  "controls.zoomOut.ariaLabel": "Afastar",
  "controls.fitView.ariaLabel": "Ajustar quadro",
  "minimap.ariaLabel": "Minimapa",
  "node.a11yDescription.default": "Pressione Enter ou espaço para selecionar o registro.",
};
type Props = {
  visao: Visao;
  selecionado: string | null;
  selecionar: (id: string) => void;
  apresentacao: boolean;
};
function Conteudo({ visao, selecionado, selecionar, apresentacao }: Props) {
  const [recolhidos, setRecolhidos] = useState<Set<string>>(() => new Set());
  const alternar = useCallback(
    (id: string) =>
      setRecolhidos((anteriores) => {
        const proximos = new Set(anteriores);
        if (proximos.has(id)) proximos.delete(id);
        else proximos.add(id);
        return proximos;
      }),
    [],
  );
  const grafo = useMemo(
    () => organizarQuadro(visao, recolhidos, apresentacao),
    [visao, recolhidos, apresentacao],
  );
  const nodes = useMemo<RegistroNode[]>(
    () =>
      grafo.nos.map((n) => ({
        id: n.no.id,
        type: "registro",
        position: n.position,
        width: n.largura,
        height: n.altura,
        selected: selecionado === n.no.id,
        data: {
          no: n.no,
          ancestral: n.ancestral,
          filhos: n.filhos,
          recolhido: recolhidos.has(n.no.id),
          alternar,
        },
      })),
    [grafo, selecionado, recolhidos, alternar],
  );
  const flow = useReactFlow<RegistroNode>();
  const { resolvedTheme } = useTheme();
  const clicar = useCallback(
    (_: React.MouseEvent, no: RegistroNode) => selecionar(no.id),
    [selecionar],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.18, maxZoom: 1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [grafo, flow]);
  const centralizar = () => {
    if (!selecionado) return;
    const no = flow.getNode(selecionado);
    if (no)
      void flow.setCenter(
        no.position.x + (no.width ?? 264) / 2,
        no.position.y + (no.height ?? 148) / 2,
        { zoom: 1, duration: 250 },
      );
  };
  return (
    <div className="canvas" aria-label="Quadro de registros">
      <ReactFlow<RegistroNode>
        nodes={nodes}
        edges={grafo.arestas}
        nodeTypes={nodeTypes}
        onNodeClick={clicar}
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
            onClick={centralizar}
            disabled={!nodes.some((n) => n.id === selecionado)}
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
export function Quadro(props: Props) {
  return (
    <ReactFlowProvider>
      <Conteudo {...props} />
    </ReactFlowProvider>
  );
}
