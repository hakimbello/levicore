import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        findFreePort(startPort + 1).then(resolve, reject);
        return;
      }
      reject(error);
    });
    server.once("listening", () => {
      server.close(() => resolve(startPort));
    });
    server.listen(startPort, "127.0.0.1");
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`Vite dev server did not become ready at ${url}`);
}

const port = await findFreePort(5174);
const devServerUrl = `http://127.0.0.1:${port}`;
const debugPort = process.env.LEVI_ELECTRON_DEBUG_PORT ?? (process.env.LEVI_LIVE_ACCEPTANCE === "1" ? "9333" : "");
const sharedEnv = {
  ...process.env,
  VITE_DEV_SERVER_URL: devServerUrl,
  LEVI_REPO_ROOT: repoRoot
};

const vite = spawn("vite", ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: packageRoot,
  env: sharedEnv,
  shell: true,
  stdio: "inherit"
});

let electron;
try {
  await waitForServer(devServerUrl);
  const electronArgs = ["."];
  if (debugPort) {
    electronArgs.unshift(`--remote-debugging-port=${debugPort}`);
  }
  electron = spawn("electron", electronArgs, {
    cwd: packageRoot,
    env: sharedEnv,
    shell: true,
    stdio: "inherit"
  });
} catch (error) {
  console.error(error);
  vite.kill();
  process.exit(1);
}

function shutdown(exitCode = 0) {
  if (electron && !electron.killed) {
    electron.kill();
  }
  if (!vite.killed) {
    vite.kill();
  }
  process.exit(exitCode);
}

electron.on("exit", (code) => shutdown(code ?? 0));
vite.on("exit", (code) => {
  if (code !== 0) {
    shutdown(code ?? 1);
  }
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
