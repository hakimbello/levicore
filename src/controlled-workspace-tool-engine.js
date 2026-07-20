const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const CONTROLLED_WORKSPACE_TOOL_SCHEMA_VERSION = 1;

const EngineStates = Object.freeze({
  CREATED: "CREATED",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  SUSPENDED: "SUSPENDED",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
});

const ToolCategories = Object.freeze({
  WORKSPACE_READ: "WORKSPACE_READ",
  CHANGE_PROPOSAL: "CHANGE_PROPOSAL",
  PATCH_PREVIEW: "PATCH_PREVIEW",
  MUTATION: "MUTATION",
  VALIDATION: "VALIDATION",
  COMMAND: "COMMAND",
  SOURCE_CONTROL: "SOURCE_CONTROL",
});

const ToolRiskLevels = Object.freeze({
  NONE: "NONE",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const MutationScopes = Object.freeze({
  NONE: "NONE",
  WORKSPACE_METADATA: "WORKSPACE_METADATA",
  FILE_CONTENT: "FILE_CONTENT",
  FILE_CREATE: "FILE_CREATE",
  FILE_DELETE: "FILE_DELETE",
  FILE_RENAME: "FILE_RENAME",
  SOURCE_CONTROL: "SOURCE_CONTROL",
  COMMAND: "COMMAND",
});

const ChangeStates = Object.freeze({
  DRAFT: "DRAFT",
  PROPOSED: "PROPOSED",
  READY_FOR_REVIEW: "READY_FOR_REVIEW",
  INVALID: "INVALID",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  APPLYING: "APPLYING",
  APPLIED: "APPLIED",
  VERIFIED: "VERIFIED",
  VALIDATED: "VALIDATED",
  REVERTED: "REVERTED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
});

const PatchFormats = Object.freeze({
  STRUCTURED: "STRUCTURED",
  UNIFIED_DIFF: "UNIFIED_DIFF",
  TEXT_EDIT: "TEXT_EDIT",
});

const CommandClasses = Object.freeze({
  READ_ONLY: "READ_ONLY",
  TEST: "TEST",
  LINT: "LINT",
  TYPECHECK: "TYPECHECK",
  FORMAT_CHECK: "FORMAT_CHECK",
  PACKAGE_VALIDATE: "PACKAGE_VALIDATE",
  GIT_READ: "GIT_READ",
  GIT_MUTATION: "GIT_MUTATION",
  BUILD: "BUILD",
  CUSTOM: "CUSTOM",
});

const FileOperations = Object.freeze({
  READ: "READ",
  UPDATE: "UPDATE",
  CREATE: "CREATE",
  DELETE: "DELETE",
  RENAME: "RENAME",
});

const DEFAULT_CONFIGURATION = Object.freeze({
  id: "levi-controlled-workspace-tools",
  schemaVersion: CONTROLLED_WORKSPACE_TOOL_SCHEMA_VERSION,
  mode: "REVIEW_ONLY",
  storagePath: ".levi/controlled-workspace-tools.json",
  allowReads: true,
  allowSourceChanges: false,
  allowCommandExecution: false,
  allowGitOperations: false,
  allowFileCreation: false,
  allowFileDeletion: false,
  allowFileRename: false,
  requireApprovalForSourceChanges: true,
  requireApprovalForCommands: true,
  requireApprovalForGitChanges: true,
  requireCheckpointBeforeMutation: true,
  autoRevertOnValidationFailure: false,
  protectedPaths: Object.freeze([".git/**", ".levi/**", "**/.env", "**/.env.*", "**/*secret*", "**/*credential*"]),
  excludedPaths: Object.freeze(["node_modules/**", "dist/**", "build/**", "coverage/**"]),
  allowedCommandClasses: Object.freeze([
    CommandClasses.READ_ONLY,
    CommandClasses.TEST,
    CommandClasses.LINT,
    CommandClasses.TYPECHECK,
    CommandClasses.FORMAT_CHECK,
    CommandClasses.PACKAGE_VALIDATE,
    CommandClasses.GIT_READ,
  ]),
  validationProfiles: Object.freeze([]),
  metadata: Object.freeze({}),
});

const DEFAULT_BOUNDS = Object.freeze({
  maximumTools: 128,
  maximumCommands: 64,
  maximumValidationProfiles: 32,
  maximumProposals: 128,
  maximumApplications: 128,
  maximumFilesPerProposal: 64,
  maximumEditsPerFile: 256,
  maximumFileBytes: 1024 * 1024,
  maximumPatchBytes: 512000,
  maximumDiffLines: 5000,
  maximumCommandOutputBytes: 200000,
  maximumCommandDurationMs: 120000,
  maximumPathLength: 512,
  maximumEventHistory: 1000,
});

class ControlledWorkspaceToolEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.configuration = normalizeConfiguration(options.configuration || options.config || {});
    this.bounds = normalizeBounds(options.bounds || {});
    this.clock = normalizeClock(options.clock);
    this.idAdapter = normalizeIdAdapter(options.idAdapter);
    this.workspaceAdapter = options.workspaceAdapter || options.mutationAdapter || null;
    this.commandAdapter = options.commandAdapter || null;
    this.sourceControlAdapter = options.sourceControlAdapter || null;
    this.persistenceAdapter = options.persistenceAdapter || new MemoryPersistenceAdapter();
    this.state = EngineStates.CREATED;
    this.tools = new Map();
    this.commands = new Map();
    this.validationProfiles = new Map();
    this.proposals = new Map();
    this.applications = new Map();
    this.consumedCommandApprovals = new Set();
    this.events = [];
    this.stats = {
      proposalsCreated: 0,
      proposalsValidated: 0,
      proposalsApplied: 0,
      proposalsRejected: 0,
      applicationsReverted: 0,
      commandsExecuted: 0,
      validationsRun: 0,
      blockedMutations: 0,
      approvalFailures: 0,
      staleFailures: 0,
      rollbackAttempts: 0,
    };
    for (const tool of builtInTools()) this.registerTool(tool);
    for (const command of builtInCommands(this.configuration)) this.registerCommand(command);
    for (const profile of this.configuration.validationProfiles) this.registerValidationProfile(profile);
    for (const profile of safeArray(options.validationProfiles)) this.registerValidationProfile(profile);
    for (const tool of safeArray(options.tools)) this.registerTool(tool);
    for (const command of safeArray(options.commands)) this.registerCommand(command);
  }

  initialize(options = {}) {
    this.state = EngineStates.INITIALIZING;
    this.publish("workspace_tools_initializing", {});
    if (options.restore !== false) this.load({ emptyOnCorruption: true });
    const health = this.getHealth({ skipChecks: true });
    this.state = health.blockers.length ? EngineStates.DEGRADED : EngineStates.READY;
    this.publish(this.state === EngineStates.READY ? "workspace_tools_ready" : "workspace_tools_degraded", health);
    return { status: this.state, health };
  }

  shutdown(options = {}) {
    if (options.save !== false) this.save();
    this.state = EngineStates.STOPPED;
    this.publish("workspace_tools_stopped", {});
    return { status: this.state };
  }

  getState() {
    return { state: this.state, configurationId: this.configuration.id, schemaVersion: CONTROLLED_WORKSPACE_TOOL_SCHEMA_VERSION };
  }

  getConfiguration() {
    return clone({
      ...this.configuration,
      bounds: this.bounds,
    });
  }

  getHealth(options = {}) {
    const blockers = [];
    const warnings = [];
    const adapters = {
      workspaceMutation: adapterStatus(this.workspaceAdapter, ["readFile", "stat", "applyEdits", "createFile", "deleteFile", "renameFile", "verifyFile", "getWorkspaceRevision"]),
      commandExecution: adapterStatus(this.commandAdapter, ["validateCommand", "executeCommand", "cancelCommand", "getEnvironmentInfo"]),
      sourceControl: adapterStatus(this.sourceControlAdapter, ["isAvailable", "getStatus", "getDiff", "getRevision", "createCheckpoint", "restoreCheckpoint"]),
      persistence: adapterStatus(this.persistenceAdapter, ["save", "load", "status"]),
    };
    if (!this.workspaceAdapter) warnings.push("WorkspaceMutationAdapter is not configured; proposals can be reviewed but not applied.");
    if (this.configuration.allowCommandExecution && !this.commandAdapter) blockers.push("Command execution is enabled but CommandExecutionAdapter is not configured.");
    if (this.configuration.allowGitOperations && !this.sourceControlAdapter) warnings.push("Git/source-control operations are enabled but SourceControlAdapter is not configured.");
    if (!options.skipChecks && this.workspaceAdapter) {
      for (const method of ["readFile", "stat", "applyEdits", "createFile", "deleteFile", "renameFile", "verifyFile", "getWorkspaceRevision"]) {
        if (typeof this.workspaceAdapter[method] !== "function") blockers.push(`WorkspaceMutationAdapter.${method} is required.`);
      }
    }
    return {
      engineState: this.state,
      overallWorkspaceToolHealth: Math.max(0, 100 - blockers.length * 35 - warnings.length * 10),
      adapters,
      registeredTools: this.tools.size,
      registeredCommands: this.commands.size,
      proposals: this.proposals.size,
      applications: this.applications.size,
      blockers,
      warnings,
      trust: {
        mutationDefault: this.configuration.allowSourceChanges ? "ENABLED_BY_CONFIGURATION" : "DISABLED_BY_DEFAULT",
        commandDefault: this.configuration.allowCommandExecution ? "ENABLED_BY_CONFIGURATION" : "DISABLED_BY_DEFAULT",
        approvalRequired: this.configuration.requireApprovalForSourceChanges !== false,
      },
      stats: clone(this.stats),
    };
  }

  registerTool(input = {}) {
    if (this.tools.size >= this.bounds.maximumTools && !this.tools.has(input.id)) throw new Error("Maximum workspace tools exceeded.");
    const tool = normalizeTool(input);
    this.tools.set(tool.id, tool);
    this.publish("workspace_tool_registered", { toolId: tool.id });
    return clone(tool);
  }

  listTools(filter = {}) {
    return Array.from(this.tools.values()).filter((tool) => matches(tool, filter)).sort(byId).map(clone);
  }

  getTool(id) {
    return clone(this.tools.get(requiredString(id, "Tool id is required.")) || null);
  }

  registerCommand(input = {}) {
    if (this.commands.size >= this.bounds.maximumCommands && !this.commands.has(input.id)) throw new Error("Maximum workspace commands exceeded.");
    const command = normalizeCommandDefinition(input);
    this.commands.set(command.id, command);
    this.publish("workspace_command_registered", { commandId: command.id });
    return clone(command);
  }

  listAllowedCommands(filter = {}) {
    return Array.from(this.commands.values())
      .filter((command) => matches(command, filter))
      .sort(byId)
      .map((command) => ({
        ...clone(command),
        allowed: this.configuration.allowedCommandClasses.includes(command.commandClass),
        adapterAvailable: !!this.commandAdapter,
      }));
  }

  registerValidationProfile(input = {}) {
    if (this.validationProfiles.size >= this.bounds.maximumValidationProfiles && !this.validationProfiles.has(input.id)) throw new Error("Maximum validation profiles exceeded.");
    const profile = normalizeValidationProfile(input);
    this.validationProfiles.set(profile.id, profile);
    return clone(profile);
  }

  listValidationProfiles(filter = {}) {
    return Array.from(this.validationProfiles.values()).filter((profile) => matches(profile, filter)).sort(byId).map(clone);
  }

  async readFile(input = {}, options = {}) {
    if (this.configuration.allowReads === false) throw new Error("Workspace reads are disabled.");
    const workspace = input.workspace || { id: input.workspaceId || "workspace" };
    const uri = normalizePath(input.uri || input.path || input.relativePath, this.bounds);
    this.validatePathPolicy(uri, { read: true });
    this.requireWorkspaceAdapter("readFile");
    const result = await maybe(this.workspaceAdapter.readFile(workspace, uri, options));
    return normalizeReadResult(uri, result, this.bounds);
  }

  async statFile(input = {}, options = {}) {
    const workspace = input.workspace || { id: input.workspaceId || "workspace" };
    const uri = normalizePath(input.uri || input.path || input.relativePath, this.bounds);
    this.validatePathPolicy(uri, { read: true });
    this.requireWorkspaceAdapter("stat");
    return clone(await maybe(this.workspaceAdapter.stat(workspace, uri, options)));
  }

  async createProposal(input = {}, options = {}) {
    if (this.proposals.size >= this.bounds.maximumProposals) throw new Error("Maximum proposals exceeded.");
    const workspace = normalizeWorkspace(input.workspace || { id: input.workspaceId || "workspace" });
    const revision = await this.safeWorkspaceRevision(workspace);
    const proposal = {
      id: input.id || this.idAdapter.next("change", { workspaceId: workspace.id, count: this.proposals.size + 1 }),
      schemaVersion: CONTROLLED_WORKSPACE_TOOL_SCHEMA_VERSION,
      title: input.title || "Workspace change proposal",
      description: input.description || "",
      intent: input.intent || input.objective || "",
      workspace,
      workspaceRevision: input.workspaceRevision || revision,
      state: ChangeStates.PROPOSED,
      riskLevel: normalizeEnum(input.riskLevel || ToolRiskLevels.MEDIUM, ToolRiskLevels),
      mutationScope: input.mutationScope || MutationScopes.FILE_CONTENT,
      patchFormat: input.patchFormat || PatchFormats.STRUCTURED,
      fileChanges: await this.normalizeFileChanges(input.fileChanges || input.files || input.edits || [], workspace, options),
      validations: [],
      applications: [],
      approval: null,
      createdAt: this.now(),
      updatedAt: this.now(),
      expiresAt: input.expiresAt || null,
      metadata: clone(input.metadata || {}),
    };
    proposal.patch = this.generatePatch(proposal);
    proposal.proposalHash = stableHash({
      workspaceId: proposal.workspace.id,
      workspaceRevision: proposal.workspaceRevision,
      fileChanges: proposal.fileChanges,
      patch: proposal.patch,
    });
    const validation = await this.validateProposal(proposal, { persist: false, skipStateUpdate: true });
    proposal.validations.push(validation);
    proposal.state = validation.valid ? ChangeStates.READY_FOR_REVIEW : ChangeStates.INVALID;
    this.proposals.set(proposal.id, proposal);
    this.stats.proposalsCreated += 1;
    this.publish("change_proposal_created", { proposalId: proposal.id, state: proposal.state });
    return clone(proposal);
  }

  async validateProposal(input, options = {}) {
    const proposal = typeof input === "string" ? this.requireProposal(input) : normalizeProposalInput(input);
    const findings = [];
    const warnings = [];
    if (!proposal.fileChanges.length) findings.push(finding("EMPTY_PROPOSAL", "Proposal does not contain file changes."));
    if (proposal.fileChanges.length > this.bounds.maximumFilesPerProposal) findings.push(finding("TOO_MANY_FILES", "Proposal exceeds maximum files per proposal."));
    const seen = new Set();
    for (const file of proposal.fileChanges) {
      const path = file.relativePath || file.uri;
      try { this.validatePathPolicy(path, { operation: file.operation }); } catch (error) { findings.push(finding("PATH_POLICY", error.message, path)); }
      if (seen.has(path)) findings.push(finding("DUPLICATE_FILE", `Duplicate file change for ${path}.`, path));
      seen.add(path);
      if (file.edits.length > this.bounds.maximumEditsPerFile) findings.push(finding("TOO_MANY_EDITS", `Too many edits for ${path}.`, path));
      const overlap = detectOverlappingEdits(file.edits);
      if (overlap) findings.push(finding("OVERLAPPING_EDITS", `Overlapping edits for ${path}.`, path));
      if (byteSize(file.proposedContent || "") > this.bounds.maximumFileBytes) findings.push(finding("FILE_TOO_LARGE", `Proposed content is too large for ${path}.`, path));
      if ([FileOperations.CREATE, FileOperations.DELETE, FileOperations.RENAME].includes(file.operation)) {
        if (file.operation === FileOperations.CREATE && !this.configuration.allowFileCreation) findings.push(finding("CREATE_DISABLED", "File creation is disabled by configuration.", path));
        if (file.operation === FileOperations.DELETE && !this.configuration.allowFileDeletion) findings.push(finding("DELETE_DISABLED", "File deletion is disabled by configuration.", path));
        if (file.operation === FileOperations.RENAME && !this.configuration.allowFileRename) findings.push(finding("RENAME_DISABLED", "File rename is disabled by configuration.", path));
      }
      if (this.workspaceAdapter && file.expectedHash && !options.skipStaleCheck) {
        const current = await this.safeReadForValidation(proposal.workspace, path);
        if (current && current.hash && current.hash !== file.expectedHash) {
          findings.push(finding("STALE_FILE", `File changed since proposal was created: ${path}.`, path));
          this.stats.staleFailures += 1;
        }
      }
    }
    if (proposal.patch && byteSize(proposal.patch.diff || "") > this.bounds.maximumPatchBytes) findings.push(finding("PATCH_TOO_LARGE", "Patch exceeds maximum configured size."));
    const validation = {
      id: this.idAdapter.next("change-validation", { proposalId: proposal.id }),
      proposalId: proposal.id,
      valid: findings.length === 0,
      state: findings.length === 0 ? "VALID" : "INVALID",
      findings,
      warnings,
      checkedAt: this.now(),
      workspaceRevision: await this.safeWorkspaceRevision(proposal.workspace),
    };
    if (!options.skipStateUpdate && this.proposals.has(proposal.id)) {
      const stored = this.proposals.get(proposal.id);
      stored.validations.push(validation);
      stored.state = validation.valid ? ChangeStates.READY_FOR_REVIEW : ChangeStates.INVALID;
      stored.updatedAt = this.now();
    }
    this.stats.proposalsValidated += 1;
    return clone(validation);
  }

  previewProposal(input = {}) {
    const proposal = this.requireProposal(input.proposalId || input.id || input);
    return {
      proposalId: proposal.id,
      state: proposal.state,
      title: proposal.title,
      riskLevel: proposal.riskLevel,
      workspaceRevision: proposal.workspaceRevision,
      proposalHash: proposal.proposalHash,
      summary: summarizeProposal(proposal),
      patch: clone(proposal.patch),
      fileChanges: proposal.fileChanges.map((file) => ({
        operation: file.operation,
        uri: file.uri,
        relativePath: file.relativePath,
        bytesAdded: byteSize(file.proposedContent || ""),
        bytesRemoved: byteSize(file.originalContent || ""),
        editCount: file.edits.length,
      })),
      approvalRequired: this.configuration.requireApprovalForSourceChanges !== false,
    };
  }

  bindApproval(input = {}) {
    const proposal = this.requireProposal(input.proposalId || input.id);
    const approval = normalizeApproval({
      ...input,
      proposalId: proposal.id,
      proposalHash: input.proposalHash || proposal.proposalHash,
      workspaceRevision: input.workspaceRevision || proposal.workspaceRevision,
    });
    proposal.approval = approval;
    proposal.state = approval.status === "APPROVED" ? ChangeStates.APPROVED : approval.status === "REJECTED" ? ChangeStates.REJECTED : proposal.state;
    proposal.updatedAt = this.now();
    if (approval.status === "REJECTED") this.stats.proposalsRejected += 1;
    return clone(proposal);
  }

  rejectProposal(input = {}) {
    return this.bindApproval({ proposalId: input.proposalId || input.id, status: "REJECTED", decidedBy: input.decidedBy || "user", reason: input.reason || "Rejected." });
  }

  async applyPatch(input = {}, options = {}) {
    const proposal = this.requireProposal(input.proposalId || input.id || input);
    if (proposal.state === ChangeStates.APPLIED || proposal.state === ChangeStates.VERIFIED || proposal.state === ChangeStates.VALIDATED) return clone(this.latestApplication(proposal));
    this.requireWorkspaceAdapter("applyEdits");
    const validation = await this.validateProposal(proposal.id, {});
    if (!validation.valid) throw new Error(`Proposal ${proposal.id} is invalid and cannot be applied.`);
    this.validateApprovalBinding(proposal, input.approval || options.approval || proposal.approval);
    const checkpoint = await this.createCheckpointIfAvailable(proposal, options);
    const application = {
      id: this.idAdapter.next("application", { proposalId: proposal.id }),
      proposalId: proposal.id,
      workspaceId: proposal.workspace.id,
      state: "APPLYING",
      checkpoint,
      fileResults: [],
      validationResults: [],
      startedAt: this.now(),
      completedAt: null,
      revertedAt: null,
      errors: [],
      warnings: [],
    };
    proposal.state = ChangeStates.APPLYING;
    this.applications.set(application.id, application);
    try {
      for (const file of proposal.fileChanges) {
        application.fileResults.push(await this.applyFileChange(proposal.workspace, file, options));
      }
      application.state = "APPLIED";
      proposal.state = ChangeStates.APPLIED;
      await this.verifyApplication(proposal, application);
      application.state = "VERIFIED";
      proposal.state = ChangeStates.VERIFIED;
      application.completedAt = this.now();
      proposal.applications.push(application.id);
      proposal.updatedAt = this.now();
      this.stats.proposalsApplied += 1;
      this.publish("change_applied", { proposalId: proposal.id, applicationId: application.id });
      return clone(application);
    } catch (error) {
      application.state = "FAILED";
      application.errors.push(error.message);
      application.completedAt = this.now();
      proposal.state = ChangeStates.FAILED;
      if (checkpoint && options.rollbackOnFailure !== false) await this.restoreCheckpoint(checkpoint, application, "apply failure");
      throw error;
    }
  }

  async revertChange(input = {}) {
    const application = this.requireApplication(input.applicationId || input.id || this.latestApplication(this.requireProposal(input.proposalId)).id);
    const proposal = this.requireProposal(application.proposalId);
    if (application.checkpoint) await this.restoreCheckpoint(application.checkpoint, application, input.reason || "manual revert");
    else {
      for (const file of proposal.fileChanges.slice().reverse()) await this.applyInverseFileChange(proposal.workspace, file);
    }
    application.state = "REVERTED";
    application.revertedAt = this.now();
    proposal.state = ChangeStates.REVERTED;
    this.stats.applicationsReverted += 1;
    this.publish("change_reverted", { proposalId: proposal.id, applicationId: application.id });
    return clone(application);
  }

  async validateChange(input = {}, options = {}) {
    const proposal = this.requireProposal(input.proposalId || input.id);
    const profileIds = safeArray(input.profileIds || input.profiles || (input.profileId ? [input.profileId] : []));
    const profiles = profileIds.length ? profileIds.map((id) => this.requireValidationProfile(id)) : Array.from(this.validationProfiles.values());
    const workspaceId = (proposal.workspace && proposal.workspace.id) || input.workspaceId || null;
    const parentApproval = input.approval || options.approval || null;
    const results = [];
    for (const profile of profiles) {
      for (const commandId of profile.commandIds) {
        const nestedApproval = this.createNestedValidationCommandApproval(parentApproval, {
          commandId,
          proposalId: proposal.id,
          workspaceId,
          parentCommandId: "validation.run",
        });
        results.push(await this.runCommand({
          commandId,
          proposalId: proposal.id,
          workspaceId,
          arguments: input.arguments || [],
          cwd: input.cwd || null,
          approval: nestedApproval,
        }, options));
      }
    }
    const passed = results.length > 0 && results.every((result) => result.status === "SUCCEEDED");
    const validation = {
      id: this.idAdapter.next("runtime-validation", { proposalId: proposal.id }),
      proposalId: proposal.id,
      profileIds: profiles.map((profile) => profile.id),
      status: results.length ? (passed ? "SUCCEEDED" : "FAILED") : "NO_PROFILES",
      results,
      checkedAt: this.now(),
    };
    proposal.validations.push(validation);
    if (passed) proposal.state = ChangeStates.VALIDATED;
    this.stats.validationsRun += 1;
    return clone(validation);
  }

  async runCommand(input = {}, options = {}) {
    const commandId = requiredString(input.commandId || input.id, "Command id is required.");
    const definition = this.commands.get(commandId);
    if (!definition) throw new Error(`Command is not registered: ${commandId}.`);
    if (!this.configuration.allowedCommandClasses.includes(definition.commandClass)) throw new Error(`Command class is not allowlisted: ${definition.commandClass}.`);
    if (this.configuration.allowCommandExecution !== true && ![CommandClasses.READ_ONLY, CommandClasses.GIT_READ].includes(definition.commandClass)) throw new Error("Command execution is disabled by configuration.");
    if (!this.commandAdapter) throw new Error("CommandExecutionAdapter is unavailable.");
    if (containsShellControl(input.arguments || [])) throw new Error("Command arguments contain shell control characters.");
    const approval = input.approval || options.approval || null;
    const workspaceId = input.workspaceId || (input.workspace && input.workspace.id) || null;
    if (definition.requiresApproval || this.configuration.requireApprovalForCommands) {
      this.validateCommandApproval(definition, approval, {
        commandId,
        workspaceId,
        proposalId: input.proposalId || null,
      });
    }
    const request = {
      id: this.idAdapter.next("command-request", { commandId }),
      commandId,
      commandClass: definition.commandClass,
      executable: definition.executable,
      arguments: safeArray(definition.arguments).concat(safeArray(input.arguments)),
      cwd: input.cwd || definition.cwd || null,
      environment: clone(input.environment || {}),
      timeoutMs: Math.min(Number(input.timeoutMs || definition.timeoutMs || this.bounds.maximumCommandDurationMs), this.bounds.maximumCommandDurationMs),
      proposalId: input.proposalId || null,
      workspaceId,
      createdAt: this.now(),
    };
    const adapterValidation = await maybe(this.commandAdapter.validateCommand(request, { definition }));
    if (adapterValidation === false || adapterValidation && adapterValidation.valid === false) throw new Error(adapterValidation && adapterValidation.message || `Command rejected by adapter: ${commandId}.`);
    const raw = await maybe(this.commandAdapter.executeCommand(request, { definition }));
    const result = {
      id: this.idAdapter.next("command-result", { commandId }),
      request,
      status: normalizeCommandStatus(raw && raw.status),
      exitCode: Number.isFinite(Number(raw && raw.exitCode)) ? Number(raw.exitCode) : null,
      stdout: truncateText(raw && raw.stdout || "", this.bounds.maximumCommandOutputBytes),
      stderr: truncateText(raw && raw.stderr || "", this.bounds.maximumCommandOutputBytes),
      startedAt: raw && raw.startedAt || request.createdAt,
      completedAt: raw && raw.completedAt || this.now(),
      metadata: clone(raw && raw.metadata || {}),
    };
    if ((definition.requiresApproval || this.configuration.requireApprovalForCommands) && approval) {
      this.consumeCommandApproval(approval, definition.id);
    }
    this.stats.commandsExecuted += 1;
    return clone(result);
  }

  cancelCommand(input = {}) {
    if (!this.commandAdapter || typeof this.commandAdapter.cancelCommand !== "function") return { status: "UNAVAILABLE" };
    return this.commandAdapter.cancelCommand(input.commandRequestId || input.id, input.reason || "Cancelled.");
  }

  async sourceControlStatus(input = {}) {
    if (!this.sourceControlAdapter || await maybe(this.sourceControlAdapter.isAvailable(input.workspace || input)) === false) return { status: "UNAVAILABLE" };
    return clone(await maybe(this.sourceControlAdapter.getStatus(input.workspace || input, input.options || {})));
  }

  async sourceControlDiff(input = {}) {
    if (!this.sourceControlAdapter || await maybe(this.sourceControlAdapter.isAvailable(input.workspace || input)) === false) return { status: "UNAVAILABLE" };
    return clone(await maybe(this.sourceControlAdapter.getDiff(input.workspace || input, input.options || {})));
  }

  async sourceControlCheckpoint(input = {}) {
    if (!this.sourceControlAdapter || await maybe(this.sourceControlAdapter.isAvailable(input.workspace || input)) === false) return { status: "UNAVAILABLE" };
    if (this.configuration.requireApprovalForGitChanges) this.validateCommandApproval({ id: "sourceControl.checkpoint" }, input.approval);
    return clone(await maybe(this.sourceControlAdapter.createCheckpoint(input.workspace || input, input.options || {})));
  }

  async sourceControlRestore(input = {}) {
    if (!this.sourceControlAdapter || await maybe(this.sourceControlAdapter.isAvailable(input.workspace || input)) === false) return { status: "UNAVAILABLE" };
    if (this.configuration.requireApprovalForGitChanges) this.validateCommandApproval({ id: "sourceControl.restore" }, input.approval);
    return clone(await maybe(this.sourceControlAdapter.restoreCheckpoint(input.workspace || input, input.checkpoint, input.options || {})));
  }

  getProposal(id) {
    return clone(this.proposals.get(requiredString(id, "Proposal id is required.")) || null);
  }

  listProposals(filter = {}) {
    return Array.from(this.proposals.values()).filter((proposal) => matches(proposal, filter)).sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)) * -1).map(clone);
  }

  getApplication(id) {
    return clone(this.applications.get(requiredString(id, "Application id is required.")) || null);
  }

  save() {
    const snapshot = {
      schemaVersion: CONTROLLED_WORKSPACE_TOOL_SCHEMA_VERSION,
      configuration: this.configuration,
      proposals: Array.from(this.proposals.values()),
      applications: Array.from(this.applications.values()),
      stats: this.stats,
      savedAt: this.now(),
    };
    return this.persistenceAdapter.save(snapshot, { configuration: this.configuration });
  }

  load(options = {}) {
    const result = this.persistenceAdapter.load({ configuration: this.configuration, emptyOnCorruption: options.emptyOnCorruption });
    if (!result || !result.snapshot) return result || { status: "EMPTY" };
    const snapshot = result.snapshot;
    this.proposals = new Map(safeArray(snapshot.proposals).map((proposal) => [proposal.id, normalizeProposalInput(proposal)]));
    this.applications = new Map(safeArray(snapshot.applications).map((application) => [application.id, application]));
    this.stats = { ...this.stats, ...(snapshot.stats || {}) };
    return { status: "LOADED", proposalCount: this.proposals.size, applicationCount: this.applications.size };
  }

  publish(type, payload = {}) {
    const event = { type, payload: clone(payload), timestamp: this.now(), sequence: this.events.length + 1 };
    this.events.push(event);
    while (this.events.length > this.bounds.maximumEventHistory) this.events.shift();
    this.emit("workspace_tool_event", clone(event));
    return event;
  }

  subscribe(listener) {
    this.on("workspace_tool_event", listener);
    return { dispose: () => this.off("workspace_tool_event", listener) };
  }

  now() {
    const value = this.clock.now();
    return typeof value === "string" ? new Date(value).toISOString() : new Date(value).toISOString();
  }

  requireProposal(id) {
    const proposal = this.proposals.get(requiredString(id, "Proposal id is required."));
    if (!proposal) throw new Error(`Proposal does not exist: ${id}.`);
    return proposal;
  }

  requireApplication(id) {
    const application = this.applications.get(requiredString(id, "Application id is required."));
    if (!application) throw new Error(`Application does not exist: ${id}.`);
    return application;
  }

  requireValidationProfile(id) {
    const profile = this.validationProfiles.get(requiredString(id, "Validation profile id is required."));
    if (!profile) throw new Error(`Validation profile does not exist: ${id}.`);
    return profile;
  }

  requireWorkspaceAdapter(method) {
    if (!this.workspaceAdapter || typeof this.workspaceAdapter[method] !== "function") throw new Error(`WorkspaceMutationAdapter.${method} is unavailable.`);
  }

  validatePathPolicy(path, options = {}) {
    const normalized = normalizePath(path, this.bounds);
    if (pathIsUnsafe(normalized)) throw new Error(`Unsafe workspace path: ${normalized}.`);
    if (matchesAnyPath(normalized, this.configuration.protectedPaths)) throw new Error(`Protected path cannot be changed or disclosed: ${normalized}.`);
    if (options.operation && options.operation !== FileOperations.READ && matchesAnyPath(normalized, this.configuration.excludedPaths)) throw new Error(`Excluded path cannot be changed: ${normalized}.`);
    return normalized;
  }

  async normalizeFileChanges(input, workspace, options = {}) {
    const entries = safeArray(input).map((entry) => normalizeFileChangeShape(entry));
    const result = [];
    for (const entry of entries) {
      const uri = this.validatePathPolicy(entry.uri || entry.path || entry.relativePath, { operation: entry.operation });
      let originalContent = entry.originalContent;
      let expectedHash = entry.expectedHash || entry.originalHash || null;
      if (originalContent === undefined && this.workspaceAdapter && [FileOperations.UPDATE, FileOperations.DELETE, FileOperations.RENAME].includes(entry.operation)) {
        const read = await this.safeReadForValidation(workspace, uri, options);
        if (read) {
          originalContent = read.content;
          expectedHash = expectedHash || read.hash;
        }
      }
      const edits = entry.edits.length ? normalizeTextEdits(entry.edits) : replacementEdit(originalContent || "", entry.proposedContent || entry.content || "");
      const proposedContent = entry.operation === FileOperations.DELETE
        ? ""
        : entry.proposedContent !== undefined || entry.content !== undefined
          ? String(entry.proposedContent !== undefined ? entry.proposedContent : entry.content)
          : applyTextEdits(String(originalContent || ""), edits);
      result.push({
        id: entry.id || stableId("file-change", { uri, operation: entry.operation, proposedContent }),
        operation: entry.operation,
        uri,
        relativePath: uri,
        targetUri: entry.targetUri || entry.newPath || null,
        originalContent: String(originalContent === undefined ? "" : originalContent),
        proposedContent,
        expectedHash,
        expectedRevision: entry.expectedRevision || null,
        edits,
        metadata: clone(entry.metadata || {}),
      });
    }
    return result;
  }

  generatePatch(proposal) {
    const files = proposal.fileChanges.map((file) => ({
      operation: file.operation,
      uri: file.uri,
      targetUri: file.targetUri,
      edits: file.edits,
      originalHash: stableHash(file.originalContent || ""),
      proposedHash: stableHash(file.proposedContent || ""),
    }));
    const diff = truncateText(proposal.fileChanges.map((file) => unifiedDiff(file)).join("\n"), this.bounds.maximumPatchBytes);
    const truncated = diff.length >= this.bounds.maximumPatchBytes;
    return {
      format: PatchFormats.STRUCTURED,
      files,
      diff,
      diffLineCount: diff.split(/\r?\n/).length,
      truncated,
      generatedAt: this.now(),
    };
  }

  validateApprovalBinding(proposal, approval) {
    if (this.configuration.requireApprovalForSourceChanges === false) return true;
    const normalized = approval && normalizeApproval(approval);
    if (!normalized || normalized.status !== "APPROVED") {
      this.stats.approvalFailures += 1;
      throw new Error(`Proposal ${proposal.id} requires an approved, bound approval.`);
    }
    if (normalized.proposalId !== proposal.id || normalized.proposalHash !== proposal.proposalHash) {
      this.stats.approvalFailures += 1;
      throw new Error("Approval does not match the proposal identity and hash.");
    }
    if (normalized.workspaceRevision && proposal.workspaceRevision && normalized.workspaceRevision !== proposal.workspaceRevision) {
      this.stats.approvalFailures += 1;
      throw new Error("Approval does not match the proposal workspace revision.");
    }
    return true;
  }

  createNestedValidationCommandApproval(parentApproval, context = {}) {
    const commandId = requiredString(context.commandId, "Nested validation command id is required.");
    if (!parentApproval) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${commandId} requires explicit approval.`);
    }
    const normalized = normalizeCommandApproval(parentApproval);
    if (normalized.status === "REJECTED") {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${commandId} approval was rejected.`);
    }
    if (normalized.status !== "APPROVED") {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${commandId} requires explicit approval.`);
    }
    if (normalized.consumed === true || this.isCommandApprovalConsumed(normalized, commandId)) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${commandId} approval has already been consumed.`);
    }
    if (isApprovalExpired(normalized, this.now())) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${commandId} approval has expired.`);
    }
    const authorizedCommandIds = uniqueStrings([
      ...normalized.commandIds,
      ...normalized.nestedCommandIds,
    ]);
    const allowsNested = authorizedCommandIds.length === 0
      || authorizedCommandIds.includes("validation.run")
      || authorizedCommandIds.includes(commandId);
    if (!allowsNested) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${commandId} is not authorized by the provided approval.`);
    }
    if (normalized.workspaceId && context.workspaceId && normalized.workspaceId !== context.workspaceId) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${commandId} approval workspace does not match.`);
    }
    if (normalized.proposalId && context.proposalId && normalized.proposalId !== context.proposalId) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${commandId} approval proposal does not match.`);
    }
    return {
      id: normalized.id,
      status: "APPROVED",
      commandId,
      commandIds: [commandId],
      nestedCommandIds: [],
      workspaceId: context.workspaceId || normalized.workspaceId || null,
      proposalId: context.proposalId || normalized.proposalId || null,
      validationRequestId: normalized.validationRequestId || normalized.id || null,
      expiresAt: normalized.expiresAt,
      decidedBy: normalized.decidedBy,
      decidedAt: normalized.decidedAt || this.now(),
      parentCommandId: context.parentCommandId || "validation.run",
      derivedFrom: normalized.id || normalized.validationRequestId || null,
      reason: normalized.reason,
      consumed: false,
    };
  }

  validateCommandApproval(definition, approval, context = {}) {
    if (!approval) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${definition.id} requires explicit approval.`);
    }
    const normalized = normalizeCommandApproval(approval);
    if (normalized.status === "REJECTED") {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${definition.id} approval was rejected.`);
    }
    if (normalized.status !== "APPROVED") {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${definition.id} requires explicit approval.`);
    }
    if (normalized.consumed === true || this.isCommandApprovalConsumed(normalized, definition.id)) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${definition.id} approval has already been consumed.`);
    }
    if (isApprovalExpired(normalized, this.now())) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${definition.id} approval has expired.`);
    }
    const authorizedCommandIds = uniqueStrings([
      ...normalized.commandIds,
      ...normalized.nestedCommandIds,
    ]);
    if (authorizedCommandIds.length > 0 && !authorizedCommandIds.includes(definition.id)) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${definition.id} is not authorized by the provided approval.`);
    }
    const workspaceId = context.workspaceId || null;
    if (normalized.workspaceId && workspaceId && normalized.workspaceId !== workspaceId) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${definition.id} approval workspace does not match.`);
    }
    const proposalId = context.proposalId || null;
    if (normalized.proposalId && proposalId && normalized.proposalId !== proposalId) {
      this.stats.approvalFailures += 1;
      throw new Error(`Command ${definition.id} approval proposal does not match.`);
    }
    return true;
  }

  isCommandApprovalConsumed(approval, commandId) {
    const root = commandApprovalRootKey(approval);
    if (!root) return false;
    return this.consumedCommandApprovals.has(`${root}:${commandId}`) || this.consumedCommandApprovals.has(`${root}:*`);
  }

  consumeCommandApproval(approval, commandId) {
    const normalized = normalizeCommandApproval(approval);
    const root = commandApprovalRootKey(normalized);
    if (!root) {
      approval.consumed = true;
      return;
    }
    this.consumedCommandApprovals.add(`${root}:${commandId}`);
    if (normalized.commandIds.length === 0 && normalized.nestedCommandIds.length === 0) {
      this.consumedCommandApprovals.add(`${root}:*`);
    }
  }

  async applyFileChange(workspace, file, options = {}) {
    if (this.configuration.allowSourceChanges !== true) throw new Error("Source mutation is disabled by configuration.");
    if (file.operation === FileOperations.UPDATE) return this.workspaceAdapter.applyEdits(workspace, file.uri, file.edits, { ...options, expectedHash: file.expectedHash });
    if (file.operation === FileOperations.CREATE) return this.workspaceAdapter.createFile(workspace, file.uri, file.proposedContent, options);
    if (file.operation === FileOperations.DELETE) return this.workspaceAdapter.deleteFile(workspace, file.uri, options);
    if (file.operation === FileOperations.RENAME) return this.workspaceAdapter.renameFile(workspace, file.uri, file.targetUri, options);
    throw new Error(`Unsupported file operation: ${file.operation}.`);
  }

  async applyInverseFileChange(workspace, file) {
    if (file.operation === FileOperations.UPDATE) return this.workspaceAdapter.applyEdits(workspace, file.uri, replacementEdit(file.proposedContent, file.originalContent), {});
    if (file.operation === FileOperations.CREATE) return this.workspaceAdapter.deleteFile(workspace, file.uri, {});
    if (file.operation === FileOperations.DELETE) return this.workspaceAdapter.createFile(workspace, file.uri, file.originalContent, {});
    if (file.operation === FileOperations.RENAME) return this.workspaceAdapter.renameFile(workspace, file.targetUri, file.uri, {});
    return null;
  }

  async verifyApplication(proposal, application) {
    if (!this.workspaceAdapter || typeof this.workspaceAdapter.verifyFile !== "function") return;
    for (const file of proposal.fileChanges) {
      const expectedContent = file.operation === FileOperations.DELETE ? "" : file.proposedContent;
      const verification = await maybe(this.workspaceAdapter.verifyFile(proposal.workspace, file.operation === FileOperations.RENAME ? file.targetUri : file.uri, {
        operation: file.operation,
        expectedHash: stableHash(expectedContent || ""),
        expectedContent,
      }));
      if (verification && verification.valid === false) throw new Error(verification.message || `File verification failed: ${file.uri}.`);
      application.fileResults.push({ operation: "VERIFY", uri: file.uri, status: "VERIFIED" });
    }
  }

  async createCheckpointIfAvailable(proposal, options = {}) {
    if (!this.sourceControlAdapter || typeof this.sourceControlAdapter.createCheckpoint !== "function") {
      if (this.configuration.requireCheckpointBeforeMutation) return { status: "UNAVAILABLE", warning: "No SourceControlAdapter checkpoint is available." };
      return null;
    }
    const available = typeof this.sourceControlAdapter.isAvailable === "function" ? await maybe(this.sourceControlAdapter.isAvailable(proposal.workspace)) : true;
    if (!available) return { status: "UNAVAILABLE", warning: "Source control is unavailable." };
    return this.sourceControlAdapter.createCheckpoint(proposal.workspace, { proposalId: proposal.id, reason: options.reason || "controlled workspace mutation" });
  }

  async restoreCheckpoint(checkpoint, application, reason) {
    this.stats.rollbackAttempts += 1;
    if (!this.sourceControlAdapter || typeof this.sourceControlAdapter.restoreCheckpoint !== "function") return { status: "UNAVAILABLE" };
    return this.sourceControlAdapter.restoreCheckpoint({ id: application.workspaceId }, checkpoint, { reason });
  }

  async safeWorkspaceRevision(workspace) {
    if (!this.workspaceAdapter || typeof this.workspaceAdapter.getWorkspaceRevision !== "function") return workspace.revision || null;
    try { return await maybe(this.workspaceAdapter.getWorkspaceRevision(workspace)); } catch (_) { return workspace.revision || null; }
  }

  async safeReadForValidation(workspace, uri, options = {}) {
    if (!this.workspaceAdapter || typeof this.workspaceAdapter.readFile !== "function") return null;
    try { return normalizeReadResult(uri, await maybe(this.workspaceAdapter.readFile(workspace, uri, options)), this.bounds); } catch (_) { return null; }
  }

  latestApplication(proposal) {
    const id = proposal.applications[proposal.applications.length - 1];
    return id ? this.requireApplication(id) : null;
  }
}

class MemoryPersistenceAdapter {
  constructor() {
    this.snapshot = null;
  }
  save(snapshot) {
    this.snapshot = clone(snapshot);
    return { status: "PERSISTED", inMemory: true };
  }
  load() {
    return this.snapshot ? { status: "LOADED", snapshot: clone(this.snapshot) } : { status: "EMPTY" };
  }
  status() {
    return { status: "AVAILABLE", inMemory: true };
  }
}

function builtInTools() {
  return [
    tool("workspace.readFile", "Read File", ToolCategories.WORKSPACE_READ, ToolRiskLevels.LOW, MutationScopes.NONE),
    tool("workspace.statFile", "Stat File", ToolCategories.WORKSPACE_READ, ToolRiskLevels.LOW, MutationScopes.NONE),
    tool("change.createProposal", "Create Change Proposal", ToolCategories.CHANGE_PROPOSAL, ToolRiskLevels.LOW, MutationScopes.NONE),
    tool("change.validateProposal", "Validate Change Proposal", ToolCategories.CHANGE_PROPOSAL, ToolRiskLevels.LOW, MutationScopes.NONE),
    tool("change.previewDiff", "Preview Change Diff", ToolCategories.PATCH_PREVIEW, ToolRiskLevels.LOW, MutationScopes.NONE),
    tool("change.applyApproved", "Apply Approved Change", ToolCategories.MUTATION, ToolRiskLevels.HIGH, MutationScopes.FILE_CONTENT, { requiresApproval: true }),
    tool("change.validateResult", "Validate Change Result", ToolCategories.VALIDATION, ToolRiskLevels.MEDIUM, MutationScopes.COMMAND, { requiresApproval: true }),
    tool("change.revert", "Revert Change", ToolCategories.MUTATION, ToolRiskLevels.HIGH, MutationScopes.FILE_CONTENT, { requiresApproval: true }),
    tool("command.listAllowed", "List Allowed Commands", ToolCategories.COMMAND, ToolRiskLevels.LOW, MutationScopes.NONE),
    tool("command.runValidation", "Run Validation Command", ToolCategories.COMMAND, ToolRiskLevels.MEDIUM, MutationScopes.COMMAND, { requiresApproval: true }),
    tool("sourceControl.status", "Source Control Status", ToolCategories.SOURCE_CONTROL, ToolRiskLevels.LOW, MutationScopes.NONE),
    tool("sourceControl.diff", "Source Control Diff", ToolCategories.SOURCE_CONTROL, ToolRiskLevels.LOW, MutationScopes.NONE),
  ];
}

function builtInCommands(configuration) {
  const command = (id, executable, args, commandClass) => ({ id, name: id, executable, arguments: args, commandClass, requiresApproval: configuration.requireApprovalForCommands !== false });
  return [
    command("validation.test", "npm", ["test"], CommandClasses.TEST),
    command("validation.syntax", "node", ["--check"], CommandClasses.TYPECHECK),
    command("validation.package", "npm", ["pkg", "get", "name"], CommandClasses.PACKAGE_VALIDATE),
  ];
}

function tool(id, name, category, riskLevel, mutationScope, extra = {}) {
  return { id, name, description: `${name} workspace tool.`, category, riskLevel, mutationScope, requiresApproval: extra.requiresApproval === true, deterministic: true, version: "1.0.0", inputSchema: { type: "object" }, outputSchema: { type: "object" } };
}

function normalizeConfiguration(input = {}) {
  return {
    ...DEFAULT_CONFIGURATION,
    ...clone(input),
    protectedPaths: safeArray(input.protectedPaths || DEFAULT_CONFIGURATION.protectedPaths),
    excludedPaths: safeArray(input.excludedPaths || DEFAULT_CONFIGURATION.excludedPaths),
    allowedCommandClasses: safeArray(input.allowedCommandClasses || DEFAULT_CONFIGURATION.allowedCommandClasses).map((value) => normalizeEnum(value, CommandClasses)),
    validationProfiles: safeArray(input.validationProfiles),
    metadata: clone(input.metadata || {}),
  };
}

function normalizeBounds(input = {}) {
  return Object.fromEntries(Object.entries({ ...DEFAULT_BOUNDS, ...input }).map(([key, value]) => [key, Math.max(1, Number(value || DEFAULT_BOUNDS[key] || 1))]));
}

function normalizeTool(input) {
  return {
    id: requiredString(input.id, "Tool id is required."),
    name: input.name || input.id,
    description: input.description || "",
    category: normalizeEnum(input.category || ToolCategories.CUSTOM || ToolCategories.CHANGE_PROPOSAL, ToolCategories),
    riskLevel: normalizeEnum(input.riskLevel || ToolRiskLevels.LOW, ToolRiskLevels),
    mutationScope: normalizeEnum(input.mutationScope || MutationScopes.NONE, MutationScopes),
    requiresApproval: input.requiresApproval === true,
    deterministic: input.deterministic !== false,
    version: input.version || "1.0.0",
    inputSchema: clone(input.inputSchema || { type: "object" }),
    outputSchema: clone(input.outputSchema || { type: "object" }),
    metadata: clone(input.metadata || {}),
  };
}

function normalizeCommandDefinition(input) {
  return {
    id: requiredString(input.id, "Command id is required."),
    name: input.name || input.id,
    executable: requiredString(input.executable, "Command executable is required."),
    arguments: safeArray(input.arguments || input.args).map(String),
    commandClass: normalizeEnum(input.commandClass || input.class || CommandClasses.CUSTOM, CommandClasses),
    cwd: input.cwd || null,
    timeoutMs: Number(input.timeoutMs || DEFAULT_BOUNDS.maximumCommandDurationMs),
    requiresApproval: input.requiresApproval !== false,
    metadata: clone(input.metadata || {}),
  };
}

function normalizeValidationProfile(input) {
  return {
    id: requiredString(input.id, "Validation profile id is required."),
    name: input.name || input.id,
    description: input.description || "",
    commandIds: safeArray(input.commandIds || input.commands).map(String),
    required: input.required !== false,
    metadata: clone(input.metadata || {}),
  };
}

function normalizeProposalInput(input = {}) {
  return {
    ...clone(input),
    workspace: normalizeWorkspace(input.workspace || { id: input.workspaceId || "workspace" }),
    fileChanges: safeArray(input.fileChanges).map((file) => ({ ...file, edits: normalizeTextEdits(file.edits || []) })),
    validations: safeArray(input.validations),
    applications: safeArray(input.applications),
  };
}

function normalizeFileChangeShape(entry) {
  const operation = normalizeEnum(entry.operation || (entry.content !== undefined || entry.proposedContent !== undefined ? FileOperations.UPDATE : FileOperations.UPDATE), FileOperations);
  return { ...entry, operation, edits: safeArray(entry.edits) };
}

function normalizeWorkspace(input = {}) {
  return { id: input.id || input.workspaceId || "workspace", uri: input.uri || input.rootPath || null, revision: input.revision || null, metadata: clone(input.metadata || {}) };
}

function normalizeReadResult(uri, result, bounds) {
  const content = typeof result === "string" ? result : String(result && result.content !== undefined ? result.content : "");
  if (byteSize(content) > bounds.maximumFileBytes) throw new Error(`File exceeds maximum readable size: ${uri}.`);
  return {
    uri,
    content,
    hash: result && result.hash || stableHash(content),
    size: result && result.size || byteSize(content),
    revision: result && result.revision || null,
    metadata: clone(result && result.metadata || {}),
  };
}

function normalizeTextEdits(edits) {
  return safeArray(edits).map((edit) => ({
    start: edit.start === undefined || edit.start === null ? null : Number(edit.start),
    end: edit.end === undefined || edit.end === null ? null : Number(edit.end),
    range: edit.range ? clone(edit.range) : null,
    expectedText: edit.expectedText === undefined ? null : String(edit.expectedText),
    newText: String(edit.newText === undefined ? "" : edit.newText),
  }));
}

function replacementEdit(originalContent, proposedContent) {
  return [{ start: 0, end: String(originalContent || "").length, range: null, expectedText: String(originalContent || ""), newText: String(proposedContent || "") }];
}

function applyTextEdits(content, edits) {
  const sorted = normalizeTextEdits(edits).map((edit) => ({ ...edit, start: edit.start === null ? 0 : edit.start, end: edit.end === null ? content.length : edit.end })).sort((a, b) => b.start - a.start);
  let next = String(content || "");
  for (const edit of sorted) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > next.length) throw new Error("Text edit range is out of bounds.");
    if (edit.expectedText !== null && next.slice(edit.start, edit.end) !== edit.expectedText) throw new Error("Text edit expectedText does not match current content.");
    next = next.slice(0, edit.start) + edit.newText + next.slice(edit.end);
  }
  return next;
}

function detectOverlappingEdits(edits) {
  const normalized = normalizeTextEdits(edits).filter((edit) => edit.start !== null && edit.end !== null).sort((a, b) => a.start - b.start);
  for (let index = 1; index < normalized.length; index += 1) if (normalized[index].start < normalized[index - 1].end) return true;
  return false;
}

function unifiedDiff(file) {
  const oldLines = String(file.originalContent || "").split(/\r?\n/);
  const newLines = String(file.proposedContent || "").split(/\r?\n/);
  const lines = [`diff --git a/${file.uri} b/${file.targetUri || file.uri}`, `--- a/${file.uri}`, `+++ b/${file.targetUri || file.uri}`, `@@ -1,${oldLines.length} +1,${newLines.length} @@`];
  const max = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < max; index += 1) {
    if (oldLines[index] === newLines[index]) lines.push(` ${oldLines[index] || ""}`);
    else {
      if (oldLines[index] !== undefined) lines.push(`-${oldLines[index]}`);
      if (newLines[index] !== undefined) lines.push(`+${newLines[index]}`);
    }
  }
  return lines.join("\n");
}

function normalizeApproval(input = {}) {
  return {
    id: input.id || input.approvalId || null,
    proposalId: requiredString(input.proposalId, "Approval proposalId is required."),
    proposalHash: requiredString(input.proposalHash, "Approval proposalHash is required."),
    workspaceRevision: input.workspaceRevision || null,
    status: String(input.status || input.decision || "").toUpperCase(),
    decidedBy: input.decidedBy || "external",
    decidedAt: input.decidedAt || new Date().toISOString(),
    reason: input.reason || null,
  };
}

function normalizeCommandApproval(input = {}) {
  const commandIds = uniqueStrings([
    ...safeArray(input.commandIds),
    ...(input.commandId ? [input.commandId] : []),
  ]);
  const nestedCommandIds = uniqueStrings(safeArray(input.nestedCommandIds || input.allowedNestedCommandIds));
  return {
    id: input.id || input.approvalId || null,
    status: String(input.status || input.decision || "").toUpperCase(),
    commandId: input.commandId || null,
    commandIds,
    nestedCommandIds,
    workspaceId: input.workspaceId || (input.workspace && input.workspace.id) || null,
    proposalId: input.proposalId || null,
    validationRequestId: input.validationRequestId || input.requestId || null,
    expiresAt: input.expiresAt || null,
    decidedBy: input.decidedBy || "external",
    decidedAt: input.decidedAt || null,
    parentCommandId: input.parentCommandId || null,
    derivedFrom: input.derivedFrom || null,
    reason: input.reason || null,
    consumed: input.consumed === true,
  };
}

function commandApprovalRootKey(approval) {
  if (!approval) return null;
  if (approval.derivedFrom) return `id:${approval.derivedFrom}`;
  if (approval.id || approval.approvalId) return `id:${approval.id || approval.approvalId}`;
  if (approval.validationRequestId) return `validation:${approval.validationRequestId}`;
  return `ephemeral:${stableHash({
    status: approval.status || null,
    commandIds: uniqueStrings([...(approval.commandIds || []), approval.commandId].filter(Boolean)),
    nestedCommandIds: uniqueStrings(approval.nestedCommandIds || []),
    workspaceId: approval.workspaceId || null,
    proposalId: approval.proposalId || null,
    decidedBy: approval.decidedBy || null,
    decidedAt: approval.decidedAt || null,
    reason: approval.reason || null,
  })}`;
}

function isApprovalExpired(approval, nowIso) {
  if (!approval || !approval.expiresAt) return false;
  const expiresAt = Date.parse(approval.expiresAt);
  const now = Date.parse(nowIso);
  return Number.isFinite(expiresAt) && Number.isFinite(now) && expiresAt <= now;
}

function uniqueStrings(values) {
  return Array.from(new Set(safeArray(values).map((value) => String(value)).filter(Boolean)));
}

function normalizeCommandStatus(status) {
  const value = String(status || "").toUpperCase();
  if (["SUCCEEDED", "SUCCESS", "PASSED"].includes(value)) return "SUCCEEDED";
  if (["FAILED", "FAILURE", "ERROR"].includes(value)) return "FAILED";
  if (["CANCELLED", "CANCELED"].includes(value)) return "CANCELLED";
  if (["TIMED_OUT", "TIMEOUT"].includes(value)) return "TIMED_OUT";
  return "SUCCEEDED";
}

function normalizePath(input, bounds) {
  const value = requiredString(input, "Workspace path is required.").replace(/\\/g, "/").replace(/^\/+/, "");
  if (value.length > bounds.maximumPathLength) throw new Error("Workspace path exceeds maximum length.");
  return value;
}

function pathIsUnsafe(value) {
  return !value || value.includes("\0") || value.split("/").includes("..") || /^[a-z]:/i.test(value) || value.startsWith("//");
}

function matchesAnyPath(path, patterns) {
  const lowered = path.toLowerCase();
  return safeArray(patterns).some((pattern) => {
    const p = String(pattern).toLowerCase().replace(/\\/g, "/");
    if (p.endsWith("/**")) return lowered === p.slice(0, -3) || lowered.startsWith(p.slice(0, -2));
    if (p.startsWith("**/")) return lowered.endsWith(p.slice(3));
    if (p.includes("*")) return new RegExp(`^${escapeRegExp(p).replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*")}$`).test(lowered);
    return lowered === p || lowered.startsWith(`${p}/`);
  });
}

function containsShellControl(values) {
  return safeArray(values).some((value) => /[;&|`<>$]/.test(String(value)));
}

function finding(code, message, uri = null) {
  return { code, message, uri, severity: "ERROR" };
}

function summarizeProposal(proposal) {
  const byOperation = {};
  for (const file of proposal.fileChanges) byOperation[file.operation] = (byOperation[file.operation] || 0) + 1;
  return { filesChanged: proposal.fileChanges.length, byOperation, intent: proposal.intent || proposal.description || "" };
}

function adapterStatus(adapter, requiredMethods) {
  if (!adapter) return { status: "UNCONFIGURED", missingMethods: requiredMethods };
  const missingMethods = requiredMethods.filter((method) => typeof adapter[method] !== "function");
  return { status: missingMethods.length ? "INCOMPLETE" : "AVAILABLE", missingMethods };
}

function normalizeClock(input) {
  if (input && typeof input.now === "function") return input;
  return { now: () => new Date().toISOString() };
}

function normalizeIdAdapter(input) {
  if (input && typeof input.next === "function") return input;
  return { next: (prefix, seed = {}) => stableId(prefix, { ...seed, nonce: crypto.randomBytes(8).toString("hex") }) };
}

function stableId(prefix, value) {
  return `${prefix}-${stableHash(value).slice(0, 16)}`;
}

function stableHash(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, stableKeys);
  return crypto.createHash("sha256").update(text || "").digest("hex");
}

function stableKeys(key, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((entry) => [entry, value[entry]]));
}

function byteSize(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function truncateText(value, maximum) {
  const text = String(value || "");
  if (byteSize(text) <= maximum) return text;
  return `${Buffer.from(text, "utf8").subarray(0, Math.max(0, maximum - 32)).toString("utf8")}\n[truncated]`;
}

function safeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function clone(value) {
  if (value === undefined || value === null) return value === undefined ? undefined : null;
  return JSON.parse(JSON.stringify(value));
}

function requiredString(value, message) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function normalizeEnum(value, choices) {
  const normalized = String(value || "").toUpperCase();
  if (!Object.values(choices).includes(normalized)) throw new Error(`Invalid enum value: ${value}.`);
  return normalized;
}

function matches(value, filter) {
  if (!filter || !Object.keys(filter).length) return true;
  return Object.entries(filter).every(([key, expected]) => expected === undefined || expected === null || value[key] === expected);
}

function byId(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

async function maybe(value) {
  return value && typeof value.then === "function" ? await value : value;
}

module.exports = {
  CONTROLLED_WORKSPACE_TOOL_SCHEMA_VERSION,
  ChangeStates,
  CommandClasses,
  ControlledWorkspaceToolEngine,
  DEFAULT_BOUNDS,
  DEFAULT_CONFIGURATION,
  EngineStates,
  FileOperations,
  MemoryPersistenceAdapter,
  MutationScopes,
  PatchFormats,
  ToolCategories,
  ToolRiskLevels,
  applyTextEdits,
  normalizeConfiguration,
  normalizeTextEdits,
  stableHash,
};
