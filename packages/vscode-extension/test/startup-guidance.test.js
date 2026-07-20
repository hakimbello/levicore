const assert = require("node:assert/strict");
const test = require("node:test");

const { createLeviExtension } = require("../src/levi-extension");
const { createFakeContext, createFakeVSCode } = require("./fake-vscode");

const startupConfig = {
  "levi.autoInitialize": true,
  "levi.autoAnalyzeWorkspace": false,
  "levi.experience.autoOpenOnFirstRun": false,
  "levi.ui.showNotifications": true,
  "levi.models.enabled": true,
  "levi.models.defaultProvider": "ollama-local",
  "levi.models.defaultModel": "ollama:qwen2.5-coder:7b",
  "levi.ollama.enabled": true,
  "levi.ollama.defaultModel": "qwen2.5-coder:7b",
  "levi.openAICompatible.enabled": false,
  "levi.diagnostics.enabled": false,
  "levi.workspaceTools.enabled": true,
  "levi.workspaceTools.allowSourceChanges": true,
  "levi.workspaceTools.allowCommandExecution": true,
  "levi.workspaceTools.requireApproval": true,
};

test("shows actionable Ollama guidance when local provider is unreachable at startup", async () => {
  const vscode = createFakeVSCode({
    config: {
      ...startupConfig,
      "levi.ollama.baseUrl": "http://127.0.0.1:59999",
    },
  });
  const extension = createLeviExtension({ vscode, context: createFakeContext() });
  await extension.activate();

  assert.equal(vscode.__warningMessages.length, 1);
  assert.match(vscode.__warningMessages[0], /Levi could not connect to Ollama/i);
  assert.match(vscode.__warningMessages[0], /Install Ollama/i);
  assert.match(vscode.__warningMessages[0], /start the Ollama app/i);
  assert.match(vscode.__warningMessages[0], /pull or select a supported model/i);
  assert.match(vscode.__warningMessages[0], /No remote AI service was used/i);
  assert.match(vscode.__warningMessages[0], /did not change any files or run commands/i);
  assert.equal((vscode.__infoMessages || []).length, 0);
  assert.equal(extension.startupGuidanceDelivered, true);
  await extension.deactivate();
});

test("does not flood duplicate startup guidance notifications", async () => {
  const vscode = createFakeVSCode({
    config: {
      ...startupConfig,
      "levi.ollama.baseUrl": "http://127.0.0.1:59999",
    },
  });
  const extension = createLeviExtension({ vscode, context: createFakeContext() });
  await extension.activate();
  await extension.presentFirstRunGuidance();
  await extension.presentFirstRunGuidance();

  assert.equal(vscode.__warningMessages.length, 1);
  await extension.deactivate();
});

test("shows ready guidance when Ollama is reachable and does not warn", async () => {
  const vscode = createFakeVSCode({
    config: {
      ...startupConfig,
      "levi.ollama.baseUrl": "http://127.0.0.1:11434",
    },
  });
  const extension = createLeviExtension({ vscode, context: createFakeContext() });
  await extension.activate();

  if ((vscode.__warningMessages || []).some((message) => /could not connect to Ollama/i.test(message))) {
    assert.fail("Ollama reachable path should not show missing-Ollama warning");
  }
  assert.equal(vscode.__infoMessages.length, 1);
  assert.match(vscode.__infoMessages[0], /Levi is ready/i);
  await extension.deactivate();
});

test("restores ready guidance after Ollama becomes available on restart", async () => {
  const unreachable = createFakeVSCode({
    config: {
      ...startupConfig,
      "levi.ollama.baseUrl": "http://127.0.0.1:59999",
    },
  });
  const blocked = createLeviExtension({ vscode: unreachable, context: createFakeContext() });
  await blocked.activate();
  assert.match(unreachable.__warningMessages[0], /could not connect to Ollama/i);
  await blocked.deactivate();

  const reachable = createFakeVSCode({
    config: {
      ...startupConfig,
      "levi.ollama.baseUrl": "http://127.0.0.1:11434",
    },
  });
  const restored = createLeviExtension({ vscode: reachable, context: createFakeContext() });
  await restored.activate();
  assert.equal(reachable.__infoMessages.length, 1);
  assert.match(reachable.__infoMessages[0], /Levi is ready/i);
  await restored.deactivate();
});

test("unreachable Ollama startup does not auto-run workspace change commands", async () => {
  const vscode = createFakeVSCode({
    config: {
      ...startupConfig,
      "levi.ollama.baseUrl": "http://127.0.0.1:59999",
    },
  });
  const extension = createLeviExtension({ vscode, context: createFakeContext() });
  await extension.activate();

  const operations = typeof extension.runtime.listOperations === "function" ? extension.runtime.listOperations() : [];
  assert.ok(!operations.some((op) => /change\.|validation\./.test(String(op.commandId || op.id || ""))));
  await extension.deactivate();
});
