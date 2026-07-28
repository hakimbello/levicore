const DEVELOPER_COMMAND_WHEN = "config.levi.diagnostics.enabled";

const CONSUMER_COMMANDS = Object.freeze([
  { command: "levi.open", title: "Open Home" },
  { command: "levi.openBuildChat", title: "Open Build Chat" },
  { command: "levi.openProjects", title: "Open Projects" },
  { command: "levi.openSettings", title: "Open Settings" },
  { command: "levi.showModelHealth", title: "Check Local AI Connection" },
  { command: "levi.selectModel", title: "Select AI Model" },
  { command: "levi.newChat", title: "New Chat", optional: true },
  { command: "levi.analyzeProject", title: "Analyze Current Project", optional: true },
]);

const LEGACY_ALIAS_COMMANDS = Object.freeze([
  "levi.focusComposer",
  "levi.openDashboard",
  "levi.openWorkspace",
  "levi.testModelConnection",
]);

function consumerCommandIds() {
  return CONSUMER_COMMANDS.map((entry) => entry.command);
}

function consumerCommandTitles() {
  return CONSUMER_COMMANDS.map((entry) => `Levi: ${entry.title}`);
}

function isConsumerCommand(commandId) {
  return consumerCommandIds().includes(commandId);
}

function isLegacyAliasCommand(commandId) {
  return LEGACY_ALIAS_COMMANDS.includes(commandId);
}

module.exports = {
  CONSUMER_COMMANDS,
  DEVELOPER_COMMAND_WHEN,
  LEGACY_ALIAS_COMMANDS,
  consumerCommandIds,
  consumerCommandTitles,
  isConsumerCommand,
  isLegacyAliasCommand,
};
