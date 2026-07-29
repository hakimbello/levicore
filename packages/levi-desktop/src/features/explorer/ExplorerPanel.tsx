import { memo, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { useWorkspaceTree } from "../../hooks/use-workspace-tree";
import type { WorkspaceStatus } from "../../types/levi-api";
import type { WorkspaceReadPathResult, WorkspaceTreeNode } from "../../types/workspace-tree-api";

const EXPANDED_STORAGE_KEY = "levi.explorer.expandedFolders";
const SELECTED_STORAGE_KEY = "levi.explorer.selectedFile";

type ExplorerPanelProps = {
  workspaceStatus: WorkspaceStatus;
  selectedPath?: string;
  onOpenFile: (file: WorkspaceReadPathResult) => void;
};

type TreeNodeProps = {
  node: WorkspaceTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedPath?: string;
  onToggle: (relativePath: string) => void;
  onSelectFile: (relativePath: string) => void;
};

function readExpandedFolders(): Set<string> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(EXPANDED_STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

const TreeNode = memo(function TreeNode({
  node,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelectFile
}: TreeNodeProps) {
  const isFolder = node.kind === "folder";
  const isExpanded = isFolder && expanded.has(node.relativePath);
  const isSelected = !isFolder && node.relativePath === selectedPath;

  function activate() {
    if (isFolder) onToggle(node.relativePath);
    else onSelectFile(node.relativePath);
  }

  return (
    <div role="treeitem" aria-expanded={isFolder ? isExpanded : undefined} aria-selected={isSelected}>
      <button
        type="button"
        className={isSelected ? "levi-explorer-row levi-explorer-row-selected" : "levi-explorer-row"}
        style={{ paddingLeft: `${10 + depth * 16}px` }}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" && isFolder && !isExpanded) {
            event.preventDefault();
            onToggle(node.relativePath);
          } else if (event.key === "ArrowLeft" && isFolder && isExpanded) {
            event.preventDefault();
            onToggle(node.relativePath);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate();
          }
        }}
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
              key={child.relativePath}
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
});

export function ExplorerPanel({ workspaceStatus, selectedPath, onOpenFile }: ExplorerPanelProps) {
  const { tree, loading, refreshing, error, refresh } = useWorkspaceTree();
  const [expanded, setExpanded] = useState<Set<string>>(readExpandedFolders);
  const [persistedSelectedPath, setPersistedSelectedPath] = useState<string | undefined>(
    () => window.localStorage.getItem(SELECTED_STORAGE_KEY) ?? undefined
  );
  const [openError, setOpenError] = useState<string | null>(null);
  const activeSelectedPath = selectedPath ?? persistedSelectedPath;

  useEffect(() => {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...expanded]));
  }, [expanded]);

  function toggleNode(relativePath: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }

  async function selectFile(relativePath: string) {
    setOpenError(null);
    try {
      const file = await window.levi.workspace.readPath({ relativePath });
      setPersistedSelectedPath(relativePath);
      window.localStorage.setItem(SELECTED_STORAGE_KEY, relativePath);
      onOpenFile(file);
    } catch (nextError) {
      setOpenError(nextError instanceof Error ? nextError.message : "Unable to open the selected file.");
    }
  }

  if (workspaceStatus.state === "scanning" || loading) {
    return <section className="levi-explorer-panel"><div className="levi-explorer-empty">Scanning workspace…</div></section>;
  }

  if (workspaceStatus.state === "failed") {
    return <section className="levi-explorer-panel"><div className="levi-explorer-empty">{workspaceStatus.error ?? "Workspace scan failed."}</div></section>;
  }

  if (error) {
    return (
      <section className="levi-explorer-panel">
        <div className="levi-explorer-empty">
          <div>{error}</div>
          <button type="button" className="levi-button levi-button-secondary" onClick={() => void refresh()}>Retry</button>
        </div>
      </section>
    );
  }

  if (!tree) {
    return <section className="levi-explorer-panel"><div className="levi-explorer-empty">Open a project folder to view files.</div></section>;
  }

  return (
    <section className="levi-explorer-panel" aria-label="Explorer">
      <header className="levi-explorer-header">
        <div>
          <div className="levi-explorer-title">Explorer</div>
          <div className="levi-explorer-project">{tree.projectName}</div>
        </div>
        <button
          type="button"
          className="levi-icon-button"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="Refresh Explorer"
          title="Refresh Explorer"
        >
          <Icon name="refresh" />
        </button>
      </header>
      {openError ? <div className="levi-explorer-empty" role="alert">{openError}</div> : null}
      <div className="levi-explorer-tree" role="tree" aria-label={`${tree.projectName} files`}>
        {tree.nodes.length > 0 ? (
          tree.nodes.map((node) => (
            <TreeNode
              key={node.relativePath}
              node={node}
              depth={0}
              expanded={expanded}
              selectedPath={activeSelectedPath}
              onToggle={toggleNode}
              onSelectFile={(relativePath) => void selectFile(relativePath)}
            />
          ))
        ) : (
          <div className="levi-explorer-empty">No project files were found.</div>
        )}
      </div>
    </section>
  );
}
