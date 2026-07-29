import type { LeviApi } from "./levi-api";

export type WorkspaceTreeNode = {
  name: string;
  relativePath: string;
  kind: "file" | "folder";
  children?: WorkspaceTreeNode[];
};

export type WorkspaceTreeResult = {
  projectName: string;
  rootPath: string;
  nodes: WorkspaceTreeNode[];
  nodeCount: number;
  truncated: boolean;
};

export type WorkspaceReadPathRequest = {
  relativePath: string;
};

export type WorkspaceReadPathResult = {
  relativePath: string;
  content: string;
  language: string;
  readOnly: true;
};

export type LeviWorkspaceTreeApi = LeviApi["workspace"] & {
  listTree: () => Promise<WorkspaceTreeResult>;
  readPath: (request: WorkspaceReadPathRequest) => Promise<WorkspaceReadPathResult>;
};

export type LeviApiWithWorkspaceTree = Omit<LeviApi, "workspace"> & {
  workspace: LeviWorkspaceTreeApi;
};
