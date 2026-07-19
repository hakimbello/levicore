const path = require("node:path");

class FakeEventEmitter {
  constructor() {
    this.listeners = [];
    this.event = (listener) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter((entry) => entry !== listener); } };
    };
  }

  fire(value) {
    for (const listener of this.listeners.slice()) listener(value);
  }

  dispose() {
    this.listeners = [];
  }
}

class FakeUri {
  constructor(scheme, pathValue) {
    this.scheme = scheme;
    this.path = pathValue || "";
    this.fsPath = scheme === "file" ? this.path.replace(/^\//, "") : "";
  }

  toString() {
    return `${this.scheme}:${this.path}`;
  }

  static parse(value) {
    if (value instanceof FakeUri) return value;
    const text = String(value);
    const match = text.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/);
    if (!match) return new FakeUri("file", text.startsWith("/") ? text : `/${text}`);
    return new FakeUri(match[1], match[2] || "");
  }

  static file(filePath) {
    return new FakeUri("file", `/${String(filePath).replace(/\\/g, "/").replace(/^\//, "")}`);
  }

  static joinPath(base, ...segments) {
    return new FakeUri(base.scheme, `${base.path.replace(/\/$/, "")}/${segments.join("/")}`);
  }
}

function createFakeVSCode(options = {}) {
  const commandHandlers = new Map();
  const treeProviders = new Map();
  const documentProviders = new Map();
  const outputLines = [];
  const progressCalls = [];
  const webviewMessages = [];
  const watcherEmitter = new FakeEventEmitter();
  const config = options.config || {};
  const files = new Map(Object.entries(options.files || {
    "file:/workspace/src/app.js": "function run() { return true; }\n",
    "file:/workspace/node_modules/pkg/index.js": "ignored",
  }).map(([key, value]) => [key, Buffer.isBuffer(value) ? value : Buffer.from(String(value))]));

  const workspaceFolders = options.workspaceFolders === undefined
    ? [{ name: "workspace", uri: FakeUri.parse("file:/workspace") }]
    : options.workspaceFolders;

  const vscode = {
    Uri: FakeUri,
    EventEmitter: FakeEventEmitter,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    ProgressLocation: { Notification: 15, Window: 10 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ViewColumn: { One: 1 },
    TreeItem: class FakeTreeItem {
      constructor(label, collapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    workspace: {
      workspaceFolders,
      workspaceFile: options.workspaceFile || null,
      name: options.workspaceName || "Fake Workspace",
      isTrusted: options.isTrusted !== false,
      fs: {
        async stat(uri) {
          const key = uri.toString();
          if (!files.has(key)) throw new Error("File not found.");
          return { type: 1, ctime: 1, mtime: 2, size: files.get(key).length };
        },
        async readFile(uri) {
          const key = uri.toString();
          if (!files.has(key)) throw new Error("File not found.");
          return files.get(key);
        },
        async writeFile(uri, content) {
          files.set(uri.toString(), Buffer.isBuffer(content) ? content : Buffer.from(content));
        },
        async delete(uri) {
          const key = uri.toString();
          if (!files.has(key)) throw new Error("File not found.");
          files.delete(key);
        },
        async rename(from, to, options = {}) {
          const fromKey = from.toString();
          const toKey = to.toString();
          if (!files.has(fromKey)) throw new Error("File not found.");
          if (files.has(toKey) && !options.overwrite) throw new Error("File already exists.");
          files.set(toKey, files.get(fromKey));
          files.delete(fromKey);
        },
      },
      async findFiles(include, exclude, maxResults) {
        const uris = Array.from(files.keys())
          .filter((key) => !String(key).includes("node_modules"))
          .slice(0, maxResults || undefined)
          .map((key) => FakeUri.parse(key));
        return uris;
      },
      createFileSystemWatcher() {
        return {
          onDidCreate: watcherEmitter.event,
          onDidChange: watcherEmitter.event,
          onDidDelete: watcherEmitter.event,
          dispose() {},
          __emitter: watcherEmitter,
        };
      },
      asRelativePath(uri) {
        return uri.path.replace(/^\/workspace\/?/, "");
      },
      getWorkspaceFolder(uri) {
        return workspaceFolders.find((folder) => uri.toString().startsWith(folder.uri.toString())) || workspaceFolders[0] || null;
      },
      getConfiguration(section) {
        return {
          get(key, fallback) {
            const full = `${section}.${key}`;
            if (Object.prototype.hasOwnProperty.call(config, full)) return config[full];
            if (Object.prototype.hasOwnProperty.call(config, key)) return config[key];
            return fallback;
          },
        };
      },
      registerTextDocumentContentProvider(scheme, provider) {
        documentProviders.set(scheme, provider);
        return { dispose: () => documentProviders.delete(scheme) };
      },
      async openTextDocument(uri) {
        const provider = documentProviders.get(uri.scheme);
        return { uri, getText: () => provider ? provider.provideTextDocumentContent(uri) : "" };
      },
      onDidChangeWorkspaceFolders(listener) {
        vscode.__workspaceFolderListener = listener;
        return { dispose() { vscode.__workspaceFolderListener = null; } };
      },
      onDidChangeConfiguration(listener) {
        vscode.__configurationListener = listener;
        return { dispose() { vscode.__configurationListener = null; } };
      },
    },
    window: {
      activeTextEditor: options.activeTextEditor || { document: { uri: FakeUri.parse("file:/workspace/src/app.js") } },
      createOutputChannel() {
        return {
          appendLine(line) { outputLines.push(line); },
          show() {},
          dispose() { outputLines.push("[disposed-output]"); },
        };
      },
      createStatusBarItem() {
        return {
          text: "",
          tooltip: "",
          command: null,
          show() { this.visible = true; },
          dispose() { this.disposed = true; },
        };
      },
      registerTreeDataProvider(id, provider) {
        treeProviders.set(id, provider);
        return { dispose: () => treeProviders.delete(id) };
      },
      async withProgress(options, task) {
        progressCalls.push(options);
        const cancellationListeners = [];
        return task({ report(update) { progressCalls.push(update); } }, {
          isCancellationRequested: false,
          onCancellationRequested(listener) {
            cancellationListeners.push(listener);
            return { dispose() {} };
          },
        });
      },
      async showTextDocument(document) {
        vscode.__lastDocument = document;
        return { document };
      },
      async showInformationMessage(message, ...items) {
        vscode.__lastInfo = message;
        return options.nextMessageChoice || items[0];
      },
      async showWarningMessage(message, ...items) {
        vscode.__lastWarning = message;
        return options.nextWarningChoice || findChoice(items, "Approve") || items[0];
      },
      async showErrorMessage(message, ...items) {
        vscode.__lastError = message;
        return items[0];
      },
      async showInputBox() {
        return options.nextInput || "runtime";
      },
      async showQuickPick(items) {
        return options.nextQuickPick || items[0];
      },
      createWebviewPanel(viewType, title, showOptions, panelOptions) {
        const receiveEmitter = new FakeEventEmitter();
        const disposeEmitter = new FakeEventEmitter();
        const panel = {
          viewType,
          title,
          showOptions,
          panelOptions,
          webview: {
            html: "",
            postMessage(message) { webviewMessages.push(message); return Promise.resolve(true); },
            onDidReceiveMessage: receiveEmitter.event,
            __receive(message) { receiveEmitter.fire(message); },
          },
          onDidDispose: disposeEmitter.event,
          dispose() { panel.disposed = true; disposeEmitter.fire(undefined); },
        };
        vscode.__lastWebviewPanel = panel;
        return panel;
      },
    },
    commands: {
      registerCommand(id, handler) {
        commandHandlers.set(id, handler);
        return { dispose: () => commandHandlers.delete(id) };
      },
      async executeCommand(id, ...args) {
        if (id === "workbench.view.extension.levi") {
          vscode.__dashboardOpened = true;
          return true;
        }
        const handler = commandHandlers.get(id);
        if (!handler) throw new Error(`Unknown command ${id}.`);
        return handler(...args);
      },
    },
    __commandHandlers: commandHandlers,
    __treeProviders: treeProviders,
    __documentProviders: documentProviders,
    __outputLines: outputLines,
    __progressCalls: progressCalls,
    __webviewMessages: webviewMessages,
    __files: files,
  };

  return vscode;
}

function createFakeContext() {
  const secrets = new Map();
  const globalValues = new Map();
  const workspaceValues = new Map();
  return {
    subscriptions: [],
    extensionPath: path.join(process.cwd(), "packages", "vscode-extension"),
    globalStorageUri: FakeUri.file(path.join(process.cwd(), ".test-vscode-storage")),
    globalState: {
      get(key, fallback) { return globalValues.has(key) ? globalValues.get(key) : fallback; },
      update(key, value) { globalValues.set(key, value); return Promise.resolve(); },
      __values: globalValues,
    },
    workspaceState: {
      get(key, fallback) { return workspaceValues.has(key) ? workspaceValues.get(key) : fallback; },
      update(key, value) { workspaceValues.set(key, value); return Promise.resolve(); },
      __values: workspaceValues,
    },
    secrets: {
      async get(key) { return secrets.get(key); },
      async store(key, value) { secrets.set(key, value); },
      async delete(key) { secrets.delete(key); },
      __values: secrets,
    },
  };
}

function findChoice(items, label) {
  return items.find((item) => item === label || item && item.title === label);
}

module.exports = {
  FakeEventEmitter,
  FakeUri,
  createFakeContext,
  createFakeVSCode,
};
