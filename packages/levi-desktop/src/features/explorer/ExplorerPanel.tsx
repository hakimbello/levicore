import { useMemo, useState } from "react";
import type { WorkspaceStatus } from "../../types/levi-api";
import { buildExplorerTree, type ExplorerNode } from "./file-tree";

type ExplorerPanelProps = {
  workspaceStatus: WorkspaceStatus;
  selectedPath?: string;
  onSelectFile?: (relativePath: string) => void;
};

function TreeNode({
  node,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelectFile
}: {
  node: ExplorerNode;
  depth: number;
  expanded: Set<string>;
  selectedPath?: string;
  onToggle: (id: string) => void;
  onSelectFile?: (relativePath: string) => void;
}) {
  const isFolder = node.kind === "folder";
  const isExpanded = expanded.has(node.id);
  const isSelected = node.relativePath === selectedPath;

  return (
    <div>
      <button
        type="button"
        className={isSelected ? "levi-explorer-row levi-explorer-row-selected" : "levi-explorer-row"}
        style={{ paddingLeft: `${10 + depth * 16}px` }}
        onClick={() => {
          if (isFolder) onToggle(node.id);
          else onSelectFile?.(node.relativePath);
        }}
        aria-expanded={isFolder ? isExpanded : undefined}
        title={node.relativePath}
      >
        <span className="levi-explorer-chevron" aria-hidden="true">
          {isFolder ? (isExpanded ? "⌄" : "›") : ""}
        </span>
        <span className="levi-explorer-glyph" aria-hidden="true">
          {isFolder ? (isExpanded ? "▾" : "▸") : "•"}
        </span>
        <span className="levi-explorer-name">{node.name}</span>
      </button>
      {isFolder && isExpanded
        ? node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
            />
          ))
        : null}
    </div>
  );
}

export function ExplorerPanel({ workspaceStatus, selectedPath, onSelectFile }: ExplorerPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const paths = useMemo(() => {
    const summary = workspaceStatus.summary;
    if (!summary) return [];
    return Array.from(
      new Set([
        ...summary.likelyEntryPoints,
        ...summary.documentationFiles,
        ...summary.manifestFiles
      ])
    );
  }, [workspaceStatus.summary]);

  const tree = useMemo(() => buildExplorerTree(paths), [paths]);

  function toggleNode(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (workspaceStatus.state === "scanning") {
    return <section className="levi-explorer-panel"><div className="levi-explorer-empty">Scanning workspace…</div></section>;
  }

  if (workspaceStatus.state === "failed") {
    return <section className="levi-explorer-panel"><div className="levi-explorer-empty">{workspaceStatus.error ?? "Workspace scan failed."}</div></section>;
  }

  if (!workspaceStatus.summary) {
    return <section className="levi-explorer-panel"><div className="levi-explorer-empty">Open a project folder to view files.</div></section>;
  }

  return (
    <section className="levi-explorer-panel" aria-label="Explorer">
      <header className="levi-explorer-header">
        <div>
          <div className="levi-explorer-title">Explorer</div>
          <div className="levi-explorer-project">{workspaceStatus.summary.projectName}</div>
        </div>
        <div className="levi-explorer-count">{paths.length}</div>
      </header>
      <div className="levi-explorer-tree" role="tree">
        {tree.length > 0 ? (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={toggleNode}
              onSelectFile={onSelectFile}
            />
          ))
        ) : (
          <div className="levi-explorer-empty">No indexed files were found.</div>
        )}
      </div>
    </section>
  );
}
