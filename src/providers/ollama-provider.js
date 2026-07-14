const http = require("node:http");
const { URL } = require("node:url");
const {
  createProviderError,
  validateProviderRequest,
  validateProviderResponse,
} = require("../model-provider-interface");

const DEFAULT_ENDPOINT = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 30000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function createOllamaProvider(options) {
  validateOptions(options);

  const endpoint = normalizeEndpoint(options.endpoint || DEFAULT_ENDPOINT);
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const providerName = options.name || "ollama";

  return {
    name: providerName,
    type: "local",
    model: options.model,
    reason: "Free local model configured through Ollama.",
    estimateCost() {
      return {
        amount: 0,
        costClass: "free-local",
      };
    },
    async sendRequest(request) {
      validateProviderRequest(request);

      const prompt = getPrompt(request, providerName);
      const payload = {
        model: options.model,
        prompt,
        stream: false,
      };

      try {
        const ollamaResponse = await postJson(endpoint, "/api/generate", payload, timeoutMs, providerName);
        const response = normalizeResponse(ollamaResponse);
        validateProviderResponse(response);
        return response;
      } catch (error) {
        if (error.code && error.code.startsWith("PROVIDER_")) {
          throw error;
        }

        throw createProviderError({
          code: "PROVIDER_UNAVAILABLE",
          message: `Ollama provider is unavailable: ${error.message}`,
          providerName,
          retryable: true,
        });
      }
    },
  };
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Ollama provider options are required.");
  }

  requireString(options.model, "model");

  if (options.name !== undefined) {
    requireString(options.name, "name");
  }

  if (options.endpoint !== undefined) {
    requireString(options.endpoint, "endpoint");
  }

  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)
  ) {
    throw new Error("Ollama provider timeoutMs must be a positive integer.");
  }
}

function normalizeEndpoint(endpointValue) {
  let endpoint;

  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new Error("Ollama provider endpoint must be a valid URL.");
  }

  if (endpoint.protocol !== "http:") {
    throw new Error("Ollama provider endpoint must use http.");
  }

  if (!LOCAL_HOSTS.has(endpoint.hostname)) {
    throw new Error("Ollama provider endpoint must be local.");
  }

  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint;
}

function getPrompt(request, providerName) {
  if (typeof request.prompt !== "string" || request.prompt.trim() === "") {
    throw createProviderError({
      code: "PROVIDER_INVALID_REQUEST",
      message: "Ollama provider request prompt is required.",
      providerName,
      retryable: false,
    });
  }

  return request.prompt;
}

function postJson(endpoint, pathname, payload, timeoutMs, providerName) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(payload);
    const target = new URL(endpoint.href);
    const basePath = target.pathname === "/" ? "" : target.pathname.replace(/\/+$/, "");
    target.pathname = `${basePath}${pathname}`;

    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              createProviderError({
                code: "PROVIDER_UNAVAILABLE",
                message: `Ollama returned status ${response.statusCode}.`,
                providerName,
                retryable: true,
              }),
            );
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch {
            reject(
              createProviderError({
                code: "PROVIDER_INVALID_RESPONSE",
                message: "Ollama returned invalid JSON.",
                providerName,
                retryable: false,
              }),
            );
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(
        createProviderError({
          code: "PROVIDER_UNAVAILABLE",
          message: "Ollama request timed out.",
          providerName,
          retryable: true,
        }),
      );
    });
    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });
}

function normalizeResponse(response) {
  if (!isPlainObject(response)) {
    throw createProviderError({
      code: "PROVIDER_INVALID_RESPONSE",
      message: "Ollama response must be an object.",
      providerName: "ollama",
      retryable: false,
    });
  }

  if (typeof response.response !== "string") {
    throw createProviderError({
      code: "PROVIDER_INVALID_RESPONSE",
      message: "Ollama response content is missing.",
      providerName: "ollama",
      retryable: false,
    });
  }

  return {
    content: response.response,
    finishReason: response.done === true ? "stop" : "UNKNOWN",
    usage: {
      inputTokens: numberOrUnknown(response.prompt_eval_count),
      outputTokens: numberOrUnknown(response.eval_count),
      totalDuration: numberOrUnknown(response.total_duration),
    },
  };
}

function numberOrUnknown(value) {
  return Number.isFinite(value) ? value : "UNKNOWN";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Ollama provider ${fieldName} is required.`);
  }
}

module.exports = {
  createOllamaProvider,
};
