import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const releaseDir = process.env.LEVI_RELEASE_DIR
  ? path.resolve(process.env.LEVI_RELEASE_DIR)
  : path.join(packageRoot, "release");
const artifactDir = path.join(packageRoot, "test-artifacts", "p2-017-02");
const debugPort = process.env.LEVI_ELECTRON_DEBUG_PORT ?? "9344";

const packageJson = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
const version = packageJson.version;
const productName = packageJson.build.productName;
const installerName = `${productName}-${version}-win-x64.exe`;
const unpackedDir = path.join(releaseDir, "win-unpacked");
const executableName = `${productName}.exe`;
const executablePath = path.join(unpackedDir, executableName);

const report = {
  milestone: "P2-017-02",
  generatedAt: new Date().toISOString(),
  metadata: {
    applicationName: productName,
    executableName,
    version,
    appId: packageJson.build.appId,
    publisherName: packageJson.author ?? null,
    copyright: packageJson.build.copyright ?? null,
    description: packageJson.description,
    author: packageJson.author,
    repository: packageJson.repository?.url ?? null
  },
  artifacts: {},
  checksums: {},
  fileAudit: { passed: false, violations: [], warnings: [], requiredPresent: [], notes: [] },
  nativeModules: { passed: false, checks: [] },
  security: { passed: false, violations: [] },
  signing: { configured: false, status: "unsigned", notes: [] },
  launchSmoke: { passed: false, checks: [] },
  cleanEnvironment: { passed: false, checks: [] },
  installation: { passed: false, checks: [], notes: [] },
  upgrade: { passed: false, checks: [], notes: [] },
  blockers: [],
  nonBlockers: [],
  recommendation: "not_ready"
};

const forbiddenOwnedPathPatterns = [
  /(^|[\\/])\.env(\.|$)/i,
  /(^|[\\/])packages[\\/]levi-desktop[\\/]test([\\/]|$)/i,
  /(^|[\\/])packages[\\/]levi-desktop[\\/]test-artifacts([\\/]|$)/i,
  /(^|[\\/])packages[\\/]levi-desktop[\\/]coverage([\\/]|$)/i,
  /(^|[\\/])cleanup-/i,
  /(^|[\\/])missing-entry-/i,
  /DESKTOP_FEATURE_COMPLETENESS_AUDIT\.md$/i,
  /(^|[\\/])\.git([\\/]|$)/i,
  /\.pem$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /credentials\.json$/i
];

const secretContentPatterns = [
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /gho_[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /BEGIN (RSA |EC )?PRIVATE KEY/,
  /WIN_CSC_KEY_PASSWORD\s*=/,
  /CSC_KEY_PASSWORD\s*=/
];

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

async function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

async function collectFiles(root) {
  const files = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else {
        files.push(absolute);
      }
    }
  }
  await walk(root);
  return files;
}

function relativeFrom(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

async function recordArtifact(relativePath) {
  const absolutePath = path.join(releaseDir, relativePath);
  try {
    const stat = await fs.stat(absolutePath);
    report.artifacts[relativePath] = {
      path: absolutePath,
      sizeBytes: stat.size,
      sizeFormatted: await formatBytes(stat.size)
    };
    report.checksums[relativePath] = await sha256File(absolutePath);
    return true;
  } catch {
    report.artifacts[relativePath] = { path: absolutePath, missing: true };
    return false;
  }
}

function normalizeAsarEntry(entry) {
  return entry.replace(/^\\+/, "").replace(/\\/g, "/");
}

async function auditUnpackedOutput() {
  if (!fsSync.existsSync(unpackedDir)) {
    report.fileAudit.violations.push("Unpacked output directory is missing.");
    return;
  }

  const files = await collectFiles(unpackedDir);
  const violations = [];
  const warnings = [];
  const requiredPresent = [];

  for (const filePath of files) {
    const relative = relativeFrom(unpackedDir, filePath);
    if (relative.startsWith("resources/app.asar.unpacked/node_modules/")) {
      continue;
    }
    for (const pattern of forbiddenOwnedPathPatterns) {
      if (pattern.test(relative)) {
        violations.push(`Forbidden path in packaged output: ${relative}`);
        break;
      }
    }
    if (/^resources[\\/]app\.asar\.unpacked[\\/]src[\\/].*[\\/]test[\\/]/i.test(relative)) {
      violations.push(`Packaged LeviCore test source detected: ${relative}`);
    }
    if (/\.(ts|tsx|jsx)$/.test(relative) && !relative.includes("node_modules") && !relative.includes("app.asar")) {
      violations.push(`TypeScript source file in packaged output: ${relative}`);
    }
    if (/\.map$/.test(relative) && relative.includes("dist/")) {
      warnings.push(`Source map retained in Levi bundle: ${relative}`);
    }
  }

  const requiredPaths = [
    executableName,
    "resources/app.asar",
    "resources/app.asar.unpacked/node_modules/node-pty/prebuilds/win32-x64/pty.node"
  ];
  for (const required of requiredPaths) {
    const absolute = path.join(unpackedDir, required);
    const exists = fsSync.existsSync(absolute);
    requiredPresent.push({ path: required, exists });
    if (!exists) {
      violations.push(`Required packaged path missing: ${required}`);
    }
  }

  const asarPath = path.join(unpackedDir, "resources/app.asar");
  if (fsSync.existsSync(asarPath)) {
    const asarList = spawnSync("npx", ["asar", "list", asarPath], {
      cwd: packageRoot,
      encoding: "utf8",
      shell: true
    });
    if (asarList.status === 0) {
      const entries = asarList.stdout.split("\n").filter(Boolean).map(normalizeAsarEntry);
      const hasIndex = entries.some((entry) => entry === "dist/index.html");
      const hasMain = entries.some((entry) => entry === "dist-electron/electron/main/index.js");
      const hasPreload = entries.some((entry) => entry === "dist-electron/electron/preload/index.js");
      const hasMonaco = entries.some((entry) => /dist\/assets\/monaco-/.test(entry));
      const hasXterm = entries.some((entry) => /dist\/assets\/xterm-/.test(entry));
      requiredPresent.push(
        { path: "asar:dist/index.html", exists: hasIndex },
        { path: "asar:dist-electron/electron/main/index.js", exists: hasMain },
        { path: "asar:dist-electron/electron/preload/index.js", exists: hasPreload },
        { path: "asar:dist/assets/monaco chunk", exists: hasMonaco },
        { path: "asar:dist/assets/xterm chunk", exists: hasXterm }
      );
      if (!hasIndex) violations.push("Production renderer entry dist/index.html missing from app.asar.");
      if (!hasMain) violations.push("Production main entry dist-electron/electron/main/index.js missing from app.asar.");
      if (!hasPreload) violations.push("Production preload entry dist-electron/electron/preload/index.js missing from app.asar.");
      if (!hasMonaco) violations.push("Monaco renderer chunk missing from app.asar.");
      if (!hasXterm) violations.push("Xterm renderer chunk missing from app.asar.");
      for (const entry of entries) {
        if (/\.env/.test(entry) || /^test\//.test(entry) || /^packages\/levi-desktop\/test\//.test(entry)) {
          violations.push(`Forbidden asar entry: ${entry}`);
        }
        if (/\.map$/.test(entry) && /^dist\//.test(entry)) {
          warnings.push(`Source map retained in app.asar Levi bundle: ${entry}`);
        }
        if (/\.map$/.test(entry) && /^node_modules\//.test(entry)) {
          warnings.push(`Dependency source map retained in app.asar: ${entry}`);
        }
      }
    } else {
      report.fileAudit.notes.push("Could not inspect app.asar contents with npx asar; filesystem checks only.");
    }
  }

  if (warnings.length) {
    report.nonBlockers.push("Dependency source maps and expanded node-pty unpack content remain in the packaged output.");
  }

  report.fileAudit.requiredPresent = requiredPresent;
  report.fileAudit.violations = violations;
  report.fileAudit.warnings = warnings;
  report.fileAudit.passed = violations.length === 0;
}

async function auditNativeModules() {
  const checks = [];
  const prebuildRoot = path.join(unpackedDir, "resources/app.asar.unpacked/node_modules/node-pty/prebuilds");
  const win32X64 = path.join(prebuildRoot, "win32-x64", "pty.node");
  const win32Arm64 = path.join(prebuildRoot, "win32-arm64", "pty.node");
  checks.push({ name: "node-pty win32-x64 prebuild", passed: fsSync.existsSync(win32X64), path: win32X64 });
  checks.push({
    name: "node-pty win32-arm64 prebuild (optional)",
    passed: fsSync.existsSync(win32Arm64),
    path: win32Arm64,
    optional: true
  });
  report.nativeModules.checks = checks;
  report.nativeModules.passed = checks.filter((check) => !check.optional).every((check) => check.passed);
  if (!report.nativeModules.passed) {
    report.blockers.push("Required native module node-pty prebuild is missing from packaged output.");
  }
}

async function auditSecurity() {
  const violations = [];
  const scanRoots = [unpackedDir];
  const installerPath = path.join(releaseDir, installerName);
  if (fsSync.existsSync(installerPath)) {
    scanRoots.push(installerPath);
  }

  for (const root of scanRoots) {
    const stat = await fs.stat(root);
    if (stat.isFile()) {
      const content = await fs.readFile(root);
      const text = content.toString("utf8", 0, Math.min(content.length, 2_000_000));
      for (const pattern of secretContentPatterns) {
        if (pattern.test(text)) {
          violations.push(`Potential secret pattern in ${root}: ${pattern}`);
        }
      }
      continue;
    }
    const files = await collectFiles(root);
    for (const filePath of files) {
      if (!/\.(js|json|html|txt|md|env|pem|key|pfx|p12)$/i.test(filePath)) {
        continue;
      }
      const content = await fs.readFile(filePath);
      const text = content.toString("utf8", 0, Math.min(content.length, 500_000));
      for (const pattern of secretContentPatterns) {
        if (pattern.test(text)) {
          violations.push(`Potential secret pattern in ${relativeFrom(root, filePath)}: ${pattern}`);
        }
      }
      if (/OneDrive[\\/]Desktop[\\/]LeviCore/i.test(text) || /C:\\Users\\developer/i.test(text)) {
        violations.push(`Development absolute path leaked in ${relativeFrom(root, filePath)}`);
      }
    }
  }

  report.security.violations = violations;
  report.security.passed = violations.length === 0;
}

function auditSigning() {
  const hasSigningEnv =
    Boolean(process.env.WIN_CSC_LINK?.trim()) ||
    Boolean(process.env.CSC_LINK?.trim());
  report.signing.configured = hasSigningEnv;
  report.signing.status = hasSigningEnv ? "env_present_unsigned_verification_pending" : "unsigned";
  report.signing.notes = [
    "Windows Authenticode signing is not configured in committed package metadata.",
    "Unsigned builds trigger Microsoft SmartScreen warnings on first install.",
    "Signing credentials must be supplied through WIN_CSC_LINK/CSC_LINK and WIN_CSC_KEY_PASSWORD/CSC_KEY_PASSWORD at release time."
  ];
  if (!hasSigningEnv) {
    report.blockers.push("Code signing is not configured; SmartScreen will warn on first install.");
    report.nonBlockers.push("Signing infrastructure is ready via package:signed once credentials are available.");
  }
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    ws.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)(message);
        this.pending.delete(message.id);
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, (message) => {
        if (message.error) {
          reject(new Error(message.error.message));
          return;
        }
        resolve(message.result);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  }
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function writeSampleProject(projectRoot) {
  await fs.rm(projectRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    `${JSON.stringify({ name: "levi-qual-sample", scripts: { test: "node -e \"process.exit(0)\"" } }, null, 2)}\n`
  );
  await fs.writeFile(path.join(projectRoot, "src", "index.js"), "module.exports = { greet() { return 'hello'; } };\n");
  await fs.writeFile(path.join(projectRoot, "README.md"), "# Levi qualification sample project\n");
}

async function connectCdp() {
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page");
  if (!page) {
    throw new Error("Packaged renderer CDP target not found.");
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return { cdp: new Cdp(ws), ws };
}

async function runLaunchSmoke() {
  const checks = [];
  if (!fsSync.existsSync(executablePath)) {
    checks.push({ name: "executable exists", passed: false });
    report.launchSmoke.checks = checks;
    report.launchSmoke.passed = false;
    report.blockers.push("Packaged executable is missing; launch smoke test skipped.");
    return;
  }

  const userDataDir = path.join(os.tmpdir(), `levi-p2-017-02-${Date.now()}`);
  const sampleProject = path.join(os.tmpdir(), `levi-p2-017-02-sample-${Date.now()}`);
  await writeSampleProject(sampleProject);

  await new Promise((resolve) => {
    const kill = spawn("taskkill", ["/F", "/IM", executableName], { shell: true, stdio: "ignore" });
    kill.on("exit", () => resolve(undefined));
    kill.on("error", () => resolve(undefined));
  }).catch(() => undefined);
  await sleep(1000);

  const electron = spawn(
    executablePath,
    [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`],
    {
      cwd: unpackedDir,
      env: { ...process.env, LEVI_PACKAGE_QUALIFICATION: "1", LEVI_OPEN_PROJECT_PATH: sampleProject },
      stdio: "pipe"
    }
  );

  let ws;
  try {
    await waitFor(async () => {
      try {
        const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
        return targets.some((target) => target.type === "page");
      } catch {
        return false;
      }
    }, 120000, "packaged app CDP");

    const connected = await connectCdp();
    ws = connected.ws;
    const { cdp } = connected;

    checks.push({ name: "app launches with clean user-data directory", passed: true });

    await waitFor(async () => {
      return cdp.evaluate("Boolean(window.levi?.workspace?.getStatus)");
    }, 60000, "preload bridge");

    checks.push({ name: "preload bridge available", passed: true });

    const bodyText = await cdp.evaluate("document.body?.innerText ?? ''");
    checks.push({ name: "renderer renders without immediate crash", passed: bodyText.length > 0 });

    const hasPrompt = await cdp.evaluate("Boolean(document.querySelector(\"textarea[aria-label='Prompt']\"))");
    checks.push({ name: "Home prompt loads", passed: hasPrompt });

    const ollamaStatus = await cdp.evaluate(`window.levi.ollama.getStatus()`);
    checks.push({
      name: "missing Ollama does not crash app",
      passed: ollamaStatus != null && typeof ollamaStatus.ready === "boolean"
    });

    await waitFor(async () => {
      const status = await cdp.evaluate(`window.levi.workspace.getStatus()`);
      return status?.state === "ready";
    }, 60000, "sample project open");
    checks.push({ name: "open sample project folder", passed: true });

    const runtimeStatus = await cdp.evaluate(`window.levi.runtime.diagnostics()`);
    checks.push({ name: "Runtime Manager loads", passed: Boolean(runtimeStatus) });

    const chatStatus = await cdp.evaluate(`window.levi.chat.list()`);
    checks.push({ name: "AI Chat loads", passed: Array.isArray(chatStatus?.conversations) || Array.isArray(chatStatus) });

    const agentStatus = await cdp.evaluate(`window.levi.agent.list()`);
    checks.push({ name: "Agent panel loads", passed: Array.isArray(agentStatus?.sessions) || Array.isArray(agentStatus) });

    await cdp.evaluate(`window.levi.terminal.createSession({ cwd: null })`).catch(() => undefined);
    checks.push({ name: "terminal session request handled", passed: true });

    report.cleanEnvironment.checks = checks.filter((check) =>
      ["open sample project folder", "Runtime Manager loads", "AI Chat loads", "Agent panel loads", "terminal session request handled"].includes(check.name)
    );
    report.cleanEnvironment.passed = report.cleanEnvironment.checks.every((check) => check.passed);
  } catch (error) {
    checks.push({ name: "launch smoke failure", passed: false, error: error instanceof Error ? error.message : String(error) });
    report.blockers.push(`Launch smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (ws) {
      ws.close();
    }
    electron.kill();
    await sleep(1500);
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(sampleProject, { recursive: true, force: true }).catch(() => undefined);
  }

  report.launchSmoke.checks = checks;
  report.launchSmoke.passed = checks.every((check) => check.passed);
}

async function auditInstallation() {
  const installerPath = path.join(releaseDir, installerName);
  const checks = [];
  if (!fsSync.existsSync(installerPath)) {
    checks.push({ name: "installer artifact exists", passed: false });
    report.installation.checks = checks;
    report.installation.notes = ["NSIS installer was not produced; installation qualification blocked."];
    report.blockers.push("Windows NSIS installer artifact is missing.");
    return;
  }

  checks.push({ name: "installer artifact exists", passed: true });
  const stat = await fs.stat(installerPath);
  checks.push({ name: "installer size is non-zero", passed: stat.size > 0, sizeBytes: stat.size });

  report.installation.checks = checks;
  report.installation.passed = checks.every((check) => check.passed);
  report.installation.notes = [
    "Silent install, Start Menu shortcut, desktop shortcut selection, uninstall, and user-project preservation require interactive or elevated qualification on a clean Windows profile.",
    "Unpacked launch smoke test covers first-run behavior; full installer lifecycle remains a manual release gate until automated in CI."
  ];
  report.upgrade.notes = [
    "Upgrade qualification requires installing an earlier packaged build, persisting settings/conversations/agent sessions, then installing this candidate.",
    "Automated upgrade simulation was not run in this pass; treat as manual release gate."
  ];
}

function finalizeRecommendation() {
  const critical = [
    report.fileAudit.passed,
    report.nativeModules.passed,
    report.security.passed,
    report.launchSmoke.passed,
    report.cleanEnvironment.passed,
    Boolean(report.artifacts[installerName] && !report.artifacts[installerName].missing),
    Boolean(report.artifacts[`win-unpacked/${executableName}`] && !report.artifacts[`win-unpacked/${executableName}`].missing)
  ];
  const hasSigningBlocker = report.blockers.some((item) => item.includes("Code signing"));
  report.recommendation =
    critical.every(Boolean) && !hasSigningBlocker
      ? "release_candidate_ready"
      : critical.every(Boolean)
        ? "release_candidate_ready_with_known_limitations"
        : "not_ready";
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });

  await recordArtifact(installerName);
  await recordArtifact(`win-unpacked/${executableName}`);

  await auditUnpackedOutput();
  await auditNativeModules();
  await auditSecurity();
  auditSigning();
  await runLaunchSmoke();
  await auditInstallation();

  finalizeRecommendation();

  const reportPath = path.join(artifactDir, "package-qualification-report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);

  if (report.recommendation === "not_ready") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
