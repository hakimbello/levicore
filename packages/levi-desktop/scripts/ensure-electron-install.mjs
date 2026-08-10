import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const electronRoot = path.join(repoRoot, "node_modules/electron");
const electronPackageJsonPath = path.join(electronRoot, "package.json");

if (!fs.existsSync(electronPackageJsonPath)) {
  process.exit(0);
}

const electronPackage = JSON.parse(fs.readFileSync(electronPackageJsonPath, "utf8"));
const electronVersion = electronPackage.version;
const platformPath = platformExecutablePath();
const executablePath = path.join(electronRoot, "dist", platformPath);
const versionPath = path.join(electronRoot, "dist", "version");
const pathTxtPath = path.join(electronRoot, "path.txt");

if (isInstalled()) {
  process.exit(0);
}

runElectronInstaller();

if (!isInstalled() && process.platform === "win32") {
  await repairWindowsElectronInstall();
}

if (!isInstalled()) {
  throw new Error("Electron dependency install is incomplete after postinstall repair.");
}

function isInstalled() {
  return (
    fs.existsSync(executablePath) &&
    fs.existsSync(versionPath) &&
    fs.readFileSync(versionPath, "utf8").replace(/^v/, "").trim() === electronVersion &&
    fs.existsSync(pathTxtPath) &&
    fs.readFileSync(pathTxtPath, "utf8").trim() === platformPath
  );
}

function runElectronInstaller() {
  const installerPath = path.join(electronRoot, "install.js");
  const result = spawnSync(process.execPath, [installerPath], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function repairWindowsElectronInstall() {
  const { downloadArtifact } = require("@electron/get");
  const zipPath = await downloadArtifact({
    version: electronVersion,
    artifactName: "electron",
    platform: "win32",
    arch: process.env.npm_config_arch || os.arch(),
    force: process.env.force_no_cache === "true",
    cacheRoot: process.env.electron_config_cache,
    checksums: process.env.electron_use_remote_checksums || process.env.npm_config_electron_use_remote_checksums
      ? undefined
      : require(path.join(electronRoot, "checksums.json"))
  });

  fs.rmSync(path.join(electronRoot, "dist"), { recursive: true, force: true });
  fs.mkdirSync(path.join(electronRoot, "dist"), { recursive: true });

  const expand = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "& { param($zipPath, $destinationPath) Expand-Archive -LiteralPath $zipPath -DestinationPath $destinationPath -Force }",
      zipPath,
      path.join(electronRoot, "dist")
    ],
    { cwd: repoRoot, stdio: "inherit" }
  );

  if (expand.status !== 0) {
    process.exit(expand.status ?? 1);
  }

  fs.writeFileSync(pathTxtPath, platformPath);
}

function platformExecutablePath() {
  switch (process.platform) {
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${process.platform}`);
  }
}
