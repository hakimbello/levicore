let activeExtension = null;

async function activate(context) {
  const vscode = require("vscode");
  const { createLeviExtension } = require("./levi-extension");
  activeExtension = createLeviExtension({ vscode, context });
  return activeExtension.activate();
}

async function deactivate() {
  if (!activeExtension) return undefined;
  const result = await activeExtension.deactivate();
  activeExtension = null;
  return result;
}

module.exports = {
  activate,
  deactivate,
};
