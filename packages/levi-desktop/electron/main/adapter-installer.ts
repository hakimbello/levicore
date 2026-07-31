import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { spawn } from "node:child_process";
import type { DebugAdapterInstallationOption } from "../../src/features/debugger/adapters/types";

const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 120_000;
const MAX_PROCESS_OUTPUT = 16_384;

export type InstallProgressCallback = (update: { phase: "download" | "extract" | "install"; percent?: number; message?: string }) => void;

export class AdapterInstallCancelledError extends Error {
  constructor() {
    super("Adapter installation was cancelled.");
    this.name = "AdapterInstallCancelledError";
  }
}

function ensureHttpsUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Adapter downloads must use HTTPS.");
  }
}

async function downloadFile(url: string, destination: string, onProgress: InstallProgressCallback, isCancelled: () => boolean): Promise<void> {
  ensureHttpsUrl(url);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    https
      .get(url, (response) => {
        if (isCancelled()) {
          reject(new AdapterInstallCancelledError());
          return;
        }
        if ((response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400 && response.headers.location) {
          downloadFile(response.headers.location, destination, onProgress, isCancelled).then(resolve).catch(reject);
          return;
        }
        if ((response.statusCode ?? 0) !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode ?? 0}.`));
          return;
        }
        const total = Number(response.headers["content-length"] ?? 0);
        let received = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          if (isCancelled()) {
            response.destroy();
            reject(new AdapterInstallCancelledError());
            return;
          }
          received += chunk.length;
          if (received > MAX_DOWNLOAD_BYTES) {
            response.destroy();
            reject(new Error("Download exceeds the maximum allowed size."));
            return;
          }
          chunks.push(chunk);
          if (total > 0) {
            onProgress({ phase: "download", percent: Math.min(99, Math.round((received / total) * 100)), message: "Downloading adapter package…" });
          }
        });
        response.on("end", () => {
          void fs.writeFile(destination, Buffer.concat(chunks)).then(resolve).catch(reject);
        });
        response.on("error", reject);
      })
      .on("error", reject);
  });
}

async function verifySha256(filePath: string, expected: string): Promise<void> {
  const hash = createHash("sha256");
  const data = await fs.readFile(filePath);
  hash.update(data);
  const actual = hash.digest("hex");
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Adapter package checksum mismatch.");
  }
}

export async function verifyAdapterChecksum(filePath: string, expected: string): Promise<void> {
  return verifySha256(filePath, expected);
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  onProgress: InstallProgressCallback,
  isCancelled: () => boolean
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Adapter installation timed out."));
    }, PROCESS_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString("utf8")).slice(-MAX_PROCESS_OUTPUT);
      onProgress({ phase: "install", message: stdout.trim().split("\n").pop() ?? "Installing adapter…" });
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-MAX_PROCESS_OUTPUT);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (isCancelled()) {
        reject(new AdapterInstallCancelledError());
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Installation failed with code ${code ?? -1}.`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function replaceDirectory(source: string, destination: string): Promise<void> {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.rename(source, destination);
}

export async function installAdapterOption(params: {
  adapterId: string;
  option: DebugAdapterInstallationOption;
  installRoot: string;
  nodeExecutable: string;
  pythonExecutable?: string;
  npmExecutable: string;
  onProgress: InstallProgressCallback;
  isCancelled: () => boolean;
}): Promise<{ installPath: string; entryPath: string; version: string }> {
  const versionDir = path.join(params.installRoot, params.adapterId, params.option.id);
  const tempDir = `${versionDir}.tmp-${Date.now()}`;
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });

  try {
    if (params.isCancelled()) throw new AdapterInstallCancelledError();

    if (params.option.kind === "npm-package" && params.option.npmPackage) {
      const pkg = params.option.npmPackage;
      params.onProgress({ phase: "install", message: `Installing ${pkg.name}@${pkg.version}…` });
      await runProcess(
        params.npmExecutable,
        ["install", "--omit=dev", "--no-audit", "--no-fund", `${pkg.name}@${pkg.version}`, "--prefix", tempDir],
        tempDir,
        params.onProgress,
        params.isCancelled
      );
      const entryPath = path.join(tempDir, pkg.entryRelativePath);
      if (!(await fileExists(entryPath))) {
        throw new Error(`Installed adapter entry was not found at ${pkg.entryRelativePath}.`);
      }
      const currentLink = path.join(params.installRoot, params.adapterId, "current");
      await fs.rm(currentLink, { recursive: true, force: true });
      await fs.mkdir(path.dirname(currentLink), { recursive: true });
      await replaceDirectory(tempDir, versionDir);
      const finalEntry = path.join(versionDir, pkg.entryRelativePath);
      await fs.writeFile(
        path.join(versionDir, "manifest.json"),
        JSON.stringify({ version: pkg.version, entryPath: finalEntry, installedAt: new Date().toISOString() }, null, 2),
        "utf8"
      );
      await fs.symlink(versionDir, currentLink, "junction");
      await fs.writeFile(path.join(currentLink, "entry.js"), "", { flag: "w" });
      await fs.copyFile(finalEntry, path.join(currentLink, "entry.js"));
      return { installPath: versionDir, entryPath: finalEntry, version: pkg.version };
    }

    if (params.option.kind === "direct-download" && params.option.directDownload) {
      const download = params.option.directDownload;
      const archivePath = path.join(tempDir, download.filename);
      params.onProgress({ phase: "download", percent: 0, message: "Downloading adapter package…" });
      await downloadFile(download.url, archivePath, params.onProgress, params.isCancelled);
      await verifySha256(archivePath, download.sha256);
      const entryPath = path.join(tempDir, download.entryRelativePath);
      if (download.filename.endsWith(".js")) {
        await fs.mkdir(path.dirname(entryPath), { recursive: true });
        await fs.copyFile(archivePath, entryPath);
      } else if (!(await fileExists(entryPath))) {
        throw new Error("Extracted adapter entry was not found.");
      }
      const currentLink = path.join(params.installRoot, params.adapterId, "current");
      await replaceDirectory(tempDir, versionDir);
      const finalEntry = path.join(versionDir, download.entryRelativePath);
      await fs.symlink(versionDir, currentLink, "junction").catch(async () => {
        await fs.rm(currentLink, { recursive: true, force: true });
        await fs.symlink(versionDir, currentLink, "junction");
      });
      await fs.copyFile(finalEntry, path.join(currentLink, path.basename(finalEntry)));
      return { installPath: versionDir, entryPath: finalEntry, version: download.sha256.slice(0, 12) };
    }

    if (params.option.kind === "python-package" && params.option.pythonPackage) {
      const pkg = params.option.pythonPackage;
      const python = params.pythonExecutable;
      if (!python) throw new Error("Python executable is required to install debugpy.");
      params.onProgress({ phase: "install", message: `Installing ${pkg.name}==${pkg.version}…` });
      await runProcess(
        python,
        ["-m", "pip", "install", `${pkg.name}==${pkg.version}`, "--target", tempDir, "--no-input"],
        tempDir,
        params.onProgress,
        params.isCancelled
      );
      const entryPath = path.join(tempDir, "python.exe");
      await replaceDirectory(tempDir, versionDir);
      await fs.writeFile(
        path.join(versionDir, "manifest.json"),
        JSON.stringify({ version: pkg.version, module: pkg.module, installedAt: new Date().toISOString() }, null, 2),
        "utf8"
      );
      const currentLink = path.join(params.installRoot, params.adapterId, "current");
      await fs.rm(currentLink, { recursive: true, force: true });
      await fs.mkdir(path.dirname(currentLink), { recursive: true });
      await fs.symlink(python, entryPath).catch(async () => {
        await fs.copyFile(python, entryPath);
      });
      await fs.symlink(versionDir, currentLink, "junction");
      return { installPath: versionDir, entryPath: python, version: pkg.version };
    }

    throw new Error("Unsupported adapter installation option.");
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function uninstallManagedAdapter(adapterRoot: string, adapterId: string): Promise<void> {
  await fs.rm(path.join(adapterRoot, adapterId), { recursive: true, force: true });
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeArchiveEntry(entryName: string): string | null {
  const normalized = path.normalize(entryName).replace(/^([/\\])+/, "");
  if (normalized.includes("..") || path.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

export function isArchiveSizeAllowed(totalBytes: number, limit = MAX_DOWNLOAD_BYTES): boolean {
  return totalBytes >= 0 && totalBytes <= limit;
}
