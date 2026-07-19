const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

class NodeHttpTransport {
  constructor(options = {}) {
    this.defaultTimeoutMs = positiveInteger(options.defaultTimeoutMs, 30000);
    this.active = new Map();
  }

  request(input, options = {}) {
    const normalized = normalizeHttpInput(input, this.defaultTimeoutMs);
    const requestId = normalized.requestId;
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const target = new URL(normalized.url);
      const transport = target.protocol === "https:" ? https : http;
      const body = normalized.body === undefined || normalized.body === null
        ? null
        : typeof normalized.body === "string" || Buffer.isBuffer(normalized.body)
          ? normalized.body
          : JSON.stringify(normalized.body);
      const headers = { ...(normalized.headers || {}) };
      if (body !== null && headers["Content-Length"] === undefined && headers["content-length"] === undefined) headers["Content-Length"] = Buffer.byteLength(body);
      const req = transport.request({
        method: normalized.method,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        headers,
        timeout: normalized.timeoutMs,
        signal: options.signal || normalized.signal,
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          this.active.delete(requestId);
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parseMaybeJson(text),
            timing: { startedAt, completedAt: Date.now(), latencyMs: Date.now() - startedAt },
            metadata: { requestId },
          });
        });
      });
      this.active.set(requestId, req);
      req.on("timeout", () => {
        req.destroy(Object.assign(new Error("HTTP request timed out."), { code: "TIMEOUT" }));
      });
      req.on("error", (error) => {
        this.active.delete(requestId);
        reject(error);
      });
      if (body !== null) req.write(body);
      req.end();
    });
  }

  async stream(input, listener, options = {}) {
    const response = await this.request(input, options);
    const body = response.body;
    if (typeof body === "string") listener({ type: "chunk", data: body });
    else listener({ type: "chunk", data: JSON.stringify(body) });
    listener({ type: "end", response });
    return response;
  }

  cancel(requestId) {
    const req = this.active.get(requestId);
    if (!req) return false;
    req.destroy(Object.assign(new Error("HTTP request cancelled."), { code: "CANCELLED" }));
    this.active.delete(requestId);
    return true;
  }

  async healthCheck(input = {}, options = {}) {
    try {
      const response = await this.request({
        method: input.method || "GET",
        url: input.url,
        headers: input.headers || {},
        timeoutMs: input.timeoutMs || options.timeoutMs || this.defaultTimeoutMs,
        requestId: input.requestId || `health-${Date.now()}`,
      }, options);
      return { status: response.status >= 200 && response.status < 500 ? "AVAILABLE" : "UNAVAILABLE", response };
    } catch (error) {
      return { status: "UNAVAILABLE", error: error.message };
    }
  }
}

class FakeHttpTransport {
  constructor(routes = {}) {
    this.routes = routes;
    this.cancelled = new Set();
    this.requests = [];
  }

  async request(input) {
    this.requests.push(input);
    const key = routeKey(input.method || "GET", input.url);
    const handler = this.routes[key] || this.routes[input.url] || this.routes.default;
    if (!handler) return { status: 404, headers: {}, body: { error: "not found" }, timing: { latencyMs: 0 }, metadata: { requestId: input.requestId } };
    if (typeof handler === "function") return handler(input);
    return handler;
  }

  async stream(input, listener) {
    const key = routeKey(input.method || "GET", input.url);
    const handler = this.routes[`STREAM ${input.url}`] || this.routes[`STREAM ${key}`] || this.routes.stream;
    if (handler) return handler(input, listener);
    const response = await this.request(input);
    listener({ type: "chunk", data: response.body });
    listener({ type: "end", response });
    return response;
  }

  cancel(requestId) {
    this.cancelled.add(requestId);
    return true;
  }

  async healthCheck(input) {
    return { status: "AVAILABLE", response: await this.request({ method: "GET", url: input.url, requestId: input.requestId || "health" }) };
  }
}

function normalizeHttpInput(input, defaultTimeoutMs) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("HTTP transport input must be an object.");
  return {
    method: String(input.method || "GET").toUpperCase(),
    url: requiredString(input.url, "HTTP transport url is required."),
    headers: input.headers || {},
    body: input.body,
    timeoutMs: positiveInteger(input.timeoutMs, defaultTimeoutMs),
    requestId: input.requestId || `http-${Date.now()}`,
    signal: input.signal || null,
    metadata: input.metadata || {},
  };
}

function parseMaybeJson(text) {
  if (text === "") return "";
  try { return JSON.parse(text); } catch (_) { return text; }
}

function routeKey(method, url) {
  return `${String(method || "GET").toUpperCase()} ${url}`;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
  return value.trim();
}

module.exports = {
  FakeHttpTransport,
  NodeHttpTransport,
};
