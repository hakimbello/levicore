import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  buildExecutionOrder,
  classifyPlanComplexity,
  createExecutionPlan,
  discoverPlanningCandidates,
  isPlanningRequest,
  isSingleFileEditRequest
} from "../electron/main/planning-context";
import { scanWorkspace } from "../electron/main/workspace-context";

async function writeFixture(root: string) {
  await fs.mkdir(path.join(root, "src", "auth"), { recursive: true });
  await fs.mkdir(path.join(root, "src", "routes"), { recursive: true });
  await fs.mkdir(path.join(root, "test"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "planner-fixture",
        scripts: { test: "vitest run", build: "vite build", typecheck: "tsc --noEmit" },
        dependencies: { express: "^4.18.0", react: "^19.0.0" },
        devDependencies: { vite: "^7.0.0" }
      },
      null,
      2
    ),
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "src", "server.ts"),
    "import express from 'express';\nconst app = express();\napp.use(express.json());\napp.listen(3000);\n",
    "utf8"
  );
  await fs.writeFile(path.join(root, "src", "auth", "session.ts"), "export function getSession() { return null; }\n", "utf8");
  await fs.writeFile(path.join(root, "src", "routes", "users.ts"), "export function userRoutes() { return []; }\n", "utf8");
  await fs.writeFile(path.join(root, "test", "server.test.ts"), "import '../src/server';\n", "utf8");
  await fs.writeFile(path.join(root, "README.md"), "This Express app has a React client and server routes.\n", "utf8");
}

async function hashTree(root: string): Promise<string> {
  const entries: string[] = [];
  async function walk(directory: string) {
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children) {
      const absolutePath = path.join(directory, child.name);
      if (child.isDirectory()) {
        await walk(absolutePath);
      } else {
        const relativePath = path.relative(root, absolutePath);
        const content = await fs.readFile(absolutePath);
        entries.push(`${relativePath}:${createHash("sha256").update(content).digest("hex")}`);
      }
    }
  }
  await walk(root);
  return createHash("sha256").update(entries.sort().join("\n")).digest("hex");
}

describe("IDE-002 planning context", () => {
  it("distinguishes questions, planning requests, and explicit single-file edits", () => {
    expect(isPlanningRequest("What is this repository?")).toBe(false);
    expect(isPlanningRequest("How would you add authentication?")).toBe(true);
    expect(isPlanningRequest("Make a plan for adding authentication.")).toBe(true);
    expect(isPlanningRequest("Add authentication.")).toBe(false);
    expect(isPlanningRequest("Change src/Home.tsx heading to Hello.")).toBe(false);
    expect(isSingleFileEditRequest("Change src/Home.tsx heading to Hello.")).toBe(true);
  });

  it("discovers affected files from workspace evidence without writing files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-plan-"));
    await writeFixture(root);
    const beforeHash = await hashTree(root);
    const scan = await scanWorkspace(root);

    const { candidates } = await discoverPlanningCandidates(scan, "Convert this Express application to Fastify.");
    const afterHash = await hashTree(root);

    expect(afterHash).toBe(beforeHash);
    expect(candidates.map((candidate) => candidate.relativePath)).toContain("src/server.ts");
    expect(candidates.map((candidate) => candidate.relativePath)).toContain("package.json");
    expect(candidates.every((candidate) => scan.files.some((file) => file.relativePath === candidate.relativePath))).toBe(true);
  });

  it("marks uncertain affected files as possible", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-plan-"));
    await writeFixture(root);
    const scan = await scanWorkspace(root);

    const { candidates } = await discoverPlanningCandidates(scan, "Add GitHub OAuth.");

    expect(candidates.some((candidate) => candidate.certainty === "possible")).toBe(true);
    expect(candidates.find((candidate) => candidate.relativePath === "src/auth/session.ts")?.certainty).toBe("confirmed");
  });

  it("classifies complexity using file count, framework impact, dependencies, and API surface", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-plan-"));
    await writeFixture(root);
    const scan = await scanWorkspace(root);
    const { candidates } = await discoverPlanningCandidates(scan, "Convert React to Vue.");

    expect(classifyPlanComplexity(scan, candidates, "Convert React to Vue.")).toMatch(/High|Very High/);
  });

  it("builds deterministic execution order with manifests before implementation and tests", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-plan-"));
    await writeFixture(root);
    const scan = await scanWorkspace(root);
    const { candidates } = await discoverPlanningCandidates(scan, "Convert this Express application to Fastify.");

    const order = buildExecutionOrder(candidates);
    const paths = order.flatMap((step) => step.affectedFiles);

    expect(new Set(paths).size).toBe(paths.length);
    expect(order[0]?.title).toBe("Update entry points and shared boundaries");
    expect(paths).toContain("src/server.ts");
  });

  it("assigns each confirmed file to a single execution step", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-plan-"));
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.mkdir(path.join(root, "test"), { recursive: true });
    await fs.writeFile(path.join(root, "src/config.ts"), "export const SERVER_TIMEOUT_MS = 30000;\n");
    await fs.writeFile(
      path.join(root, "src/server.ts"),
      'import { SERVER_TIMEOUT_MS } from "./config";\nexport function createServer() { return { timeout: SERVER_TIMEOUT_MS }; }\n'
    );
    await fs.writeFile(path.join(root, "src/routes.ts"), 'import { createServer } from "./server";\nexport const routes = [];\n');
    await fs.writeFile(path.join(root, "test/server.test.ts"), "import '../src/server';\n");
    const scan = await scanWorkspace(root);
    const { candidates } = await discoverPlanningCandidates(
      scan,
      "Rename the server timeout configuration and update all affected files."
    );
    const order = buildExecutionOrder(candidates);
    const paths = order.flatMap((step) => step.affectedFiles);

    expect(candidates.some((candidate) => candidate.relativePath === "src/config.ts" && candidate.certainty === "confirmed")).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("src/config.ts");
  });

  it("creates a schema-complete plan using only discovered candidate files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-plan-"));
    await writeFixture(root);
    const scan = await scanWorkspace(root);
    const { candidates } = await discoverPlanningCandidates(scan, "Add GitHub OAuth.");
    const plan = createExecutionPlan({
      requestId: "plan-1",
      prompt: "Add GitHub OAuth.",
      scan,
      candidates,
      modelOutput: {
        goal: "Add GitHub OAuth",
        summary: "Plan a GitHub OAuth integration without editing files.",
        confidence: "medium",
        dependencies: ["GitHub OAuth app credentials"],
        risks: ["Authentication changes can affect login state."],
        assumptions: ["OAuth should be added to the existing session flow."],
        openQuestions: ["Which callback URL should be used?"],
        blockedItems: [],
        suggestedNextAction: "Confirm OAuth requirements before execution."
      },
      timings: { retrievalMs: 1, modelMs: 2, totalMs: 3 }
    });

    expect(plan.goal).toBe("Add GitHub OAuth");
    expect(plan.affectedFiles.every((file) => candidates.some((candidate) => candidate.relativePath === file.relativePath))).toBe(true);
    expect(plan.validationCommands).toEqual(["npm run typecheck", "npm test", "npm run build"]);
    expect(plan.suggestedNextAction).toContain("Confirm");
    expect(plan.applicableProjectRules).toEqual([]);
    expect(plan.designConstraints).toEqual([]);
    expect(plan.ruleConflicts).toEqual([]);
    expect(plan.ruleSources).toEqual([]);
  });
});
