import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import type { DebugAdapterDefinition, DebugAdapterResolvedCommand, DebugAdapterStatus } from "../../src/features/debugger/adapters/types";
import { encodeDapMessage } from "../../src/features/debugger/DebugSession";

const HANDSHAKE_TIMEOUT_MS = 8000;
const MAX_OUTPUT = 4096;

export type AdapterDiagnosticResult = {
  adapterId: string;
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; message?: string }>;
};

async function checkExecutableExists(executablePath: string): Promise<{ passed: boolean; message?: string }> {
  try {
    await fs.access(executablePath);
    return { passed: true };
  } catch {
    return { passed: false, message: "Executable was not found." };
  }
}

async function checkExecutableRunnable(command: string, args: string[]): Promise<{ passed: boolean; message?: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ passed: false, message: "Executable did not respond within the timeout." });
    }, 3000);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-MAX_OUTPUT);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ passed: false, message: "Executable could not be started." });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { passed: true } : { passed: false, message: stderr.trim() || `Executable exited with code ${code ?? -1}.` });
    });
  });
}

async function checkAdapterHandshake(resolved: DebugAdapterResolvedCommand): Promise<{ passed: boolean; message?: string }> {
  return new Promise((resolve) => {
    const child = spawn(resolved.command, resolved.args, {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let initialized = false;
    const timer = setTimeout(() => {
      child.kill();
      resolve({ passed: false, message: initialized ? "Adapter did not respond to initialize." : "Adapter handshake timed out." });
    }, HANDSHAKE_TIMEOUT_MS);

    const onData = (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      while (true) {
        const headerEnd = stdout.indexOf("\r\n\r\n");
        if (headerEnd < 0) break;
        const header = stdout.slice(0, headerEnd);
        const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
        if (!lengthMatch) {
          stdout = stdout.slice(headerEnd + 4);
          continue;
        }
        const length = Number(lengthMatch[1]);
        const messageStart = headerEnd + 4;
        if (stdout.length < messageStart + length) break;
        const payload = stdout.slice(messageStart, messageStart + length);
        stdout = stdout.slice(messageStart + length);
        try {
          const message = JSON.parse(payload) as { type?: string; event?: string; command?: string; success?: boolean };
          if (message.type === "event" && message.event === "initialized") {
            initialized = true;
            child.kill();
            clearTimeout(timer);
            resolve({ passed: true });
            return;
          }
          if (message.type === "response" && message.command === "initialize" && message.success === true) {
            initialized = true;
          }
        } catch {
          // ignore malformed payloads
        }
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", () => undefined);
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ passed: false, message: "Adapter process failed to start." });
    });
    child.on("exit", (code) => {
      if (initialized) return;
      clearTimeout(timer);
      resolve({ passed: false, message: `Adapter exited before initialization${code ? ` (code ${code})` : ""}.` });
    });

    child.stdin.write(
      encodeDapMessage({
        seq: 1,
        type: "request",
        command: "initialize",
        arguments: {
          adapterID: "diagnostic",
          clientID: "levi",
          clientName: "Levi IDE",
          pathFormat: "path",
          linesStartAt1: true,
          columnsStartAt1: true
        }
      })
    );
  });
}

export async function runAdapterDiagnostics(params: {
  definition: DebugAdapterDefinition;
  status: DebugAdapterStatus;
  resolved: DebugAdapterResolvedCommand | null;
  versionCompatible: boolean;
}): Promise<AdapterDiagnosticResult> {
  const checks: AdapterDiagnosticResult["checks"] = [];
  const { status, resolved } = params;

  if (!status.executablePath) {
    checks.push({ name: "executable", passed: false, message: "No executable path was resolved." });
  } else {
    const exists = await checkExecutableExists(status.executablePath);
    checks.push({ name: "executable", passed: exists.passed, message: exists.message });
    if (exists.passed && params.definition.versionCommand) {
      const runnable = await checkExecutableRunnable(status.executablePath, params.definition.versionCommand.args);
      checks.push({ name: "runnable", passed: runnable.passed, message: runnable.message });
    }
  }

  if (!resolved?.entryPath && params.definition.id !== "custom") {
    checks.push({ name: "entry-point", passed: false, message: "Adapter DAP entry point was not found." });
  } else if (resolved?.entryPath) {
    const entry = await checkExecutableExists(resolved.entryPath);
    checks.push({ name: "entry-point", passed: entry.passed, message: entry.message ?? "DAP entry point exists." });
  }

  checks.push({
    name: "version",
    passed: params.versionCompatible,
    message: params.versionCompatible ? undefined : status.message ?? "Adapter version is incompatible."
  });

  if (resolved) {
    const handshake = await checkAdapterHandshake(resolved);
    checks.push({ name: "initialize", passed: handshake.passed, message: handshake.message });
  } else {
    checks.push({ name: "initialize", passed: false, message: "Adapter command could not be constructed." });
  }

  return {
    adapterId: params.definition.id,
    passed: checks.every((item) => item.passed),
    checks
  };
}
