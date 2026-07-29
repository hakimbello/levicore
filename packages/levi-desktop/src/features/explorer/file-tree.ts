export type ExplorerNode = {
  id: string;
  name: string;
  relativePath: string;
  kind: "file" | "folder";
  children?: ExplorerNode[];
};

type MutableExplorerNode = ExplorerNode & {
  children: MutableExplorerNode[];
};

function normalizeRelativePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function compareNodes(left: ExplorerNode, right: ExplorerNode): number {
  if (left.kind !== right.kind) {
    return left.kind === "folder" ? -1 : 1;
  }
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
}

function sortTree(nodes: MutableExplorerNode[]): ExplorerNode[] {
  return nodes
    .sort(compareNodes)
    .map((node) => ({
      ...node,
      children: node.kind === "folder" ? sortTree(node.children) : undefined
    }));
}

export function buildExplorerTree(paths: string[]): ExplorerNode[] {
  const root: MutableExplorerNode[] = [];
  const folders = new Map<string, MutableExplorerNode>();

  for (const candidate of paths) {
    const relativePath = normalizeRelativePath(candidate);
    if (!relativePath) continue;

    const segments = relativePath.split("/").filter(Boolean);
    let siblings = root;
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isFile = index === segments.length - 1;

      if (isFile) {
        if (!siblings.some((node) => node.relativePath === currentPath)) {
          siblings.push({
            id: `file:${currentPath}`,
            name: segment,
            relativePath: currentPath,
            kind: "file",
            children: []
          });
        }
        return;
      }

      let folder = folders.get(currentPath);
      if (!folder) {
        folder = {
          id: `folder:${currentPath}`,
          name: segment,
          relativePath: currentPath,
          kind: "folder",
          children: []
        };
        folders.set(currentPath, folder);
        siblings.push(folder);
      }
      siblings = folder.children;
    });
  }

  return sortTree(root);
}

export function flattenExplorerTree(nodes: ExplorerNode[]): ExplorerNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenExplorerTree(node.children) : [])]);
}
