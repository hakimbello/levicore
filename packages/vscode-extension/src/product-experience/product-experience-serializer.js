const { COPILOT_WEBVIEW_COMMANDS, EXPERIENCE_BOUNDS } = require("./product-experience-constants");

function serializeProductExperience(value, options = {}) {
  const maximumSize = options.maximumSize || EXPERIENCE_BOUNDS.maximumSerializedStateBytes;
  const seen = new WeakSet();
  const sanitized = sanitizeProductValue(value, seen);
  const text = JSON.stringify(sanitized);
  if (text.length <= maximumSize) return sanitized;
  return {
    truncated: true,
    originalSize: text.length,
    maximumSize,
    preview: text.slice(0, Math.max(0, maximumSize - 128)),
  };
}

function sanitizeProductValue(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Error) return { message: safePlainText(value.message) };
  if (value === null || typeof value !== "object") return typeof value === "string" ? safePlainText(value) : value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeProductValue(entry, seen)).filter((entry) => entry !== undefined);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (isSensitiveKey(key) || ["runtime", "adapter", "handler", "instance", "webview", "stack"].includes(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    const next = sanitizeProductValue(value[key], seen);
    if (next !== undefined) output[key] = next;
  }
  return output;
}

function validateCopilotMessage(message, options = {}) {
  const maximumSize = options.maximumSize || EXPERIENCE_BOUNDS.maximumSerializedStateBytes;
  if (!message || typeof message !== "object" || Array.isArray(message)) return { valid: false, reason: "Message must be an object." };
  let size = 0;
  try {
    size = JSON.stringify(message).length;
  } catch (error) {
    return { valid: false, reason: "Message must be serializable." };
  }
  if (size > maximumSize) return { valid: false, reason: "Message exceeds UI bounds." };
  if (!COPILOT_WEBVIEW_COMMANDS.includes(message.command)) return { valid: false, reason: "Command is not allowlisted." };
  if (message.content && Buffer.byteLength(String(message.content), "utf8") > EXPERIENCE_BOUNDS.maximumInputBytes) return { valid: false, reason: "Composer input exceeds bounds." };
  if (message.mode && !["Ask", "Plan", "Build", "Fix", "Review", "Teach"].includes(message.mode)) return { valid: false, reason: "Mode is not supported." };
  return { valid: true, message: sanitizeProductValue(message) };
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safePlainText(value) {
  const text = String(value === undefined || value === null ? "" : value);
  if (isSensitiveKey(text) || looksLikeSecret(text)) return "[REDACTED]";
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function isSensitiveKey(value) {
  return /secret|token|password|credential|authorization|api[-_]?key|privateReasoning|hiddenReasoning|privatePrompt/i.test(String(value || ""));
}

function looksLikeSecret(value) {
  return /(sk-[a-zA-Z0-9]{12,}|ghp_[a-zA-Z0-9]{12,}|Bearer\s+[a-zA-Z0-9._-]{12,})/.test(String(value || ""));
}

module.exports = {
  escapeHtml,
  safePlainText,
  sanitizeProductValue,
  serializeProductExperience,
  validateCopilotMessage,
};
