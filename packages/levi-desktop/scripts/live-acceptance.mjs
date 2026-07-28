import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const artifactDir = path.join(packageRoot, "test-artifacts", "live-002b");
const fixtureRoot = path.join(process.env.TEMP ?? "/tmp", "levi-live-fixture-002b");
const debugPort = process.env.LEVI_ELECTRON_DEBUG_PORT ?? "9333";
const PLANNING_PROMPT = "Rename the server timeout configuration and update all affected files.";

const results = {
  ollama: null,
  tests: {},
  timings: {},
  screenshots: [],
  defects: [],
  defectsFixed: []
};

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

  async screenshot(name) {
    await this.send("Page.bringToFront").catch(() => undefined);
    const { data } = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const filePath = path.join(artifactDir, `${name}.png`);
    await fs.writeFile(filePath, Buffer.from(data, "base64"));
    results.screenshots.push(filePath);
    return filePath;
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs, label, onPoll) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    if (onPoll) {
      await onPoll();
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function connectCdp() {
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page" && /127\.0\.0\.1:\d+/.test(target.url));
  if (!page) {
    throw new Error("Electron renderer target not found.");
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const cdp = new Cdp(ws);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  return { cdp, ws };
}

async function clickButton(cdp, label) {
  const clicked = await cdp.evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const match = buttons.find((button) => button.textContent?.trim() === ${JSON.stringify(label)} || button.getAttribute("aria-label") === ${JSON.stringify(label)});
    if (!match) return false;
    match.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`Button not found: ${label}`);
  }
}

async function hasButton(cdp, label) {
  return cdp.evaluate(`(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === ${JSON.stringify(label)} || button.getAttribute("aria-label") === ${JSON.stringify(label)}))()`);
}

async function setPrompt(cdp, text) {
  await cdp.evaluate(`(() => {
    const textarea = document.querySelector("textarea[aria-label='Prompt']");
    if (!textarea) throw new Error("Prompt textarea missing");
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    nativeInputValueSetter?.call(textarea, ${JSON.stringify(text)});
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
}

async function submitPrompt(cdp, text) {
  await setPrompt(cdp, text);
  await clickButton(cdp, "Send");
}

async function waitForWorkspaceReady(cdp) {
  await waitFor(async () => {
    const status = await cdp.evaluate(`window.levi?.workspace?.getStatus?.()`);
    return status?.state === "ready";
  }, 120000, "workspace ready");
}

async function waitForPlan(cdp) {
  let polls = 0;
  await waitFor(async () => hasButton(cdp, "Approve"), 900000, "plan Approve button", async () => {
    polls += 1;
    if (polls % 60 === 0) {
      const snippet = await cdp.evaluate(`document.body.innerText.slice(0, 800)`);
      console.log(`[plan-wait] ${snippet}`);
      await cdp.screenshot(`plan-wait-${polls}`);
    }
  });
}

async function clickApprove(cdp) {
  await clickButton(cdp, "Approve");
  await waitFor(async () => {
    if (await hasButton(cdp, "Apply Step")) {
      return true;
    }
    if (await hasButton(cdp, "Generate Step Proposal")) {
      return true;
    }
    const status = await getExecutionStatus(cdp);
    if (status.activeTransaction?.transactionId) {
      return true;
    }
    const body = await cdp.evaluate(`document.body.innerText`);
    if (body.includes("Execution transaction prepared") || body.includes("Approved multi-file execution")) {
      return true;
    }
    return false;
  }, 120000, "execution prepared after Approve", async () => {
    const notice = await cdp.evaluate(`document.querySelector(".levi-plan-notice")?.textContent ?? ""`);
    if (notice && /failed|blocked|duplicate|stale|unavailable/i.test(notice)) {
      throw new Error(`Plan approval failed: ${notice}`);
    }
  });
}

async function waitForStepProposal(cdp) {
  await waitFor(async () => {
    if (await hasButton(cdp, "Apply Step")) {
      return true;
    }
    if (await hasButton(cdp, "Generate Step Proposal")) {
      await clickButton(cdp, "Generate Step Proposal");
    }
    return false;
  }, 600000, "step Apply Step button");
}

async function waitForAggregateReview(cdp) {
  await waitFor(async () => hasButton(cdp, "Keep Changes"), 600000, "aggregate Keep Changes");
}

async function getExecutionStatus(cdp) {
  return cdp.evaluate(`window.levi.execution.getStatus()`);
}

async function readFixtureFile(relativePath) {
  return fs.readFile(path.join(fixtureRoot, relativePath), "utf8");
}

async function hashFixture() {
  const entries = [];
  async function walk(directory) {
    for (const child of await fs.readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, child.name);
      if (child.isDirectory()) {
        await walk(absolutePath);
      } else if (!child.name.endsWith(".tmp") && !child.name.endsWith("~")) {
        const relativePath = path.relative(fixtureRoot, absolutePath);
        const content = await fs.readFile(absolutePath);
        entries.push(`${relativePath}:${createHash("sha256").update(content).digest("hex")}`);
      }
    }
  }
  await walk(fixtureRoot);
  return createHash("sha256").update(entries.sort().join("\n")).digest("hex");
}

async function writeFixture() {
  await fs.rm(fixtureRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(fixtureRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(fixtureRoot, "test"), { recursive: true });
  await fs.writeFile(
    path.join(fixtureRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "timeout-fixture",
        scripts: { test: "vitest run", typecheck: "tsc --noEmit" }
      },
      null,
      2
    )}\n`
  );
  await fs.writeFile(path.join(fixtureRoot, "src/config.ts"), "export const SERVER_TIMEOUT_MS = 30000;\n");
  await fs.writeFile(
    path.join(fixtureRoot, "src/server.ts"),
    'import { SERVER_TIMEOUT_MS } from "./config";\n\nexport function createServer() {\n  return { timeout: SERVER_TIMEOUT_MS };\n}\n'
  );
  await fs.writeFile(
    path.join(fixtureRoot, "src/routes.ts"),
    'import { createServer } from "./server";\n\nexport const routes = [{ path: "/", handler: createServer }];\n'
  );
  await fs.writeFile(
    path.join(fixtureRoot, "test/server.test.ts"),
    'import { describe, expect, it } from "vitest";\nimport { createServer } from "../src/server";\n\ndescribe("server", () => {\n  it("uses configured timeout", () => {\n    expect(createServer().timeout).toBe(30000);\n  });\n});\n'
  );
  await fs.writeFile(
    path.join(fixtureRoot, "AGENTS.md"),
    "# Fixture rules\n\n- Use Vitest.\n- Do not add dependencies.\n- Preserve existing naming and formatting conventions.\n"
  );
}

async function launchElectron() {
  await new Promise((resolve) => {
    const kill = spawn("taskkill", ["/F", "/IM", "electron.exe"], { shell: true, stdio: "ignore" });
    kill.on("exit", () => resolve(undefined));
    kill.on("error", () => resolve(undefined));
  }).catch(() => undefined);
  await sleep(1500);
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 5174));
    });
  });
  const devServerUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
    LEVI_REPO_ROOT: repoRoot,
    LEVI_LIVE_ACCEPTANCE: "1",
    LEVI_OPEN_PROJECT_PATH: fixtureRoot,
    LEVI_ELECTRON_DEBUG_PORT: debugPort
  };
  const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  const electronBin = path.join(repoRoot, "node_modules", "electron", "cli.js");
  const vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: packageRoot,
    env,
    stdio: "pipe"
  });
  await waitFor(async () => {
    try {
      const response = await fetch(devServerUrl);
      return response.ok;
    } catch {
      return false;
    }
  }, 120000, "vite dev server");
  const electron = spawn(process.execPath, [electronBin, `--remote-debugging-port=${debugPort}`, "."], {
    cwd: packageRoot,
    env,
    stdio: "pipe"
  });
  return { vite, electron, devServerUrl };
}

async function stopProcesses(child) {
  if (!child || child.killed) {
    return;
  }
  child.kill();
}

function baseBlockedPlan(overrides) {
  return {
    planId: `blocked-${Date.now()}`,
    requestId: "live-block",
    goal: "Blocked plan",
    summary: "Security block test",
    confidence: "high",
    estimatedComplexity: "Low",
    estimatedFiles: 1,
    estimatedSteps: 1,
    affectedFiles: [
      {
        relativePath: overrides.relativePath,
        certainty: "confirmed",
        role: "implementation",
        reason: "test",
        evidenceSourceIds: []
      }
    ],
    executionOrder: [
      {
        order: 1,
        title: "Blocked step",
        purpose: "Should not execute",
        affectedFiles: [overrides.relativePath],
        risk: "high"
      }
    ],
    dependencies: [],
    validationCommands: ["npm test"],
    risks: [],
    assumptions: [],
    openQuestions: [],
    blockedItems: [],
    suggestedNextAction: "Blocked",
    applicableProjectRules: [],
    designConstraints: [],
    ruleConflicts: overrides.ruleConflicts ?? [],
    ruleSources: [],
    timings: { retrievalMs: 1, modelMs: 1, totalMs: 2 }
  };
}

async function newChat(cdp) {
  await clickButton(cdp, "New Chat");
  await sleep(1500);
}

async function runTestA(cdp) {
  const baselineHash = await hashFixture();
  const configBeforeApprove = await readFixtureFile("src/config.ts");
  await submitPrompt(cdp, PLANNING_PROMPT);
  await waitForPlan(cdp);
  await cdp.screenshot("test-a-01-plan-ready");
  const planText = await cdp.evaluate(`document.body.innerText`);
  results.tests.testA = { planContainsConfig: planText.includes("config.ts"), baselineHash };
  await clickApprove(cdp);
  await cdp.screenshot("test-a-02-approved-plan");
  const afterApproveHash = await hashFixture();
  results.tests.testA.prepareWritesNothing = afterApproveHash === baselineHash;
  await cdp.screenshot("test-a-03-prepared-transaction");
  await waitForStepProposal(cdp);
  await cdp.screenshot("test-a-04-first-step-diff-before-apply");
  const configBeforeApply = await readFixtureFile("src/config.ts");
  results.tests.testA.configUnchangedBeforeApply = configBeforeApply === configBeforeApprove;
  await clickButton(cdp, "Reject Step");
  await sleep(1000);
  results.tests.testA.rejectLeavesFileUnchanged = (await readFixtureFile("src/config.ts")) === configBeforeApply;
  await clickButton(cdp, "Generate Step Proposal");
  await waitForStepProposal(cdp);
  results.tests.testA.regenerateWorks = await hasButton(cdp, "Apply Step");
  await clickButton(cdp, "Apply Step");
  await sleep(1500);
  await cdp.screenshot("test-a-05-after-first-applied-step");
  results.tests.testA.firstFileChanged = (await readFixtureFile("src/config.ts")) !== configBeforeApply;

  while (true) {
    const status = await getExecutionStatus(cdp);
    if (status.activeTransaction?.status === "completed") {
      break;
    }
    if (await hasButton(cdp, "Generate Step Proposal")) {
      await clickButton(cdp, "Generate Step Proposal");
      await waitForStepProposal(cdp);
      await clickButton(cdp, "Apply Step");
      await sleep(1500);
      continue;
    }
    if (await hasButton(cdp, "Apply Step")) {
      await clickButton(cdp, "Apply Step");
      await sleep(1500);
      continue;
    }
    await sleep(1000);
  }

  await waitForAggregateReview(cdp);
  await cdp.screenshot("test-a-06-final-aggregate-review");
  const reviewText = await cdp.evaluate(`document.body.innerText`);
  results.tests.testA.recommendedNotRun = reviewText.includes("Recommended — not run");
  await clickButton(cdp, "Keep Changes");
  await sleep(1500);
  await cdp.screenshot("test-a-07-kept-transaction");
  results.tests.testA.keepRemovesRollback = !(await hasButton(cdp, "Roll Back Transaction"));
  results.tests.testA.finalHash = await hashFixture();
  results.timings = await cdp.evaluate(`window.levi.dev.getTimings()`);
}

async function resetFixture() {
  await writeFixture();
}

async function runTestB(cdp) {
  await newChat(cdp);
  await resetFixture();
  const baselineHash = await hashFixture();
  await cdp.evaluate(`window.levi.dev.injectPlan(null)`).catch(() => undefined);
  await submitPrompt(cdp, PLANNING_PROMPT);
  await waitForPlan(cdp);
  await clickApprove(cdp);
  while (true) {
    const status = await getExecutionStatus(cdp);
    if (status.activeTransaction?.status === "completed") {
      break;
    }
    if (await hasButton(cdp, "Generate Step Proposal")) {
      await clickButton(cdp, "Generate Step Proposal");
    }
    await waitForStepProposal(cdp);
    await clickButton(cdp, "Apply Step");
    await sleep(1500);
  }
  await waitForAggregateReview(cdp);
  await cdp.screenshot("test-b-01-before-rollback");
  await clickButton(cdp, "Roll Back Transaction");
  await sleep(2000);
  await cdp.screenshot("test-b-02-rolled-back");
  const restoredHash = await hashFixture();
  const status = await getExecutionStatus(cdp);
  results.tests.testB = {
    restoredHashMatchesBaseline: restoredHash === baselineHash,
    status: status.activeTransaction?.status ?? "none"
  };
}

async function runTestC(cdp) {
  await newChat(cdp);
  await resetFixture();
  await submitPrompt(cdp, PLANNING_PROMPT);
  await waitForPlan(cdp);
  await clickApprove(cdp);
  let applied = 0;
  while (applied < 2) {
    if (await hasButton(cdp, "Generate Step Proposal")) {
      await clickButton(cdp, "Generate Step Proposal");
    }
    await waitForStepProposal(cdp);
    await clickButton(cdp, "Apply Step");
    await sleep(1500);
    applied += 1;
  }
  if (await hasButton(cdp, "Generate Step Proposal")) {
    await clickButton(cdp, "Generate Step Proposal");
  }
  await waitForStepProposal(cdp);
  const status = await getExecutionStatus(cdp);
  const nextPath = status.activeTransaction?.steps?.[status.activeTransaction.currentStepIndex]?.relativePath;
  if (nextPath) {
    await fs.writeFile(path.join(fixtureRoot, nextPath), "// external tamper\n", "utf8");
  }
  await clickButton(cdp, "Apply Step");
  await sleep(2000);
  await cdp.screenshot("test-c-01-stale-step-rejection");
  const body = await cdp.evaluate(`document.body.innerText`);
  results.tests.testC = {
    staleMessage: body.includes("changed") || body.includes("stale") || body.includes("externally"),
    rollbackAvailable: (await hasButton(cdp, "Roll Back Transaction")) || (await hasButton(cdp, "Keep Changes"))
  };
  if (await hasButton(cdp, "Roll Back Transaction")) {
    await clickButton(cdp, "Roll Back Transaction");
    await sleep(2000);
    await cdp.screenshot("test-c-02-rollback-result");
  }
}

async function runTestD(cdp) {
  await newChat(cdp);
  await resetFixture();
  await submitPrompt(cdp, PLANNING_PROMPT);
  await waitForPlan(cdp);
  await clickButton(cdp, "Approve");
  await sleep(500);
  const beforeCancelHash = await hashFixture();
  if (await hasButton(cdp, "Cancel Transaction")) {
    await clickButton(cdp, "Cancel Transaction");
    await sleep(2000);
  } else {
    await cdp.evaluate(`window.levi.execution.cancel((await window.levi.execution.getStatus()).activeTransaction.transactionId)`);
    await sleep(2000);
  }
  results.tests.testD = {
    cancelDuringGenerationNoWrite: (await hashFixture()) === beforeCancelHash
  };
  await cdp.screenshot("test-d-01-cancel-during-generation");

  await resetFixture();
  await submitPrompt(cdp, PLANNING_PROMPT);
  await waitForPlan(cdp);
  await clickApprove(cdp);
  if (await hasButton(cdp, "Generate Step Proposal")) {
    await clickButton(cdp, "Generate Step Proposal");
  }
  await waitForStepProposal(cdp);
  await clickButton(cdp, "Apply Step");
  await sleep(1500);
  if (await hasButton(cdp, "Generate Step Proposal")) {
    await clickButton(cdp, "Generate Step Proposal");
  }
  await waitForStepProposal(cdp);
  await clickButton(cdp, "Cancel Transaction");
  await sleep(1500);
  await cdp.screenshot("test-d-02-cancel-after-applied");
  results.tests.testD.afterAppliedChoices =
    (await hasButton(cdp, "Keep Changes")) && (await hasButton(cdp, "Roll Back Transaction"));
}

async function runTestE(cdp) {
  await newChat(cdp);
  await resetFixture();
  const cases = [
    { name: "env", relativePath: ".env", setup: async () => fs.writeFile(path.join(fixtureRoot, ".env"), "SECRET=1\n") },
    {
      name: "binary",
      relativePath: "src/logo.png",
      setup: async () => fs.writeFile(path.join(fixtureRoot, "src/logo.png"), Buffer.from([0, 1, 2]))
    },
    {
      name: "dist",
      relativePath: "dist/bundle.js",
      setup: async () => {
        await fs.mkdir(path.join(fixtureRoot, "dist"), { recursive: true });
        await fs.writeFile(path.join(fixtureRoot, "dist/bundle.js"), "generated\n");
      }
    }
  ];
  results.tests.testE = {};
  for (const testCase of cases) {
    await resetFixture();
    await testCase.setup();
    await cdp.evaluate(`window.levi.dev.openProjectPath(${JSON.stringify(fixtureRoot)})`);
    await waitForWorkspaceReady(cdp);
    const plan = baseBlockedPlan(testCase);
    await cdp.evaluate(`window.levi.dev.injectPlan(${JSON.stringify(plan)})`);
    await sleep(1000);
    let blocked = false;
    try {
      await cdp.evaluate(`window.levi.planning.approve(${JSON.stringify(plan.planId)})`);
    } catch {
      blocked = true;
    }
    const notice = await cdp.evaluate(`document.body.innerText`);
    blocked = blocked || notice.toLowerCase().includes("not executable") || notice.toLowerCase().includes("unsupported");
    results.tests.testE[testCase.name] = blocked;
    await cdp.screenshot(`test-e-block-${testCase.name}`);
  }
}

async function runTestF(cdp) {
  await newChat(cdp);
  await resetFixture();
  await cdp.evaluate(`window.levi.dev.openProjectPath(${JSON.stringify(fixtureRoot)})`);
  await waitForWorkspaceReady(cdp);
  await submitPrompt(cdp, PLANNING_PROMPT);
  await waitForPlan(cdp);
  await clickApprove(cdp);
  if (await hasButton(cdp, "Generate Step Proposal")) {
    await clickButton(cdp, "Generate Step Proposal");
  }
  await waitForStepProposal(cdp);
  await clickButton(cdp, "Apply Step");
  await sleep(1500);
  let switchBlocked = false;
  try {
    await cdp.evaluate(`window.levi.dev.openProjectPath(${JSON.stringify(path.join(process.env.TEMP ?? "/tmp", "other"))})`);
  } catch {
    switchBlocked = true;
  }
  const refresh = await cdp.evaluate(`window.levi.workspace.refresh()`);
  results.tests.testF = {
    switchBlocked,
    refreshBlocked: refresh.state === "refresh-required"
  };
  await clickButton(cdp, "Roll Back Transaction").catch(async () => clickButton(cdp, "Keep Changes"));
  await sleep(1500);
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  results.ollama = await fetch("http://127.0.0.1:11434/api/tags").then((response) => response.json());
  await writeFixture();
  const { vite, electron } = await launchElectron();
  let ws;
  try {
    await waitFor(async () => {
      try {
        const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
        return targets.some((target) => target.type === "page");
      } catch {
        return false;
      }
    }, 120000, "electron CDP");
    const connected = await connectCdp();
    ws = connected.ws;
    const { cdp } = connected;
    await waitFor(async () => cdp.evaluate(`Boolean(window.levi?.dev?.openProjectPath)`), 120000, "preload dev API");
    await waitForWorkspaceReady(cdp);
    await cdp.screenshot("00-home-ready");
    await runTestA(cdp);
    if (process.env.LEVI_LIVE_TEST_A_ONLY !== "1") {
      await runTestB(cdp);
      await runTestC(cdp);
      await runTestD(cdp);
      await runTestE(cdp);
      await runTestF(cdp);
      await cdp.screenshot("99-final-state");
    }
  } finally {
    if (ws) {
      ws.close();
    }
    await stopProcesses(electron);
    await stopProcesses(vite);
  }
  const reportPath = path.join(artifactDir, "live-report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  console.log(`Report written to ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
