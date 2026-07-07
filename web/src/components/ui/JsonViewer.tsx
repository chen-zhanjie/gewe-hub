import { ChevronDown, ChevronRight, Copy, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";

interface JsonViewerProps {
  title: string;
  value: unknown;
}

type JsonNodeKind = "array" | "object" | "primitive";

interface JsonTreeNode {
  children: JsonTreeNode[];
  depth: number;
  key: string;
  kind: JsonNodeKind;
  path: string;
  value: unknown;
}

const DEFAULT_EXPANDED_DEPTH = 2;

export function JsonViewer({ title, value }: JsonViewerProps) {
  const json = useMemo(() => stringifyJson(value), [value]);
  const tree = useMemo(() => buildJsonTree(value, "$", "$", 0), [value]);
  const defaultExpandedPaths = useMemo(() => collectDefaultExpandedPaths(tree), [tree]);
  const allExpandablePaths = useMemo(() => collectExpandablePaths(tree), [tree]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(defaultExpandedPaths);
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleRows = useMemo(
    () => flattenVisibleRows(tree, expandedPaths, normalizedSearchQuery),
    [expandedPaths, normalizedSearchQuery, tree],
  );

  function toggleNode(path: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 min-w-44 items-center gap-2 rounded-md border bg-background px-2 text-xs text-muted-foreground">
            <Search className="size-4 shrink-0" />
            <span className="sr-only">搜索 JSON 键名</span>
            <input
              aria-label="搜索 JSON 键名"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="搜索键名"
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
            />
          </label>
          <button
            type="button"
            aria-label="展开全部"
            onClick={() => setExpandedPaths(new Set(allExpandablePaths))}
            className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            展开全部
          </button>
          <button
            type="button"
            aria-label="折叠全部"
            onClick={() => setExpandedPaths(new Set<string>(["$"]))}
            className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            折叠全部
          </button>
          <CopyButton value={json} label={`复制${title}`} />
        </div>
      </div>
      <div className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs font-mono text-foreground">
        {visibleRows.length > 0 ? (
          <div className="space-y-0.5">
            {visibleRows.map(({ isMatch, node }) => (
              <JsonNodeRow key={node.path} isMatch={isMatch} node={node} onToggle={toggleNode} expanded={expandedPaths.has(node.path)} />
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground">没有匹配的 JSON 键名</div>
        )}
      </div>
    </section>
  );
}

interface JsonNodeRowProps {
  expanded: boolean;
  isMatch: boolean;
  node: JsonTreeNode;
  onToggle: (path: string) => void;
}

function JsonNodeRow({ expanded, isMatch, node, onToggle }: JsonNodeRowProps) {
  const hasChildren = node.children.length > 0;

  return (
    <div
      data-testid={isMatch ? "json-viewer-row-highlight" : `json-viewer-row-${node.path}`}
      className={cn(
        "group flex min-h-6 items-center gap-1 rounded px-1 hover:bg-background/70",
        isMatch && "bg-amber-100/70",
      )}
      style={{ paddingLeft: `${node.depth * 16 + 4}px` }}
    >
      {hasChildren ? (
        <button
          type="button"
          aria-label={expanded ? `折叠 ${node.path}` : `展开 ${node.path}`}
          onClick={() => onToggle(node.path)}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      ) : (
        <span className="size-5 shrink-0" />
      )}
      {node.depth > 0 ? <span className="text-sky-700">{node.key}</span> : <span className="text-muted-foreground">{node.key}</span>}
      <span className="text-muted-foreground">:</span>
      {hasChildren ? (
        <span className="text-muted-foreground">{summarizeChildren(node)}</span>
      ) : (
        <PrimitiveValue value={node.value} />
      )}
      <CopyButton
        value={node.path}
        label={`复制路径 ${node.path}`}
        className="ml-auto size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      />
    </div>
  );
}

function PrimitiveValue({ value }: { value: unknown }) {
  if (typeof value === "string") {
    return <span className="text-emerald-700">{JSON.stringify(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-blue-700">{String(value)}</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-purple-700">{String(value)}</span>;
  }
  if (value === null) {
    return <span className="text-muted-foreground">null</span>;
  }
  return <span className="text-muted-foreground">{JSON.stringify(value)}</span>;
}

function buildJsonTree(value: unknown, key: string, path: string, depth: number): JsonTreeNode {
  if (Array.isArray(value)) {
    return {
      children: value.map((item, index) => buildJsonTree(item, `[${index}]`, `${path}[${index}]`, depth + 1)),
      depth,
      key,
      kind: "array",
      path,
      value,
    };
  }

  if (isRecord(value)) {
    return {
      children: Object.entries(value).map(([childKey, childValue]) =>
        buildJsonTree(childValue, childKey, appendPathSegment(path, childKey), depth + 1),
      ),
      depth,
      key,
      kind: "object",
      path,
      value,
    };
  }

  return {
    children: [],
    depth,
    key,
    kind: "primitive",
    path,
    value,
  };
}

function flattenVisibleRows(tree: JsonTreeNode, expandedPaths: Set<string>, searchQuery: string): Array<{ isMatch: boolean; node: JsonTreeNode }> {
  const rows: Array<{ isMatch: boolean; node: JsonTreeNode }> = [];

  function visit(node: JsonTreeNode) {
    if (node.depth > 0) {
      const isMatch = searchQuery.length > 0 && node.key.toLowerCase().includes(searchQuery);
      rows.push({ isMatch, node });
    }

    const shouldShowChildren =
      node.depth === 0 ||
      (searchQuery.length > 0 ? node.children.some((child) => nodeOrDescendantMatches(child, searchQuery)) : expandedPaths.has(node.path));
    if (!shouldShowChildren) return;

    node.children.forEach((child) => {
      if (searchQuery.length === 0 || nodeOrDescendantMatches(child, searchQuery)) {
        visit(child);
      }
    });
  }

  visit(tree);
  return rows;
}

function nodeOrDescendantMatches(node: JsonTreeNode, searchQuery: string): boolean {
  return node.key.toLowerCase().includes(searchQuery) || node.children.some((child) => nodeOrDescendantMatches(child, searchQuery));
}

function collectDefaultExpandedPaths(tree: JsonTreeNode): Set<string> {
  const paths = new Set<string>();

  function visit(node: JsonTreeNode) {
    if (node.children.length === 0) return;
    if (node.depth < DEFAULT_EXPANDED_DEPTH) {
      paths.add(node.path);
      node.children.forEach(visit);
    }
  }

  visit(tree);
  return paths;
}

function collectExpandablePaths(tree: JsonTreeNode): string[] {
  const paths: string[] = [];

  function visit(node: JsonTreeNode) {
    if (node.children.length > 0) {
      paths.push(node.path);
      node.children.forEach(visit);
    }
  }

  visit(tree);
  return paths;
}

function summarizeChildren(node: JsonTreeNode): string {
  if (node.kind === "array") {
    return `Array(${node.children.length})`;
  }
  return `{${node.children.length} keys}`;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapePathSegment(segment: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(segment) ? segment : `[${JSON.stringify(segment)}]`;
}

function appendPathSegment(path: string, segment: string): string {
  const escapedSegment = escapePathSegment(segment);
  return escapedSegment.startsWith("[") ? `${path}${escapedSegment}` : `${path}.${escapedSegment}`;
}
