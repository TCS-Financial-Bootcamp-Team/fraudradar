import { Fragment, type ReactNode } from "react";
import { cn } from "cn";
import {
  parseMarkdown,
  type BlockNode,
  type InlineNode,
  type ListBlock,
} from "@/lib/markdown";

const HEADING_CLASSES: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "m-0 pt-1 first:pt-0 text-base font-semibold tracking-tight text-foreground",
  2: "m-0 pt-1 first:pt-0 text-[15px] font-semibold tracking-tight text-foreground",
  3: "m-0 pt-1 first:pt-0 text-sm font-semibold text-foreground",
  4: "m-0 pt-0.5 first:pt-0 text-[13px] font-semibold text-foreground",
  5: "m-0 pt-0.5 first:pt-0 text-xs font-semibold text-foreground",
  6: "m-0 pt-0.5 first:pt-0 text-xs font-medium text-muted-foreground",
};

function renderInline(node: InlineNode, key: number): ReactNode {
  switch (node.type) {
    case "text":
      return node.text;
    case "break":
      return <br key={key} />;
    case "strong":
      return (
        <strong key={key} className="font-semibold">
          {renderInlines(node.children)}
        </strong>
      );
    case "emphasis":
      return (
        <em key={key} className="italic">
          {renderInlines(node.children)}
        </em>
      );
    case "code":
      return (
        <code
          key={key}
          className="rounded bg-soft px-1 py-0.5 font-mono text-[0.9em]"
        >
          {node.text}
        </code>
      );
    case "link":
      return (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 transition-colors hover:text-muted-foreground"
        >
          {node.text}
        </a>
      );
  }
}

function renderInlines(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => (
    <Fragment key={index}>{renderInline(node, index)}</Fragment>
  ));
}

function renderList(block: ListBlock, nested: boolean, key?: number): ReactNode {
  const ListTag = block.ordered ? "ol" : "ul";
  const listClass = block.ordered
    ? nested
      ? "mt-1 list-[lower-alpha] space-y-1 pl-4 marker:text-muted-foreground"
      : "my-0 list-decimal space-y-1 pl-5 marker:text-muted-foreground"
    : nested
      ? "mt-1 list-[circle] space-y-1 pl-4 marker:text-muted-foreground"
      : "my-0 list-disc space-y-1 pl-5 marker:text-muted-foreground";

  return (
    <ListTag key={key} className={listClass}>
      {block.items.map((item, idx) => (
        <li key={idx} className="pl-0.5">
          {renderInlines(item.children)}
          {item.sublist ? renderList(item.sublist, true) : null}
        </li>
      ))}
    </ListTag>
  );
}

function renderBlock(block: BlockNode, key: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as const;
      return (
        <Tag key={key} className={HEADING_CLASSES[block.level]}>
          {renderInlines(block.children)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="m-0">
          {renderInlines(block.children)}
        </p>
      );
    case "list":
      return renderList(block, false, key);
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="my-0 space-y-1.5 border-l-2 border-border pl-3 text-muted-foreground"
        >
          {block.blocks.map((child, idx) => renderBlock(child, idx))}
        </blockquote>
      );
    case "hr":
      return <hr key={key} className="my-2 border-0 border-t border-border" />;
  }
}

export interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * Renderiza texto em Markdown produzido pela IA usando apenas nós de texto do
 * React (sem HTML bruto) e tokens visuais do tema.
 */
export function Markdown({ content, className }: MarkdownProps) {
  const blocks = parseMarkdown(content);
  if (blocks.length === 0) return null;

  return (
    <div
      className={cn(
        "min-w-0 space-y-2 leading-relaxed break-words [overflow-wrap:anywhere]",
        className,
      )}
    >
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}
