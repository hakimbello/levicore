function serializeForExtension(value, options = {}) {
  const maximumSize = options.maximumSize || 4000;
  const seen = new WeakSet();
  const sanitized = sanitize(value, seen, Boolean(options.diagnostics));
  const text = JSON.stringify(sanitized);
  if (text.length <= maximumSize) return sanitized;
  return {
    truncated: true,
    originalSize: text.length,
    maximumSize,
    preview: text.slice(0, Math.max(0, maximumSize - 128)),
  };
}

function safeText(value, options = {}) {
  const serialized = serializeForExtension(value, options);
  if (typeof serialized === "string") return serialized;
  return JSON.stringify(serialized, null, 2);
}

function sanitize(value, seen, diagnostics) {
  if (value === undefined || typeof value === "function") return undefined;
  if (value instanceof Error) return diagnostics ? { name: value.name, message: value.message } : { message: value.message };
  if (value === null || typeof value !== "object") return typeof value === "string" && looksSecret(value) ? "[REDACTED]" : value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, seen, diagnostics)).filter((entry) => entry !== undefined);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (["stack", "handler", "runtime", "adapter", "instance"].includes(key) || looksSecret(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    const sanitized = sanitize(value[key], seen, diagnostics);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function looksSecret(value) {
  return /secret|token|password|credential|api[-_]?key/i.test(String(value || ""));
}

module.exports = {
  safeText,
  serializeForExtension,
};
