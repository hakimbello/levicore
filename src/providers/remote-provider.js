const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");
const {
  createProviderError,
  validateProviderRequest,
  validateProviderResponse,
} = require("../model-provider-interface");

const DEFAULT_TIMEOUT_MS = 30000;

function createRemoteProvider(options) {
  validateOptions(options);

  const endpoint = normalizeEndpoint(options.endpoint);
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const providerName = options.name || "remote";
  const costClass = options.costClass || "paid-remote";
  const estimatedCost = options.estimatedCost || 1;

  return {
    name: providerName,
    type: "remote",
    model: options.model,
    reason: options.reason || "Remote model provider configured through Levi provider interface.",
    estimateCost() {
      return {
        amount: estimatedCost,
        costClass,
      };
    },
    async sendRequest(request) {
      validateProviderRequest(request);

      const prompt = getPrompt(request, providerName);
      const payload = {
        model: options.model,
        prompt,
      };

      try {
        const remoteResponse = await postJson(
          endpoint,
          payload,
          options.credential,
          timeoutMs,
          providerName,
        );
        const response = normalizeResponse(remoteResponse, providerName);
        validateProviderResponse(response);
        return response;
      } catch (error) {
        if (error.code && error.code.startsWith("PROVIDER_")) {
          throw error;
        }

        throw createProviderError({
          code: "PROVIDER_UNAVAILABLE",
          message: `Remote provider is unavailable: ${error.message}`,
          providerName,
          retryable: true,
        });
      }
    },
  };
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Remote provider options are required.");
  }

  requireString(options.endpoint, "endpoint");
  requireString(options.model, "model");
  requireString(options.credential, "credential");

  if (options.name !== undefined) {
    requireString(options.name, "name");
  }

  if (options.reason !== undefined) {
    requireString(options.reason, "reason");
  }

  if (options.costClass !== undefined) {
    requireString(options.costClass, "costClass");
  }

  if (
    options.estimatedCost !== undefined &&
    (!Number.isFinite(options.estimatedCost) || options.estimatedCost < 0)
  ) {
    throw new Error("Remote provider estimatedCost must be a nonnegative number.");
  }

  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)
  ) {
    throw new Error("Remote provider timeoutMs must be a positive integer.");
  }
}

function normalizeEndpoint(endpointValue) {
  let endpoint;

  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new Error("Remote provider endpoint must be a valid URL.");
  }

  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new Error("Remote provider endpoint must use http or https.");
  }

  endpoint.hash = "";
  return endpoint;
}

function getPrompt(request, providerName) {
  if (typeof request.prompt !== "string" || request.prompt.trim() === "") {
    throw createProviderError({
      code: "PROVIDER_INVALID_REQUEST",
      message: "Remote provider request prompt is required.",
      providerName,
      retryable: false,
    });
  }

  return request.prompt;
}

function postJson(endpoint, payload, credential, timeoutMs, providerName) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(payload);
    const transport = endpoint.protocol === "https:" ? https : http;

    const request = transport.request(
      {
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: "POST",
        timeout: timeoutMs,
        headers: {
          Authorization: `Bearer ${credential}`,
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
                message: `Remote provider returned status ${response.statusCode}.`,
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
                message: "Remote provider returned invalid JSON.",
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
          message: "Remote provider request timed out.",
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

function normalizeResponse(response, providerName) {
  if (!isPlainObject(response)) {
    throw createProviderError({
      code: "PROVIDER_INVALID_RESPONSE",
      message: "Remote provider response must be an object.",
      providerName,
      retryable: false,
    });
  }

  const content = response.content || response.text || response.response;

  if (typeof content !== "string") {
    throw createProviderError({
      code: "PROVIDER_INVALID_RESPONSE",
      message: "Remote provider response content is missing.",
      providerName,
      retryable: false,
    });
  }

  return {
    content,
    finishReason: typeof response.finishReason === "string" ? response.finishReason : "UNKNOWN",
    usage: isPlainObject(response.usage) ? response.usage : {},
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Remote provider ${fieldName} is required.`);
  }
}

module.exports = {
  createRemoteProvider,
};
