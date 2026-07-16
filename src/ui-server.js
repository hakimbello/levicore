const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const {
  createAdvancedSettingsView,
  createHomeDashboardView,
  createHomeIntakePreview,
  createExecutionCompletionView,
  createProjectHealthView,
  createPlanApprovalView,
  createRestoreHistoryView,
  startApprovedExecution,
  submitAdvancedSettings,
  submitHomeRequest,
  submitPlanApproval,
  submitRestoreConfirmation,
} = require("./ui-bridge");

const DEFAULT_PORT = 4317;
const MAX_BODY_BYTES = 1024 * 1024;
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function createUiServer(options = {}) {
  const repositoryPath = options.repositoryPath || process.cwd();
  const staticRoot = path.resolve(options.staticRoot || path.join(__dirname, "..", "ui"));

  return http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://localhost");

      if (request.method === "GET" && requestUrl.pathname === "/api/home") {
        return sendJson(response, 200, createHomeDashboardView(repositoryPath));
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/intake") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, createHomeIntakePreview(repositoryPath, body.requestText));
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/request") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, submitHomeRequest(repositoryPath, body.requestText));
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/plan") {
        return sendJson(response, 200, createPlanApprovalView(repositoryPath));
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/plan/approve") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, submitPlanApproval(repositoryPath, body));
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/execution") {
        return sendJson(response, 200, createExecutionCompletionView(repositoryPath));
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/execution/start") {
        return sendJson(response, 200, await startApprovedExecution(repositoryPath));
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/health") {
        return sendJson(response, 200, createProjectHealthView(repositoryPath));
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/history") {
        return sendJson(response, 200, createRestoreHistoryView(repositoryPath));
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/history/restore") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, submitRestoreConfirmation(repositoryPath, body));
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/settings") {
        return sendJson(response, 200, createAdvancedSettingsView(repositoryPath));
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/settings/save") {
        await readJsonBody(request);
        return sendJson(response, 200, submitAdvancedSettings(repositoryPath));
      }

      if (requestUrl.pathname.startsWith("/api/")) {
        return sendJson(response, 404, {
          status: "ERROR",
          reason: "UI endpoint not found.",
        });
      }

      if ((request.method === "GET" || request.method === "HEAD") && requestUrl.pathname === "/favicon.ico") {
        response.writeHead(204, {
          "Cache-Control": "no-store",
        });
        response.end();
        return undefined;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        return sendJson(response, 405, {
          status: "ERROR",
          reason: "Method not allowed.",
        });
      }

      return sendStaticFile(requestUrl.pathname, staticRoot, response, request.method === "HEAD");
    } catch (error) {
      return sendJson(response, 500, {
        status: "ERROR",
        reason: error.message,
      });
    }
  });
}

function listen(options = {}) {
  const port = Number.parseInt(String(options.port || process.env.LEVI_UI_PORT || DEFAULT_PORT), 10);
  const host = options.host || "127.0.0.1";
  const server = createUiServer(options);

  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = address && typeof address === "object" ? address.port : port;
    console.log(`Levi UI is available at http://${host}:${actualPort}/`);
  });

  return server;
}

function sendStaticFile(urlPath, staticRoot, response, headOnly) {
  const filePath = resolveStaticPath(urlPath, staticRoot);

  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return sendText(response, 404, "Not found");
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream",
    "Cache-Control": "no-store",
  });

  if (headOnly) {
    response.end();
    return undefined;
  }

  fs.createReadStream(filePath).pipe(response);
  return undefined;
}

function resolveStaticPath(urlPath, staticRoot) {
  const rawPath = urlPath === "/" ? "/index.html" : urlPath;
  let decoded;

  try {
    decoded = decodeURIComponent(rawPath);
  } catch (error) {
    return null;
  }

  const relativePath = decoded.replace(/^\/+/, "");
  const filePath = path.resolve(staticRoot, relativePath);
  const rootWithSeparator = staticRoot.endsWith(path.sep) ? staticRoot : `${staticRoot}${path.sep}`;

  if (filePath !== staticRoot && !filePath.startsWith(rootWithSeparator)) {
    return null;
  }

  return filePath;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (body.trim() === "") {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Request body must be JSON."));
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${text}\n`);
}

if (require.main === module) {
  listen({
    repositoryPath: process.argv[2] || process.cwd(),
    port: process.argv[3] || process.env.LEVI_UI_PORT || DEFAULT_PORT,
  });
}

module.exports = {
  createUiServer,
  listen,
};
