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
  readOnly: false;
};

export type WorkspaceWritePathRequest = {
  relativePath: string;
  content: string;
  expectedContent: string;
  force?: boolean;
};

export type WorkspaceWritePathResult = {
  relativePath: string;
  bytesWritten: number;
  savedAt: string;
};

export type LeviWorkspaceTreeApi = LeviApi["workspace"] & {
  listTree: () => Promise<WorkspaceTreeResult>;
  readPath: (request: WorkspaceReadPathRequest) => Promise<WorkspaceReadPathResult>;
  writePath: (request: WorkspaceWritePathRequest) => Promise<WorkspaceWritePathResult>;
};

export type LeviApiWithWorkspaceTree = Omit<LeviApi, "workspace"> & {
  workspace: LeviWorkspaceTreeApi;
};