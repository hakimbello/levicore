import { app, ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export const WORKSPACE_TREE_CHANNEL = "levi:workspace:list-tree";
export const WORKSPACE_READ_PATH_CHANNEL = "levi:workspace:read-path";
export const WORKSPACE_WRITE_PATH_CHANNEL = "levi:workspace:write-path";

const SETTINGS_FILE = "desktop-shell.json";
const MAX_TREE_NODES = 50_000;
const MAX_TREE_DEPTH = 64;
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;
const FILE_CONFLICT_CODE = "WORKSPACE_FILE_CONFLICT";

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".output",
  ".parcel-cache",
  ".turbo",
  ".vite",
  ".yarn",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target"
]);

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

type RecentProjectSettings = {
  recentProject?: {
    path?: unknown;
    name?: unknown;
  };
};

function settingsPath(): string {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateRelativePath(relativePath: unknown): string {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("A relative file path is required.");
  }

  const normalized = normalizeRelativePath(relativePath);
  if (path.isAbsolute(normalized) || normalized.split("/").includes("..")) {
    throw new Error("Invalid workspace path.");
  }
  return normalized;
}

function languageForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const languages: Record<string, string> = {
    ".c": "c",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".css": "css",
    ".go": "go",
    ".html": "html",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "javascript",
    ".md": "markdown",
    ".mjs": "javascript",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".scss": "scss",
    ".sh": "shell",
    ".sql": "sql",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".vue": "vue",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml"
  };
  return languages[extension] ?? "plaintext";
}

async function getRecentWorkspace(): Promise<{ rootPath: string; projectName: string }> {
  const raw = await fs.readFile(settingsPath(), "utf8");
  const parsed = JSON.parse(raw) as RecentProjectSettings;
  const projectPath = parsed.recentProject?.path;
  const projectName = parsed.recentProject?.name;

  if (typeof projectPath !== "string" || !path.isAbsolute(projectPath)) {
    throw new Error("No valid workspace is selected.");
  }

  const rootPath = await fs.realpath(projectPath);
  const stats = await fs.stat(rootPath);
  if (!stats.isDirectory()) {
    throw new Error("The selected workspace is not a directory.");
  }

  return {
    rootPath,
    projectName: typeof projectName === "string" && projectName.length > 0 ? projectName : path.basename(rootPath)
  };
}

async function resolveExistingWorkspaceFile(rootPath: string, relativePath: unknown): Promise<string> {
  const normalized = validateRelativePath(relativePath);
  const candidatePath = path.resolve(rootPath, normalized);
  if (!isPathInside(rootPath, candidatePath)) {
    throw new Error("Workspace path escapes the selected project.");
  }

  const realPath = await fs.realpath(candidatePath);
  if (!isPathInside(rootPath, realPath)) {
    throw new Error("Workspace path resolves outside the selected project.");
  }

  const stats = await fs.stat(realPath);
  if (!stats.isFile()) {
    throw new Error("The requested workspace path is not a file.");
  }
  return realPath;
}

async function enumerateDirectory(
  rootPath: string,
  directoryPath: string,
  depth: number,
  state: { count: number; truncated: boolean }
): Promise<WorkspaceTreeNode[]> {
  if (depth > MAX_TREE_DEPTH || state.count >= MAX_TREE_NODES) {
    state.truncated = true;
    return [];
  }

  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  entries.sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });

  const nodes: WorkspaceTreeNode[] = [];

  for (const entry of entries) {
    if (state.count >= MAX_TREE_NODES) {
      state.truncated = true;
      break;
    }

    if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    let realPath: string;
    try {
      realPath = await fs.realpath(absolutePath);
    } catch {
      continue;
    }

    if (!isPathInside(rootPath, realPath)) {
      continue;
    }

    const relativePath = normalizeRelativePath(path.relative(rootPath, realPath));

    if (entry.isDirectory()) {
      state.count += 1;
      const children = await enumerateDirectory(rootPath, realPath, depth + 1, state);
      nodes.push({ name: entry.name, relativePath, kind: "folder", children });
      continue;
    }

    if (entry.isFile()) {
      state.count += 1;
      nodes.push({ name: entry.name, relativePath, kind: "file" });
    }
  }

  return nodes;
}

export async function listWorkspaceTree(): Promise<WorkspaceTreeResult> {
  const workspace = await getRecentWorkspace();
  const state = { count: 0, truncated: false };
  const nodes = await enumerateDirectory(workspace.rootPath, workspace.rootPath, 0, state);

  return {
    projectName: workspace.projectName,
    rootPath: workspace.rootPath,
    nodes,
    nodeCount: state.count,
    truncated: state.truncated
  };
}

export async function readWorkspacePath(request: WorkspaceReadPathRequest): Promise<WorkspaceReadPathResult> {
  const workspace = await getRecentWorkspace();
  const realPath = await resolveExistingWorkspaceFile(workspace.rootPath, request?.relativePath);
  const stats = await fs.stat(realPath);
  if (stats.size > MAX_TEXT_FILE_BYTES) {
    throw new Error("The requested file is too large to open in the editor.");
  }

  const content = await fs.readFile(realPath, "utf8");
  if (content.includes("\u0000")) {
    throw new Error("Binary files cannot be opened in the text editor.");
  }

  return {
    relativePath: normalizeRelativePath(path.relative(workspace.rootPath, realPath)),
    content,
    language: languageForPath(realPath),
    readOnly: false
  };
}

async function writeWorkspacePath(request: WorkspaceWritePathRequest): Promise<WorkspaceWritePathResult> {
  if (!request || typeof request.content !== "string" || typeof request.expectedContent !== "string") {
    throw new Error("Text content and the last known file content are required.");
  }
  if (request.content.includes("\u0000") || request.expectedContent.includes("\u0000")) {
    throw new Error("Binary content cannot be saved in the text editor.");
  }

  const bytesWritten = Buffer.byteLength(request.content, "utf8");
  if (bytesWritten > MAX_TEXT_FILE_BYTES) {
    throw new Error("The file is too large to save from the editor.");
  }

  const workspace = await getRecentWorkspace();
  const realPath = await resolveExistingWorkspaceFile(workspace.rootPath, request.relativePath);
  const diskContent = await fs.readFile(realPath, "utf8");
  if (diskContent.includes("\u0000")) {
    throw new Error("Binary files cannot be saved in the text editor.");
  }
  if (!request.force && diskContent !== request.expectedContent) {
    throw new Error(`${FILE_CONFLICT_CODE}: The file changed on disk after it was opened.`);
  }

  await fs.writeFile(realPath, request.content, { encoding: "utf8", flag: "w" });

  return {
    relativePath: normalizeRelativePath(path.relative(workspace.rootPath, realPath)),
    bytesWritten,
    savedAt: new Date().toISOString()
  };
}

let registered = false;

export function registerWorkspaceTreeIpc(): void {
  if (registered) return;
  if (typeof ipcMain?.handle !== "function") return;
  registered = true;
  ipcMain.handle(WORKSPACE_TREE_CHANNEL, () => listWorkspaceTree());
  ipcMain.handle(WORKSPACE_READ_PATH_CHANNEL, (_event, request: WorkspaceReadPathRequest) => readWorkspacePath(request));
  ipcMain.handle(WORKSPACE_WRITE_PATH_CHANNEL, (_event, request: WorkspaceWritePathRequest) => writeWorkspacePath(request));
}

registerWorkspaceTreeIpc();
