const crypto = require("node:crypto");
const { DEFAULT_WORKSPACE_EXCLUDES, UI_BOUNDS } = require("./constants");

class VSCodeWorkspaceAdapter {
  constructor(options = {}) {
    this.vscode = requiredObject(options.vscode, "VS Code API is required.");
    this.getConfiguration = typeof options.getConfiguration === "function" ? options.getConfiguration : () => ({});
    this.output = options.output || null;
    this.watchers = new Map();
    this.nextWatcherId = 0;
  }

  normalizeUri(input = {}) {
    if (typeof input === "string") return this.parseUri(input).toString();
    if (input.uri && typeof input.uri.toString === "function") return input.uri.toString();
    if (input.uri && typeof input.uri === "string") return this.parseUri(input.uri).toString();
    if (input.resourceUri && typeof input.resourceUri.toString === "function") return input.resourceUri.toString();
    if (input.rootPath) return this.parseUri(input.rootPath).toString();
    const folder = this.activeWorkspaceFolder(input);
    if (folder && folder.uri) return folder.uri.toString();
    if (this.vscode.workspace.workspaceFile) return this.vscode.workspace.workspaceFile.toString();
    return "untitled:levi-workspace";
  }

  validateWorkspace(input = {}) {
    const folders = this.workspaceFolders();
    const uri = this.normalizeUri(input);
    return {
      valid: true,
      uri,
      mode: folders.length > 1 ? "multi-root" : folders.length === 1 ? "single-root" : "untitled",
      remote: !uri.startsWith("file:"),
      evidence: [{
        source: "VSCodeWorkspaceAdapter",
        signal: "workspace normalized",
        workspaceFolderCount: folders.length,
      }],
    };
  }

  openWorkspace(input = {}, options = {}) {
    const uri = this.normalizeUri(input);
    const folders = this.workspaceFolders();
    const folder = this.activeWorkspaceFolder(input);
    return {
      id: input.id || stableId("vscode-workspace", { uri, folders: folders.map((entry) => entry.uri.toString()) }),
      uri,
      name: input.name || folder && folder.name || this.workspaceName(uri),
      rootPath: uri,
      projectId: input.projectId || stableId("project", uri),
      repositoryType: uri.startsWith("file:") ? "file" : "vscode-uri",
      revision: this.getWorkspaceRevision({ uri, metadata: { folders: folders.map(folderMetadata) } }),
      capabilities: [],
      limitations: folders.length === 0 ? ["No workspace folder is open; using untitled workspace identity."] : [],
      health: { status: "OPEN", adapter: "VSCodeWorkspaceAdapter" },
      metadata: {
        adapter: "VSCodeWorkspaceAdapter",
        folders: folders.map(folderMetadata),
        workspaceFile: this.vscode.workspace.workspaceFile ? this.vscode.workspace.workspaceFile.toString() : null,
        remote: !uri.startsWith("file:"),
        options: safeClone(options),
      },
    };
  }

  closeWorkspace(workspace) {
    for (const [id, watcher] of Array.from(this.watchers.entries())) {
      if (watcher.workspaceId === workspace.id) this.unwatchWorkspace(id);
    }
    return { status: "CLOSED", workspaceId: workspace.id };
  }

  getWorkspaceMetadata(workspace = {}) {
    return {
      adapter: "VSCodeWorkspaceAdapter",
      folders: this.workspaceFolders().map(folderMetadata),
      workspaceUri: workspace.uri || this.normalizeUri({}),
      configurationHash: stableHash(this.adapterConfiguration()),
      generatedAt: new Date().toISOString(),
    };
  }

  getWorkspaceRevision(workspace = {}) {
    const folders = this.workspaceFolders().map((folder) => ({
      name: folder.name,
      uri: folder.uri.toString(),
      scheme: folder.uri.scheme,
    }));
    return stableId("revision", {
      workspaceUri: workspace.uri || this.normalizeUri({}),
      folders,
      configuration: this.adapterConfiguration(),
      gitRevision: workspace.metadata && workspace.metadata.gitRevision || null,
    });
  }

  async listFiles(workspace = {}, options = {}) {
    const config = this.adapterConfiguration(options);
    const maxFiles = positiveInteger(options.maximumFiles || config.maximumFiles, UI_BOUNDS.maximumWorkspaceFiles);
    const include = options.include || "**/*";
    const exclude = exclusionGlob(config.exclude);
    const token = options.cancellationToken || options.token || null;
    if (isCancelled(token)) return { files: [], partial: true, limitations: ["Cancelled before file listing."] };
    const uris = await this.vscode.workspace.findFiles(include, exclude, maxFiles + 1, token);
    const partial = uris.length > maxFiles;
    const files = uris.slice(0, maxFiles).map((uri) => ({
      uri: uri.toString(),
      relativePath: this.relativePath(uri),
      scheme: uri.scheme,
    }));
    return {
      files,
      partial,
      limitations: partial ? [`File listing truncated at ${maxFiles} item(s).`] : [],
      evidence: [{ source: "VSCodeWorkspaceAdapter", signal: "findFiles", count: files.length }],
    };
  }

  async readFile(workspace, uriInput, options = {}) {
    const config = this.adapterConfiguration(options);
    const uri = this.parseUri(uriInput);
    const stat = await this.stat(workspace, uri, options);
    const maxBytes = positiveInteger(options.maximumBytes || config.maximumFileBytes, UI_BOUNDS.maximumFileBytes);
    if (stat.size > maxBytes) {
      return {
        uri: uri.toString(),
        skipped: true,
        reason: "MAX_FILE_BYTES",
        size: stat.size,
        maximumBytes: maxBytes,
      };
    }
    const bytes = await this.vscode.workspace.fs.readFile(uri);
    if (looksBinary(bytes)) {
      return {
        uri: uri.toString(),
        skipped: true,
        reason: "BINARY_FILE",
        size: bytes.length,
      };
    }
    const content = Buffer.from(bytes).toString("utf8");
    return {
      uri: uri.toString(),
      content,
      bytes: bytes.length,
      encoding: "utf8",
      evidence: [{ source: "VSCodeWorkspaceAdapter", signal: "readFile", size: bytes.length }],
    };
  }

  async stat(workspace, uriInput) {
    const uri = this.parseUri(uriInput || workspace.uri);
    try {
      const stat = await this.vscode.workspace.fs.stat(uri);
      return {
        uri: uri.toString(),
        type: stat.type,
        ctime: stat.ctime || null,
        mtime: stat.mtime || null,
        size: stat.size || 0,
        inaccessible: false,
      };
    } catch (error) {
      return {
        uri: uri.toString(),
        inaccessible: true,
        error: error.message,
        size: 0,
      };
    }
  }

  watchWorkspace(workspace, listener, options = {}) {
    if (this.watchers.size >= UI_BOUNDS.maximumWatcherCount) {
      throw new Error("Maximum Levi workspace watcher count exceeded.");
    }
    const config = this.adapterConfiguration(options);
    const pattern = options.pattern || "**/*";
    const watcher = this.vscode.workspace.createFileSystemWatcher(pattern, false, false, false);
    const id = `vscode-watch-${++this.nextWatcherId}`;
    const notify = (type) => (uri) => {
      if (isExcluded(this.relativePath(uri), config.exclude)) return;
      listener({
        type,
        uri: uri.toString(),
        workspaceId: workspace.id,
        revision: this.getWorkspaceRevision(workspace),
        timestamp: new Date().toISOString(),
      });
    };
    const disposables = [
      watcher.onDidCreate ? watcher.onDidCreate(notify("created")) : null,
      watcher.onDidChange ? watcher.onDidChange(notify("changed")) : null,
      watcher.onDidDelete ? watcher.onDidDelete(notify("deleted")) : null,
      watcher,
    ].filter(Boolean);
    this.watchers.set(id, { id, workspaceId: workspace.id, disposables });
    return id;
  }

  unwatchWorkspace(subscriptionId) {
    const watcher = this.watchers.get(subscriptionId);
    if (!watcher) return false;
    for (const disposable of watcher.disposables) {
      if (disposable && typeof disposable.dispose === "function") disposable.dispose();
    }
    this.watchers.delete(subscriptionId);
    return true;
  }

  resolvePath(workspace = {}, input = "") {
    const raw = typeof input === "string" ? input : input.uri || input.path || "";
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return this.parseUri(raw).toString();
    const folder = this.activeWorkspaceFolder({ uri: workspace.uri });
    const base = folder && folder.uri || this.parseUri(workspace.uri || this.normalizeUri({}));
    if (this.vscode.Uri && typeof this.vscode.Uri.joinPath === "function") {
      return this.vscode.Uri.joinPath(base, ...String(raw).split(/[\\/]+/).filter(Boolean)).toString();
    }
    return `${base.toString().replace(/\/$/, "")}/${String(raw).replace(/^[/\\]+/, "")}`;
  }

  dispose() {
    for (const id of Array.from(this.watchers.keys())) this.unwatchWorkspace(id);
  }

  activeWorkspaceFolder(input = {}) {
    if (input.uri) {
      const uri = this.parseUri(input.uri);
      const folder = this.vscode.workspace.getWorkspaceFolder && this.vscode.workspace.getWorkspaceFolder(uri);
      if (folder) return folder;
    }
    return this.workspaceFolders()[0] || null;
  }

  workspaceFolders() {
    return Array.isArray(this.vscode.workspace.workspaceFolders) ? this.vscode.workspace.workspaceFolders : [];
  }

  relativePath(uri) {
    if (this.vscode.workspace.asRelativePath) return this.vscode.workspace.asRelativePath(uri, false);
    return uri.path || uri.toString();
  }

  workspaceName(uri) {
    const folders = this.workspaceFolders();
    if (folders.length === 1) return folders[0].name;
    if (folders.length > 1) return "Multi-root Workspace";
    if (this.vscode.workspace.name) return this.vscode.workspace.name;
    return String(uri).split(/[/:\\]+/).filter(Boolean).pop() || "Untitled Workspace";
  }

  parseUri(value) {
    if (value && typeof value.toString === "function" && value.scheme) return value;
    if (this.vscode.Uri && typeof this.vscode.Uri.parse === "function") return this.vscode.Uri.parse(String(value));
    throw new Error("VS Code URI parser is unavailable.");
  }

  adapterConfiguration(overrides = {}) {
    const config = this.getConfiguration() || {};
    return {
      maximumFiles: positiveInteger(overrides.maximumFiles || config.maximumFiles || config.maxFiles, UI_BOUNDS.maximumWorkspaceFiles),
      maximumFileBytes: positiveInteger(overrides.maximumFileBytes || config.maximumFileBytes || config.maxFileBytes, UI_BOUNDS.maximumFileBytes),
      exclude: Array.isArray(overrides.exclude) ? overrides.exclude : Array.isArray(config.exclude) ? config.exclude : DEFAULT_WORKSPACE_EXCLUDES,
    };
  }
}

function exclusionGlob(patterns) {
  const entries = Array.from(new Set((patterns || DEFAULT_WORKSPACE_EXCLUDES).filter(Boolean)));
  if (entries.length === 0) return undefined;
  return entries.length === 1 ? entries[0] : `{${entries.join(",")}}`;
}

function isExcluded(relativePath, patterns) {
  const normalized = String(relativePath || "").replace(/\\/g, "/");
  return (patterns || DEFAULT_WORKSPACE_EXCLUDES).some((pattern) => matchesGlob(normalized, pattern));
}

function matchesGlob(value, pattern) {
  const text = String(pattern || "").replace(/\\/g, "/").replace(/^\*\*\//, "");
  if (text.endsWith("/**")) return value === text.slice(0, -3) || value.startsWith(text.slice(0, -2));
  if (text.startsWith("**/*")) return value.endsWith(text.slice(4));
  if (text.includes("*")) {
    const regex = new RegExp(`^${text.split("*").map(escapeRegex).join(".*")}$`);
    return regex.test(value);
  }
  return value === text || value.startsWith(`${text}/`);
}

function looksBinary(bytes) {
  const limit = Math.min(bytes.length || 0, 512);
  for (let index = 0; index < limit; index += 1) {
    if (bytes[index] === 0) return true;
  }
  return false;
}

function isCancelled(token) {
  return token && token.isCancellationRequested === true;
}

function folderMetadata(folder) {
  return {
    name: folder.name,
    uri: folder.uri.toString(),
    scheme: folder.uri.scheme,
  };
}

function stableId(prefix, value) {
  return `${prefix}-${stableHash(value)}`;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 16);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function safeClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function requiredObject(value, message) {
  if (!value || typeof value !== "object") throw new Error(message);
  return value;
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

module.exports = {
  VSCodeWorkspaceAdapter,
  exclusionGlob,
  isExcluded,
  looksBinary,
};
