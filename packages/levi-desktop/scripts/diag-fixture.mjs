import fs from "node:fs/promises";
import path from "node:path";
import { scanWorkspace } from "../dist-electron/electron/main/workspace-context.js";
import { buildProjectRulesCache } from "../dist-electron/electron/main/project-rules-context.js";
import {
  discoverPlanningCandidates,
  createExecutionPlan,
  buildExecutionOrder
} from "../dist-electron/electron/main/planning-context.js";
import { validateExecutionPreconditions, flattenPlanExecutionSteps } from "../dist-electron/electron/main/execution-context.js";

const fixtureRoot = path.join(process.env.TEMP ?? "/tmp", "levi-live-fixture-002b");
await fs.mkdir(path.join(fixtureRoot, "src"), { recursive: true });
await fs.mkdir(path.join(fixtureRoot, "test"), { recursive: true });
await fs.writeFile(
  path.join(fixtureRoot, "package.json"),
  `${JSON.stringify({ name: "timeout-fixture", scripts: { test: "vitest run", typecheck: "tsc --noEmit" } }, null, 2)}\n`
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

const prompt = "Rename the server timeout configuration and update all affected files.";
const scan = await scanWorkspace(fixtureRoot);
const cache = await buildProjectRulesCache(scan);
const { candidates } = await discoverPlanningCandidates(scan, prompt);
console.log(
  "candidates",
  candidates.map((candidate) => ({ p: candidate.relativePath, c: candidate.certainty, s: candidate.score }))
);
console.log("executionOrder", JSON.stringify(buildExecutionOrder(candidates), null, 2));
const plan = createExecutionPlan({
  requestId: "r1",
  prompt,
  scan,
  candidates,
  modelOutput: {
    goal: prompt,
    summary: "fallback",
    confidence: "low",
    risks: [],
    assumptions: [],
    openQuestions: [],
    blockedItems: [],
    suggestedNextAction: "review"
  },
  timings: { retrievalMs: 1, modelMs: 1, totalMs: 2 }
});
console.log(
  "flattened",
  flattenPlanExecutionSteps(plan).map((step) => step.relativePath)
);
const validation = validateExecutionPreconditions({
  plan,
  scan,
  rulesCache: cache,
  workspaceRootPath: scan.rootRealPath,
  activeTransactionRoot: null
});
console.log("validation", validation);
