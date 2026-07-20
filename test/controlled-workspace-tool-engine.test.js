const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ChangeStates,
  CommandClasses,
  ControlledWorkspaceToolEngine,
  FileOperations,
  MemoryPersistenceAdapter,
  stableHash,
} = require("../src/controlled-workspace-tool-engine");
const { LeviApplicationRuntime, ApprovalStatuses } = require("../src/levi-application-runtime");

test("normalizes controlled workspace tools and reports degraded health without mutation adapter", () => {
  const engine = new ControlledWorkspaceToolEngine();
  const init = engine.initialize({ restore: false });
  assert.equal(init.status, "READY");
  assert.ok(engine.listTools().some((tool) => tool.id === "change.createProposal"));
  assert.ok(engine.getHealth().warnings.some((warning) => warning.includes("WorkspaceMutationAdapter")));
  assert.equal(engine.getHealth().trust.mutationDefault, "DISABLED_BY_DEFAULT");
});

test("creates, validates, previews, approves, applies, verifies, and reverts a text proposal through adapters", async () => {
  const adapter = new MemoryWorkspaceMutationAdapter({ "src/app.js": "const value = 1;\n" });
  const engine = new ControlledWorkspaceToolEngine({
    workspaceAdapter: adapter,
    configuration: { allowSourceChanges: true, requireCheckpointBeforeMutation: false },
  });
  const proposal = await engine.createProposal({
    workspace: { id: "workspace-1" },
    title: "Update value",
    fileChanges: [{ operation: FileOperations.UPDATE, path: "src/app.js", proposedContent: "const value = 2;\n" }],
  });
  assert.equal(adapter.files.get("src/app.js"), "const value = 1;\n");
  assert.equal(proposal.state, ChangeStates.READY_FOR_REVIEW);
  assert.match(engine.previewProposal({ proposalId: proposal.id }).patch.diff, /const value = 2/);
  await assert.rejects(() => engine.applyPatch({ proposalId: proposal.id }), /requires an approved/);
  const approved = engine.bindApproval({
    proposalId: proposal.id,
    proposalHash: proposal.proposalHash,
    workspaceRevision: proposal.workspaceRevision,
    status: "APPROVED",
  });
  assert.equal(approved.state, ChangeStates.APPROVED);
  const application = await engine.applyPatch({ proposalId: proposal.id });
  assert.equal(application.state, "VERIFIED");
  assert.equal(adapter.files.get("src/app.js"), "const value = 2;\n");
  const reverted = await engine.revertChange({ proposalId: proposal.id });
  assert.equal(reverted.state, "REVERTED");
  assert.equal(adapter.files.get("src/app.js"), "const value = 1;\n");
});

test("blocks protected paths, traversal paths, stale edits, and disabled create/delete/rename operations", async () => {
  const adapter = new MemoryWorkspaceMutationAdapter({ "src/app.js": "a\n" });
  const engine = new ControlledWorkspaceToolEngine({ workspaceAdapter: adapter });
  await assert.rejects(() => engine.createProposal({ fileChanges: [{ operation: "UPDATE", path: "../escape.js", proposedContent: "x" }] }), /Unsafe workspace path/);
  await assert.rejects(() => engine.createProposal({ fileChanges: [{ operation: "UPDATE", path: ".env", proposedContent: "SECRET=1" }] }), /Protected path/);
  const create = await engine.createProposal({ fileChanges: [{ operation: "CREATE", path: "src/new.js", proposedContent: "x" }] });
  assert.equal(create.state, ChangeStates.INVALID);
  assert.equal(create.validations[0].findings.some((entry) => entry.code === "CREATE_DISABLED"), true);
  const stale = await engine.createProposal({ fileChanges: [{ operation: "UPDATE", path: "src/app.js", proposedContent: "b\n" }] });
  adapter.files.set("src/app.js", "changed\n");
  const validation = await engine.validateProposal(stale.id);
  assert.equal(validation.valid, false);
  assert.equal(validation.findings.some((entry) => entry.code === "STALE_FILE"), true);
});

test("allowlists validation commands and rejects shell-control arguments", async () => {
  const commandAdapter = new MemoryCommandExecutionAdapter();
  const engine = new ControlledWorkspaceToolEngine({
    commandAdapter,
    configuration: { allowCommandExecution: true },
  });
  engine.registerCommand({ id: "validation.echo", executable: "echo", arguments: ["ok"], commandClass: CommandClasses.TEST });
  const result = await engine.runCommand({
    commandId: "validation.echo",
    approval: { status: "APPROVED" },
  });
  assert.equal(result.status, "SUCCEEDED");
  await assert.rejects(() => engine.runCommand({
    commandId: "validation.echo",
    arguments: ["ok; rm"],
    approval: { status: "APPROVED" },
  }), /shell control/);
  engine.registerCommand({ id: "validation.custom", executable: "custom", commandClass: CommandClasses.CUSTOM });
  await assert.rejects(() => engine.runCommand({ commandId: "validation.custom", approval: { status: "APPROVED" } }), /not allowlisted/);
});

test("persists and restores proposals through an injected persistence adapter", async () => {
  const persistence = new MemoryPersistenceAdapter();
  const engine = new ControlledWorkspaceToolEngine({
    workspaceAdapter: new MemoryWorkspaceMutationAdapter({ "src/app.js": "a\n" }),
    persistenceAdapter: persistence,
  });
  const proposal = await engine.createProposal({ fileChanges: [{ operation: "UPDATE", path: "src/app.js", proposedContent: "b\n" }] });
  assert.equal(engine.save().status, "PERSISTED");
  const restored = new ControlledWorkspaceToolEngine({ persistenceAdapter: persistence });
  assert.equal(restored.load().status, "LOADED");
  assert.equal(restored.getProposal(proposal.id).id, proposal.id);
});

test("runtime commands expose controlled workspace tools and keep apply behind runtime approval", async () => {
  const adapter = new MemoryWorkspaceMutationAdapter({ "src/app.js": "one\n" });
  const runtime = new LeviApplicationRuntime({
    enableWorkspaceTools: true,
    workspaceMutationAdapter: adapter,
    workspaceToolConfiguration: { allowSourceChanges: true, requireCheckpointBeforeMutation: false },
  });
  await runtime.initialize({ skipChecks: true });
  const health = await runtime.executeCommand("workspaceTools.health", {});
  assert.equal(health.success, true);
  const created = await runtime.executeCommand("change.createProposal", { fileChanges: [{ operation: "UPDATE", path: "src/app.js", proposedContent: "two\n" }] });
  const pending = await runtime.executeCommand("change.apply", { proposalId: created.data.id });
  assert.equal(pending.data.status, "WAITING_FOR_APPROVAL");
  const request = pending.data.approvalRequest;
  await runtime.executeCommand("approval.respond", { approvalRequestId: request.id, decision: ApprovalStatuses.APPROVED });
  const applied = await runtime.executeCommand("change.apply", { proposalId: created.data.id, approvalRequestId: request.id });
  assert.equal(applied.data.state, "VERIFIED");
  assert.equal(adapter.files.get("src/app.js"), "two\n");
});

test("agent registry includes controlled workspace tools through runtime command definitions", async () => {
  const runtime = new LeviApplicationRuntime({ enableWorkspaceTools: true, enableAgentOrchestration: true });
  const agent = runtime.agentEngine();
  const tools = agent.listTools({});
  assert.ok(tools.some((tool) => tool.id === "change.createProposal" && tool.runtimeCommandId === "change.createProposal"));
  assert.ok(tools.some((tool) => tool.id === "change.applyApproved" && tool.approvalSensitive === true));
});

test("validation.run forwards scoped nested command approval and rejects unsafe approval reuse", async () => {
  const executions = [];
  const commandAdapter = {
    validateCommand() { return { valid: true }; },
    executeCommand(request) {
      executions.push(request.commandId);
      return { status: "SUCCEEDED", exitCode: 0, stdout: `ok ${request.commandId}`, stderr: "" };
    },
    cancelCommand(id) { return { status: "CANCELLED", id }; },
    getEnvironmentInfo() { return { status: "AVAILABLE" }; },
  };
  const workspaceAdapter = new MemoryWorkspaceMutationAdapter({ "src/app.js": "const value = 1;\n" });
  const engine = new ControlledWorkspaceToolEngine({
    workspaceAdapter,
    commandAdapter,
    configuration: {
      allowSourceChanges: true,
      allowCommandExecution: true,
      requireApprovalForCommands: true,
      requireCheckpointBeforeMutation: false,
    },
    validationProfiles: [{ id: "default", name: "Default", commandIds: ["validation.test"] }],
  });

  const proposal = await engine.createProposal({
    workspace: { id: "workspace-a" },
    title: "Update value",
    fileChanges: [{ operation: FileOperations.UPDATE, path: "src/app.js", proposedContent: "const value = 2;\n" }],
  });
  engine.bindApproval({
    proposalId: proposal.id,
    proposalHash: proposal.proposalHash,
    workspaceRevision: proposal.workspaceRevision,
    status: "APPROVED",
  });
  await engine.applyPatch({ proposalId: proposal.id });
  assert.equal(executions.length, 0);

  await assert.rejects(
    () => engine.validateChange({ proposalId: proposal.id, profileIds: ["default"] }),
    /requires explicit approval/
  );
  assert.equal(executions.length, 0);

  await assert.rejects(
    () => engine.validateChange({
      proposalId: proposal.id,
      profileIds: ["default"],
      approval: { id: "cmd-rejected", status: "REJECTED", commandIds: ["validation.run"], nestedCommandIds: ["validation.test"], workspaceId: "workspace-a", proposalId: proposal.id },
    }),
    /approval was rejected/
  );
  assert.equal(executions.length, 0);

  await assert.rejects(
    () => engine.validateChange({
      proposalId: proposal.id,
      profileIds: ["default"],
      approval: { id: "cmd-mismatch", status: "APPROVED", commandIds: ["validation.lint"], workspaceId: "workspace-a", proposalId: proposal.id },
    }),
    /not authorized/
  );
  assert.equal(executions.length, 0);

  await assert.rejects(
    () => engine.validateChange({
      proposalId: proposal.id,
      profileIds: ["default"],
      workspaceId: "workspace-a",
      approval: { id: "cmd-workspace", status: "APPROVED", commandIds: ["validation.run"], nestedCommandIds: ["validation.test"], workspaceId: "workspace-b", proposalId: proposal.id },
    }),
    /workspace does not match/
  );
  assert.equal(executions.length, 0);

  const validationApproval = {
    id: "cmd-valid-nested",
    status: "APPROVED",
    commandIds: ["validation.run"],
    nestedCommandIds: ["validation.test"],
    workspaceId: "workspace-a",
    proposalId: proposal.id,
  };
  const nested = await engine.validateChange({
    proposalId: proposal.id,
    profileIds: ["default"],
    workspaceId: "workspace-a",
    approval: validationApproval,
  });
  assert.equal(nested.status, "SUCCEEDED");
  assert.deepEqual(executions, ["validation.test"]);

  await assert.rejects(
    () => engine.validateChange({
      proposalId: proposal.id,
      profileIds: ["default"],
      workspaceId: "workspace-a",
      approval: validationApproval,
    }),
    /already been consumed/
  );
  assert.deepEqual(executions, ["validation.test"]);

  await assert.rejects(
    () => engine.runCommand({
      commandId: "validation.test",
      proposalId: proposal.id,
      workspaceId: "workspace-a",
      approval: {
        id: "cmd-other",
        status: "APPROVED",
        commandIds: ["validation.lint"],
        workspaceId: "workspace-a",
        proposalId: proposal.id,
      },
    }),
    /not authorized/
  );

  const direct = await engine.runCommand({
    commandId: "validation.test",
    proposalId: proposal.id,
    workspaceId: "workspace-a",
    approval: {
      id: "cmd-direct",
      status: "APPROVED",
      commandIds: ["validation.test"],
      workspaceId: "workspace-a",
      proposalId: proposal.id,
    },
  });
  assert.equal(direct.status, "SUCCEEDED");
  assert.deepEqual(executions, ["validation.test", "validation.test"]);

  await assert.rejects(
    () => engine.runCommand({
      commandId: "validation.package",
      proposalId: proposal.id,
      workspaceId: "workspace-a",
      approval: {
        id: "cmd-direct",
        status: "APPROVED",
        commandIds: ["validation.test"],
        workspaceId: "workspace-a",
        proposalId: proposal.id,
      },
    }),
    /not authorized|already been consumed/
  );
});

test("runtime validation.run requests approval then executes nested validation.test with bound approval", async () => {
  const executions = [];
  const commandAdapter = {
    validateCommand() { return { valid: true }; },
    executeCommand(request) {
      executions.push(request.commandId);
      return { status: "SUCCEEDED", exitCode: 0, stdout: "ok 1\n# tests 1\n# pass 1\n", stderr: "" };
    },
    cancelCommand(id) { return { status: "CANCELLED", id }; },
    getEnvironmentInfo() { return { status: "AVAILABLE" }; },
  };
  const adapter = new MemoryWorkspaceMutationAdapter({ "src/app.js": "one\n" });
  const runtime = new LeviApplicationRuntime({
    enableWorkspaceTools: true,
    workspaceMutationAdapter: adapter,
    commandExecutionAdapter: commandAdapter,
    workspaceToolConfiguration: {
      allowSourceChanges: true,
      allowCommandExecution: true,
      requireApprovalForCommands: true,
      requireCheckpointBeforeMutation: false,
      validationProfiles: [{ id: "default", name: "Default", commandIds: ["validation.test"] }],
    },
  });
  await runtime.initialize({ skipChecks: true });

  const created = await runtime.executeCommand("change.createProposal", {
    workspace: { id: "workspace-runtime" },
    fileChanges: [{ operation: "UPDATE", path: "src/app.js", proposedContent: "two\n" }],
  });
  const pendingApply = await runtime.executeCommand("change.apply", { proposalId: created.data.id });
  assert.equal(pendingApply.data.status, "WAITING_FOR_APPROVAL");
  await runtime.executeCommand("approval.respond", {
    approvalRequestId: pendingApply.data.approvalRequest.id,
    decision: ApprovalStatuses.APPROVED,
  });
  const applied = await runtime.executeCommand("change.apply", {
    proposalId: created.data.id,
    approvalRequestId: pendingApply.data.approvalRequest.id,
  });
  assert.equal(applied.data.state, "VERIFIED");
  assert.equal(executions.length, 0);

  const pendingValidation = await runtime.executeCommand("validation.run", {
    proposalId: created.data.id,
    profileIds: ["default"],
  });
  assert.equal(pendingValidation.data.status, "WAITING_FOR_APPROVAL");
  assert.equal(executions.length, 0);

  await runtime.executeCommand("approval.respond", {
    approvalRequestId: pendingValidation.data.approvalRequest.id,
    decision: ApprovalStatuses.APPROVED,
    decidedBy: "tester",
  });
  const validated = await runtime.executeCommand("validation.run", {
    proposalId: created.data.id,
    profileIds: ["default"],
    approvalRequestId: pendingValidation.data.approvalRequest.id,
  });
  assert.equal(validated.success, true);
  assert.equal(validated.data.status, "SUCCEEDED");
  assert.deepEqual(executions, ["validation.test"]);

  const directPending = await runtime.executeCommand("command.runValidation", {
    commandId: "validation.test",
    proposalId: created.data.id,
    workspaceId: "workspace-runtime",
  });
  assert.equal(directPending.data.status, "WAITING_FOR_APPROVAL");
  await runtime.executeCommand("approval.respond", {
    approvalRequestId: directPending.data.approvalRequest.id,
    decision: ApprovalStatuses.APPROVED,
  });
  const direct = await runtime.executeCommand("command.runValidation", {
    commandId: "validation.test",
    proposalId: created.data.id,
    workspaceId: "workspace-runtime",
    approvalRequestId: directPending.data.approvalRequest.id,
  });
  assert.equal(direct.success, true);
  assert.equal(direct.data.status, "SUCCEEDED");
  assert.deepEqual(executions, ["validation.test", "validation.test"]);
});

class MemoryWorkspaceMutationAdapter {
  constructor(files = {}) {
    this.files = new Map(Object.entries(files));
    this.revision = "revision-1";
  }

  readFile(workspace, uri) {
    if (!this.files.has(uri)) throw new Error(`File not found: ${uri}`);
    const content = this.files.get(uri);
    return { uri, content, hash: stableHash(content), size: Buffer.byteLength(content, "utf8"), revision: this.revision };
  }

  stat(workspace, uri) {
    return { uri, exists: this.files.has(uri), size: this.files.has(uri) ? Buffer.byteLength(this.files.get(uri), "utf8") : 0 };
  }

  applyEdits(workspace, uri, edits, options = {}) {
    const read = this.readFile(workspace, uri);
    if (options.expectedHash && read.hash !== options.expectedHash) throw new Error("stale");
    let content = read.content;
    for (const edit of edits.slice().sort((left, right) => Number(right.start || 0) - Number(left.start || 0))) {
      const start = edit.start === null || edit.start === undefined ? 0 : Number(edit.start);
      const end = edit.end === null || edit.end === undefined ? content.length : Number(edit.end);
      content = content.slice(0, start) + edit.newText + content.slice(end);
    }
    this.files.set(uri, content);
    this.revision = stableHash(Array.from(this.files.entries()));
    return { status: "APPLIED", uri };
  }

  createFile(workspace, uri, content) {
    this.files.set(uri, String(content || ""));
    return { status: "APPLIED", uri };
  }

  deleteFile(workspace, uri) {
    this.files.delete(uri);
    return { status: "APPLIED", uri };
  }

  renameFile(workspace, from, to) {
    this.files.set(to, this.files.get(from));
    this.files.delete(from);
    return { status: "APPLIED", uri: from, targetUri: to };
  }

  verifyFile(workspace, uri, expectation = {}) {
    if (expectation.operation === "DELETE") return { valid: !this.files.has(uri) };
    const read = this.readFile(workspace, uri);
    return { valid: !expectation.expectedHash || read.hash === expectation.expectedHash, hash: read.hash };
  }

  getWorkspaceRevision() {
    return this.revision;
  }
}

class MemoryCommandExecutionAdapter {
  validateCommand() {
    return { valid: true };
  }

  executeCommand(request) {
    return { status: "SUCCEEDED", exitCode: 0, stdout: request.arguments.join(" "), stderr: "" };
  }

  cancelCommand(id) {
    return { status: "CANCELLED", id };
  }

  getEnvironmentInfo() {
    return { status: "AVAILABLE" };
  }
}
