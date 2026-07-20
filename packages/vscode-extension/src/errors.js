const { safeText } = require("./safe-json");

function presentRuntimeError(vscode, output, error, options = {}) {
  const normalized = normalizeError(error);
  const showDiagnostics = options.diagnostics === true;
  const message = showDiagnostics
    ? `${normalized.userMessage || normalized.message} (${normalized.category || "UNKNOWN"})`
    : (normalized.userMessage || normalized.message);
  if (output && typeof output.appendLine === "function") {
    output.appendLine(`[error] ${safeText(normalized, { diagnostics: options.diagnostics, maximumSize: 2000 })}`);
  }
  if (options.showNotifications === false || !vscode.window) return Promise.resolve(undefined);
  if (normalized.severity === "INFO") return vscode.window.showInformationMessage(message, ...actionsFor(normalized));
  if (normalized.severity === "WARNING") return vscode.window.showWarningMessage(message, ...actionsFor(normalized));
  return vscode.window.showErrorMessage(message, ...actionsFor(normalized));
}

function normalizeError(error) {
  if (!error) return { message: "Unknown Levi error.", userMessage: "Unknown Levi error.", severity: "ERROR", category: "UNKNOWN" };
  if (error.error) return normalizeError(error.error);
  if (error.category || error.userMessage) return error;
  return {
    message: error.message || String(error),
    userMessage: error.message || String(error),
    severity: "ERROR",
    category: "UNKNOWN",
    retryable: false,
    recoverable: false,
    suggestedActions: [],
  };
}

function actionsFor(error) {
  const actions = [];
  if (error.retryable) actions.push("Retry");
  if (error.recoverable) actions.push("Recover");
  if (Array.isArray(error.suggestedActions) && error.suggestedActions.length) actions.push("Show Actions");
  return actions;
}

module.exports = {
  normalizeError,
  presentRuntimeError,
};
