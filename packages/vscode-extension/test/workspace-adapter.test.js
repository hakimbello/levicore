const assert = require("node:assert/strict");
const test = require("node:test");

const { VSCodeWorkspaceAdapter, isExcluded, looksBinary } = require("../src/vscode-workspace-adapter");
const { FakeUri, createFakeVSCode } = require("./fake-vscode");

test("normalizes single-root, multi-root, remote, and untitled workspaces", () => {
  const single = new VSCodeWorkspaceAdapter({ vscode: createFakeVSCode() });
  assert.equal(single.normalizeUri({}), "file:/workspace");
  assert.equal(single.validateWorkspace({}).mode, "single-root");

  const multi = new VSCodeWorkspaceAdapter({
    vscode: createFakeVSCode({
      workspaceFolders: [
        { name: "a", uri: FakeUri.parse("file:/a") },
        { name: "b", uri: FakeUri.parse("vscode-remote://ssh/b") },
      ],
    }),
  });
  assert.equal(multi.validateWorkspace({}).mode, "multi-root");
  assert.equal(multi.normalizeUri({ uri: "vscode-remote://ssh/b" }), "vscode-remote://ssh/b");

  const untitled = new VSCodeWorkspaceAdapter({ vscode: createFakeVSCode({ workspaceFolders: [], workspaceName: "No Folder" }) });
  assert.equal(untitled.validateWorkspace({}).mode, "untitled");
  assert.equal(untitled.normalizeUri({}), "untitled:levi-workspace");
});

test("opens workspace descriptors with deterministic revision evidence and metadata", () => {
  const adapter = new VSCodeWorkspaceAdapter({ vscode: createFakeVSCode() });
  const workspace = adapter.openWorkspace({ uri: "file:/workspace", projectId: "project-test" });
  const revision = adapter.getWorkspaceRevision(workspace);

  assert.equal(workspace.projectId, "project-test");
  assert.equal(workspace.repositoryType, "file");
  assert.match(revision, /^revision-/);
  assert.deepEqual(adapter.getWorkspaceMetadata(workspace).folders[0].name, "workspace");
});

test("lists files with bounds and exclusion defaults", async () => {
  const vscode = createFakeVSCode({
    files: {
      "file:/workspace/src/a.js": "a",
      "file:/workspace/src/b.js": "b",
      "file:/workspace/src/c.js": "c",
      "file:/workspace/node_modules/pkg/index.js": "ignored",
    },
  });
  const adapter = new VSCodeWorkspaceAdapter({ vscode, getConfiguration: () => ({ maximumFiles: 2 }) });
  const result = await adapter.listFiles({ uri: "file:/workspace" });

  assert.equal(result.files.length, 2);
  assert.equal(result.partial, true);
  assert.ok(isExcluded("node_modules/pkg/index.js", ["node_modules/**"]));
});

test("enforces file-size bounds, binary skipping, and inaccessible-file handling", async () => {
  const vscode = createFakeVSCode({
    files: {
      "file:/workspace/src/small.js": "const ok = true;",
      "file:/workspace/src/big.js": "x".repeat(20),
      "file:/workspace/src/bin.dat": Buffer.from([1, 2, 0, 3]),
    },
  });
  const adapter = new VSCodeWorkspaceAdapter({ vscode, getConfiguration: () => ({ maximumFileBytes: 10 }) });

  const small = await adapter.readFile({}, "file:/workspace/src/small.js", { maximumBytes: 100 });
  const big = await adapter.readFile({}, "file:/workspace/src/big.js", { maximumBytes: 10 });
  const binary = await adapter.readFile({}, "file:/workspace/src/bin.dat", { maximumBytes: 100 });
  const missing = await adapter.stat({}, "file:/workspace/src/missing.js");

  assert.equal(small.content, "const ok = true;");
  assert.equal(big.reason, "MAX_FILE_BYTES");
  assert.equal(binary.reason, "BINARY_FILE");
  assert.equal(missing.inaccessible, true);
  assert.equal(looksBinary(Buffer.from([0])), true);
});

test("watches workspace changes and disposes watchers", () => {
  const vscode = createFakeVSCode();
  const adapter = new VSCodeWorkspaceAdapter({ vscode });
  const events = [];
  const workspace = adapter.openWorkspace({ uri: "file:/workspace" });
  const id = adapter.watchWorkspace(workspace, (event) => events.push(event));

  const watcher = Array.from(adapter.watchers.values())[0].disposables.at(-1);
  watcher.__emitter.fire(FakeUri.parse("file:/workspace/src/app.js"));

  assert.equal(events.length >= 1, true);
  assert.equal(adapter.unwatchWorkspace(id), true);
  assert.equal(adapter.watchers.size, 0);
});
