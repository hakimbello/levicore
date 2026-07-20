"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "package.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const developerPattern = /(Reliability|Security|Stress|Qualification|Certification|ThreatModel|PromptInjection|SecretHandling|DependencySecurity|SupplyChain|ApprovalSecurity|WorkspaceIsolation|ExtensionHostQualification|LocalOllamaQualification|PresentationPressure|RuntimeHealth|Capabilities)/i;
const advancedPattern = /(TechnicalDetails|ModelUsage|ModelProviders|ProviderCredential|RuntimeHealth|Capabilities|MemoryUsage|Benchmark|RepositoryGraph|Diagnostics)/i;

const titleRewrites = {
  "levi.showModelProviders": "Levi: Show AI Models",
  "levi.showModels": "Levi: Show AI Models",
  "levi.showModelHealth": "Levi: Check AI Model Connection",
  "levi.testModelConnection": "Levi: Test AI Model Connection",
  "levi.selectModel": "Levi: Select AI Model",
  "levi.showWorkflows": "Levi: Show Project Rules",
  "levi.createWorkflow": "Levi: Create Project Rule",
  "levi.showMultiAgentTeam": "Levi: Show Team Review",
  "levi.openOnboarding": "Levi: Open Setup Guide",
};

for (const command of manifest.contributes.commands) {
  if (titleRewrites[command.command]) command.title = titleRewrites[command.command];
  if (developerPattern.test(command.command) || developerPattern.test(command.title || "")) {
    command.category = "Levi Developer";
    command.enablement = "config.levi.diagnostics.enabled";
    continue;
  }
  if (advancedPattern.test(command.command) || advancedPattern.test(command.title || "")) {
    command.category = "Levi Advanced";
    command.enablement = "config.levi.experience.showAdvancedDetails || config.levi.diagnostics.enabled";
    continue;
  }
  command.category = command.category || "Levi";
}

const hiddenViews = new Set([
  "levi.reliability",
  "levi.securityAssurance",
  "levi.stressScalability",
  "levi.qualification",
  "levi.diagnostics",
]);
for (const view of manifest.contributes.views.levi) {
  if (view.id === "levi.workflows") view.name = "Project Rules";
  if (view.id === "levi.models") view.name = "AI Models";
  if (view.id === "levi.multiAgent") view.name = "Team Review";
  if (hiddenViews.has(view.id)) view.when = "config.levi.diagnostics.enabled";
}

const propertyRewrites = {
  "levi.enabled": { markdownDescription: "Enable Levi in this VS Code installation." },
  "levi.autoInitialize": { markdownDescription: "Start Levi automatically when VS Code opens a workspace." },
  "levi.autoAnalyzeWorkspace": { markdownDescription: "Analyze the open workspace after Levi starts." },
  "levi.offlineMode": { markdownDescription: "Keep AI requests on local models by default. Your source code stays on your machine unless you explicitly enable remote models." },
  "levi.diagnostics.enabled": { markdownDescription: "Show developer and release-check commands. Leave off for normal daily use.", order: 1000 },
  "levi.experience.autoOpenOnFirstRun": { default: true, markdownDescription: "Open the Levi setup guide the first time you use the extension." },
  "levi.experience.showAdvancedDetails": { markdownDescription: "Show advanced technical panels and commands for power users.", order: 20 },
  "levi.models.enabled": { markdownDescription: "Enable local and optional remote **AI models**.", order: 30 },
  "levi.models.routingStrategy": { markdownDescription: "How Levi chooses an AI model when several are available." },
  "levi.models.defaultProvider": { markdownDescription: "Default AI model provider id (for example `ollama-local`)." },
  "levi.models.defaultModel": { markdownDescription: "Default AI model id or name." },
  "levi.models.allowRemoteSourceCode": { markdownDescription: "Allow source code to be sent to remote AI providers. Off by default to keep code local." },
  "levi.models.allowRemoteSensitiveContent": { markdownDescription: "Allow sensitive workspace content to be sent to remote AI providers." },
  "levi.ollama.enabled": { markdownDescription: "Connect Levi to a local [Ollama](https://ollama.com) server.", order: 31 },
  "levi.ollama.baseUrl": { markdownDescription: "Ollama server URL. Default: `http://127.0.0.1:11434`." },
  "levi.ollama.defaultModel": { markdownDescription: "Default Ollama model name (for example `qwen2.5-coder:7b`). Install models with `ollama pull` first." },
  "levi.workflows.enabled": { markdownDescription: "Enable **Project Rules** workflows for repeatable multi-step tasks.", order: 50 },
  "levi.workspaceTools.enabled": { markdownDescription: "Enable reviewed file-change proposals in your workspace.", order: 40 },
  "levi.workspaceTools.requireApproval": { markdownDescription: "Require your explicit approval before Levi changes files or runs validation commands." },
};

for (const [key, rewrite] of Object.entries(propertyRewrites)) {
  const property = manifest.contributes.configuration.properties[key];
  if (!property) continue;
  Object.assign(property, rewrite);
  if (property.description && rewrite.markdownDescription) delete property.description;
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log("Applied Marketplace command visibility and setting descriptions.");
