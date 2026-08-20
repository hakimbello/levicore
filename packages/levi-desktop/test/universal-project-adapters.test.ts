import { describe, expect, it } from "vitest";
import type { WorkspaceScanSummary } from "../src/types/levi-api";
import { detectUniversalEnvironment, detectUniversalProjectFromSummary, detectUniversalRunCommands } from "../electron/main/project-adapters";

function summary(overrides: Partial<WorkspaceScanSummary>): WorkspaceScanSummary {
  return {
    projectName: "demo",
    rootPath: "C:\\demo",
    languages: [],
    frameworks: [],
    likelyEntryPoints: [],
    sourceDirectories: [],
    testDirectories: [],
    scripts: {},
    documentationFiles: [],
    manifestFiles: [],
    includedFileCount: 0,
    excludedFileCount: 0,
    scanTimestamp: new Date(0).toISOString(),
    ...overrides
  };
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const yarnCommand = process.platform === "win32" ? "yarn.cmd" : "yarn";

describe("universal project adapters", () => {
  it.each([
    ["Vue + Vite", { frameworks: ["Vue", "Vite"], scripts: { dev: "vite", build: "vite build" }, manifestFiles: ["package.json", "vite.config.ts"], packageManager: "pnpm" }, "vue-vite", `${pnpmCommand} run build`],
    ["Svelte + Vite", { frameworks: ["Svelte", "Vite"], scripts: { dev: "vite", build: "vite build" }, manifestFiles: ["package.json", "vite.config.ts"], packageManager: "npm" }, "svelte-vite", `${npmCommand} run build`],
    ["SvelteKit", { frameworks: ["SvelteKit", "Svelte"], scripts: { dev: "vite dev", build: "vite build" }, manifestFiles: ["package.json", "svelte.config.js"], packageManager: "yarn" }, "sveltekit", `${yarnCommand} build`],
    ["Nuxt", { frameworks: ["Nuxt", "Vue"], scripts: { dev: "nuxt dev", build: "nuxt build" }, manifestFiles: ["package.json", "nuxt.config.ts"], packageManager: "npm" }, "nuxt", `${npmCommand} run build`],
    ["Astro", { frameworks: ["Astro"], scripts: { dev: "astro dev", build: "astro build" }, manifestFiles: ["package.json", "astro.config.mjs"], packageManager: "npm" }, "astro", `${npmCommand} run build`]
  ])("detects %s command profiles", (_label, fixture, projectType, buildCommand) => {
    const detection = detectUniversalProjectFromSummary(summary(fixture));
    expect(detection).toMatchObject({ projectType, projectFamily: "web", buildCommand });
    expect(detection.requiredTools).toContain("node");
    expect(detectUniversalRunCommands(summary(fixture))[0].longRunning).toBe(true);
  });

  it.each([
    ["Generic Python", { languages: ["Python"], manifestFiles: ["pyproject.toml"], likelyEntryPoints: ["main.py"] }, "python", "python main.py"],
    ["FastAPI", { languages: ["Python"], frameworks: ["FastAPI"], manifestFiles: ["requirements.txt"], likelyEntryPoints: ["main.py"] }, "fastapi", "python -m uvicorn main:app --reload"],
    ["Flask", { languages: ["Python"], frameworks: ["Flask"], manifestFiles: ["requirements.txt"], likelyEntryPoints: ["app.py"] }, "flask", "python -m flask --app app run"],
    ["Django", { languages: ["Python"], frameworks: ["Django"], manifestFiles: ["manage.py", "requirements.txt"], likelyEntryPoints: ["manage.py"] }, "django", "python manage.py runserver"]
  ])("detects %s projects", (_label, fixture, projectType, runCommand) => {
    const detection = detectUniversalProjectFromSummary(summary(fixture));
    expect(detection).toMatchObject({ projectType, language: "Python", runCommand });
    expect(detection.requiredTools).toContain("python");
  });

  it.each([
    ["Go", { languages: ["Go"], manifestFiles: ["go.mod"], likelyEntryPoints: ["main.go"] }, "go", "go test ./...", "go run ."],
    ["Rust", { languages: ["Rust"], manifestFiles: ["Cargo.toml"], likelyEntryPoints: ["src/main.rs"] }, "rust", "cargo test", "cargo run"],
    [".NET", { languages: ["C#"], frameworks: ["ASP.NET Core"], manifestFiles: ["TaskApi.csproj"], likelyEntryPoints: ["Program.cs"] }, "dotnet", "dotnet test", "dotnet run"]
  ])("detects %s command profiles", (_label, fixture, projectType, testCommand, runCommand) => {
    const detection = detectUniversalProjectFromSummary(summary(fixture));
    expect(detection).toMatchObject({ projectType, testCommand, runCommand });
  });

  it.each([
    ["Electron", { frameworks: ["Electron", "React"], manifestFiles: ["package.json"], scripts: { dev: "electron-vite dev", build: "electron-builder" }, packageManager: "npm" }, "electron", "desktop"],
    ["Tauri", { frameworks: ["Tauri", "React", "Vite"], manifestFiles: ["package.json", "src-tauri/Cargo.toml", "src-tauri/tauri.conf.json"], scripts: { tauri: "tauri dev", "tauri:build": "tauri build" }, packageManager: "pnpm" }, "tauri", "desktop"],
    ["Flutter", { frameworks: ["Flutter"], languages: ["Dart"], manifestFiles: ["pubspec.yaml"], likelyEntryPoints: ["lib/main.dart"] }, "flutter", "mobile"],
    ["React Native", { frameworks: ["React Native"], manifestFiles: ["package.json", "android/app/build.gradle"], scripts: { android: "react-native run-android" }, packageManager: "yarn" }, "react-native", "mobile"],
    ["Expo", { frameworks: ["Expo"], manifestFiles: ["package.json", "app.json"], scripts: { start: "expo start", android: "expo start --android" }, packageManager: "npm" }, "expo", "mobile"]
  ])("detects %s execution profiles", (_label, fixture, projectType, projectFamily) => {
    const detection = detectUniversalProjectFromSummary(summary(fixture));
    expect(detection).toMatchObject({ projectType, projectFamily });
    expect(detectUniversalRunCommands(summary(fixture)).length).toBeGreaterThan(0);
  });

  it("reports the Windows iOS native-build limitation without fake commands", () => {
    const detection = detectUniversalProjectFromSummary(summary({ languages: ["Swift"], frameworks: ["iOS"], manifestFiles: ["Package.swift"], likelyEntryPoints: ["Sources/main.swift"] }));
    expect(detection.projectType).toBe("ios");
    if (process.platform === "win32") {
      expect(detection.framework).toContain("Native iOS build: unavailable");
      expect(detection.buildCommand).toBeUndefined();
      expect(detection.runTargets).toEqual([]);
    }
  });

  it("reports relevant missing tools for the detected project only", async () => {
    const fakeExec = ((_command: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(new Error("missing"), "", "");
    }) as never;
    const environment = await detectUniversalEnvironment(null, summary({ frameworks: ["FastAPI"], languages: ["Python"], manifestFiles: ["requirements.txt"] }), fakeExec);
    expect(environment.relevantMissing).toEqual(["python", "pip"]);
    expect(environment.tools.git.status).toBe("missing");
  });

  it("treats synchronous tool launch failures as missing tools", async () => {
    const throwingExec = (() => {
      throw new Error("spawn EINVAL");
    }) as never;
    const environment = await detectUniversalEnvironment(null, summary({ frameworks: ["FastAPI"], languages: ["Python"], manifestFiles: ["requirements.txt"] }), throwingExec);
    expect(environment.relevantMissing).toEqual(["python", "pip"]);
    expect(environment.tools.python).toMatchObject({ status: "missing" });
  });
});
