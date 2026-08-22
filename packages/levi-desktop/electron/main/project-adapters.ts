import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ProjectDetection, ProjectType, RunAppCommand, UniversalRunTargetKind, WorkspaceScanSummary } from "../../src/types/levi-api";

type ExecFile = typeof execFileCallback;

export type UniversalProjectFamily = NonNullable<ProjectDetection["projectFamily"]>;

export type UniversalCommandProfile = {
  install?: string;
  build?: string;
  test?: string;
  check?: string;
  lint?: string;
  dev?: string;
  run?: string;
  package?: string;
};

export type ProjectAdapterProfile = {
  id: string;
  projectType: ProjectType;
  projectFamily: UniversalProjectFamily;
  framework?: string;
  language: string;
  packageManager?: string;
  buildSystem?: string;
  requiredTools: string[];
  commands: UniversalCommandProfile;
  entryPoint?: string;
  runTargets?: UniversalRunTargetKind[];
  confidence: number;
  evidence: string[];
};

export type UniversalProjectAdapter = {
  id: string;
  projectFamily: UniversalProjectFamily;
  framework?: string;
  language: string;
  packageManager?: string;
  buildSystem?: string;
  requiredTools: string[];
  detect(summary: WorkspaceScanSummary): ProjectAdapterProfile | null;
  environmentCheck?(environment: UniversalEnvironmentReport): UniversalEnvironmentReport;
};

export type UniversalToolState = {
  id: string;
  name: string;
  command: string;
  args: string[];
  status: "ready" | "missing" | "unknown";
  version?: string;
  message?: string;
};

export type UniversalEnvironmentReport = {
  tools: Record<string, UniversalToolState>;
  relevantMissing: string[];
  summary: string;
};

const WEB_FRAMEWORKS = new Set(["React", "Vite", "Vue", "Svelte", "SvelteKit", "Nuxt", "Astro", "Next.js"]);

export function detectUniversalProjectFromSummary(summary: WorkspaceScanSummary): ProjectDetection {
  const profile = detectProjectAdapterProfile(summary);
  if (!profile) {
    return {
      projectType: "unknown",
      runTargets: [],
      confidence: 0.35,
      evidence: []
    };
  }
  return {
    projectType: profile.projectType,
    adapterId: profile.id,
    projectFamily: profile.projectFamily,
    framework: profile.framework,
    language: profile.language,
    packageManager: profile.packageManager,
    buildSystem: profile.buildSystem,
    requiredTools: profile.requiredTools,
    installCommand: profile.commands.install,
    buildCommand: profile.commands.build,
    testCommand: profile.commands.test,
    checkCommand: profile.commands.check,
    lintCommand: profile.commands.lint,
    devCommand: profile.commands.dev,
    runCommand: profile.commands.run,
    packageCommand: profile.commands.package,
    entryPoint: profile.entryPoint,
    runTargets: profile.runTargets ?? [],
    confidence: profile.confidence,
    evidence: profile.evidence
  };
}

export function detectProjectAdapterProfile(summary: WorkspaceScanSummary): ProjectAdapterProfile | null {
  return UNIVERSAL_PROJECT_ADAPTERS
    .map((adapter) => adapter.detect(summary))
    .filter((profile): profile is ProjectAdapterProfile => Boolean(profile))
    .sort((left, right) => right.confidence - left.confidence)[0] ?? null;
}

export function detectUniversalRunCommands(summary: WorkspaceScanSummary): RunAppCommand[] {
  const profile = detectProjectAdapterProfile(summary);
  if (!profile) return [];
  const commands: RunAppCommand[] = [];
  const add = (id: string, label: string, commandLine: string | undefined, confidence: number, longRunning: boolean) => {
    const parsed = commandLine ? parseCommandLine(commandLine) : null;
    if (!parsed) return;
    commands.push({ id, label, command: parsed.command, args: parsed.args, confidence, longRunning });
  };
  const runLabel = profile.projectFamily === "cli" ? "Run" : profile.projectFamily === "desktop" ? "Run desktop app" : "Run app";
  add(`${profile.id}:dev`, runLabel, profile.commands.dev, 0.94, profile.projectFamily !== "cli");
  add(`${profile.id}:run`, runLabel, profile.commands.run, 0.88, profile.projectFamily === "api" || profile.projectFamily === "desktop");
  if (profile.projectFamily === "web") {
    add(`${profile.id}:preview`, "Preview app", scriptCommand(summary, ["preview"], profile.packageManager), 0.82, true);
  }
  return uniqueRunCommands(commands);
}

export async function detectUniversalEnvironment(root: string | null, summary: WorkspaceScanSummary | undefined, execFile: ExecFile = execFileCallback): Promise<UniversalEnvironmentReport> {
  const profile = summary ? detectProjectAdapterProfile(summary) : null;
  const tools = Object.fromEntries(await Promise.all(UNIVERSAL_TOOLS.map(async (tool) => [tool.id, await checkTool(tool, root, execFile)])));
  const relevantMissing = (profile?.requiredTools ?? []).filter((tool) => tools[toolId(tool)]?.status !== "ready");
  return {
    tools,
    relevantMissing,
    summary: relevantMissing.length ? `Missing ${relevantMissing.join(", ")} for ${profile?.framework ?? profile?.projectType ?? "this project"}.` : "Relevant project tools are available."
  };
}

export const UNIVERSAL_PROJECT_ADAPTERS: UniversalProjectAdapter[] = [
  nodeWebAdapter("nuxt", "nuxt", "Nuxt", "Vue", "Nuxt", 0.96, ["Nuxt dependency or config"]),
  nodeWebAdapter("astro", "astro", "Astro", "TypeScript", "Astro", 0.95, ["Astro dependency or config"]),
  nodeWebAdapter("sveltekit", "sveltekit", "SvelteKit", "TypeScript", "SvelteKit", 0.95, ["SvelteKit dependency or config"]),
  nodeWebAdapter("vue-vite", "vue-vite", "Vue + Vite", "TypeScript", "Vite", 0.93, ["Vue dependency", "Vite dependency or config"]),
  nodeWebAdapter("svelte-vite", "svelte-vite", "Svelte + Vite", "TypeScript", "Vite", 0.92, ["Svelte dependency", "Vite dependency or config"]),
  nodeWebAdapter("nextjs", "nextjs", "Next.js", "TypeScript", "Next.js", 0.95, ["Next.js dependency or config"]),
  nodeWebAdapter("vite", "vite", "React + Vite", "TypeScript", "Vite", 0.91, ["Vite dependency or config", "React dependency"], (summary) => hasFramework(summary, "Vite") && hasFramework(summary, "React")),
  nodeWebAdapter("react", "react", "React", "TypeScript", "React", 0.82, ["React dependency"], (summary) => hasFramework(summary, "React")),
  nodeWebAdapter("node", "node", "Node", "JavaScript", "node", 0.78, ["package.json"], (summary) => hasManifest(summary, "package.json")),
  {
    id: "fastapi",
    projectFamily: "api",
    framework: "FastAPI",
    language: "Python",
    buildSystem: "python",
    requiredTools: ["python", "pip"],
    detect: (summary) => pythonProfile(summary, "fastapi", "fastapi", "FastAPI", "api", 0.91, "python -m uvicorn main:app --reload", ["FastAPI import or dependency"])
  },
  {
    id: "flask",
    projectFamily: "api",
    framework: "Flask",
    language: "Python",
    buildSystem: "python",
    requiredTools: ["python", "pip"],
    detect: (summary) => pythonProfile(summary, "flask", "flask", "Flask", "api", 0.88, `python -m flask --app ${pythonModuleName(entryPoint(summary) ?? "app.py")} run`, ["Flask import or dependency"])
  },
  {
    id: "django",
    projectFamily: "api",
    framework: "Django",
    language: "Python",
    buildSystem: "python",
    requiredTools: ["python", "pip"],
    detect: (summary) => pythonProfile(summary, "django", "django", "Django", "api", 0.9, "python manage.py runserver", ["Django metadata"])
  },
  {
    id: "python",
    projectFamily: "cli",
    framework: "Python",
    language: "Python",
    buildSystem: "python",
    requiredTools: ["python", "pip"],
    detect: (summary) => pythonProfile(summary, "python", "python", "Python", "cli", 0.72, entryPoint(summary) ? `python ${entryPoint(summary)}` : undefined, ["Python project metadata"])
  },
  {
    id: "go",
    projectFamily: "api",
    framework: "Go",
    language: "Go",
    packageManager: "go",
    buildSystem: "go",
    requiredTools: ["go"],
    detect: (summary) => {
      if (!hasManifest(summary, "go.mod") && !hasLanguage(summary, "Go")) return null;
      return profile("go", "go", "api", "Go", "Go", "go", "go", ["go"], {
        install: hasManifest(summary, "go.mod") ? "go mod download" : undefined,
        build: "go build ./...",
        test: "go test ./...",
        lint: "go vet ./...",
        dev: "go run .",
        run: "go run .",
        package: packageName(summary) ? `go build -o ${packageName(summary)} .` : "go build ."
      }, entryPoint(summary) ?? "main.go", ["go.mod or Go sources"], 0.88);
    }
  },
  {
    id: "rust",
    projectFamily: "cli",
    framework: "Rust",
    language: "Rust",
    packageManager: "cargo",
    buildSystem: "cargo",
    requiredTools: ["rustc", "cargo"],
    detect: (summary) => {
      if (!hasManifest(summary, "Cargo.toml") && !hasLanguage(summary, "Rust")) return null;
      return profile("rust", "rust", "cli", "Rust", "Rust", "cargo", "cargo", ["rustc", "cargo"], {
        build: "cargo build",
        check: "cargo check",
        test: "cargo test",
        lint: "cargo clippy",
        dev: "cargo run",
        run: "cargo run",
        package: "cargo build --release"
      }, entryPoint(summary) ?? "src/main.rs", ["Cargo.toml or Rust sources"], 0.9);
    }
  },
  {
    id: "dotnet",
    projectFamily: "api",
    framework: "ASP.NET Core",
    language: "C#",
    packageManager: "dotnet",
    buildSystem: "dotnet",
    requiredTools: ["dotnet"],
    detect: (summary) => {
      if (!hasManifestExtension(summary, ".csproj") && !hasManifestExtension(summary, ".sln") && !hasEntry(summary, "Program.cs")) return null;
      const framework = hasFramework(summary, "ASP.NET Core") ? "ASP.NET Core" : hasEntry(summary, "Program.cs") ? ".NET Console" : ".NET";
      const family: UniversalProjectFamily = framework === ".NET Console" ? "cli" : "api";
      return profile("dotnet", "dotnet", family, framework, "C#", "dotnet", "dotnet", ["dotnet"], {
        install: "dotnet restore",
        build: "dotnet build",
        test: "dotnet test",
        dev: "dotnet run",
        run: "dotnet run",
        package: "dotnet publish"
      }, entryPoint(summary) ?? "Program.cs", [".NET project metadata"], 0.86);
    }
  },
  desktopAdapter("electron", "electron", "Electron", ["Electron dependency"]),
  desktopAdapter("tauri", "tauri", "Tauri", ["src-tauri or Tauri config"]),
  {
    id: "flutter",
    projectFamily: "mobile",
    framework: "Flutter",
    language: "Dart",
    packageManager: "flutter",
    buildSystem: "flutter",
    requiredTools: ["flutter", "dart"],
    detect: (summary) => {
      if (!hasManifest(summary, "pubspec.yaml") && !hasFramework(summary, "Flutter")) return null;
      return profile("flutter", "flutter", "mobile", "Flutter", "Dart", "flutter", "flutter", ["flutter", "dart"], {
        install: "flutter pub get",
        build: "flutter build apk",
        test: "flutter test",
        lint: "flutter analyze",
        dev: "flutter run",
        run: "flutter run",
        package: "flutter build apk"
      }, entryPoint(summary) ?? "lib/main.dart", ["pubspec.yaml"], 0.9, ["android-device", "android-emulator", "browser", ...(process.platform === "darwin" ? ["ios-simulator" as const] : [])]);
    }
  },
  {
    id: "expo",
    projectFamily: "mobile",
    framework: "Expo",
    language: "TypeScript",
    buildSystem: "npm",
    requiredTools: ["node"],
    detect: (summary) => {
      if (!hasFramework(summary, "Expo")) return null;
      const pm = nodePackageManager(summary);
      return profile("expo", "expo", "mobile", "Expo", "TypeScript", pm, "npm", ["node", pm], {
        install: installCommand(summary, pm),
        build: scriptCommand(summary, ["build"], pm),
        test: scriptCommand(summary, ["test"], pm),
        lint: scriptCommand(summary, ["lint"], pm),
        dev: scriptCommand(summary, ["start"], pm) ?? `${pmx(pm)} expo start`,
        run: scriptCommand(summary, ["android"], pm) ?? `${pmx(pm)} expo start --android`
      }, entryPoint(summary), ["Expo dependency"], 0.88, ["android-device", "android-emulator", "browser"]);
    }
  },
  {
    id: "react-native",
    projectFamily: "mobile",
    framework: "React Native",
    language: "TypeScript",
    buildSystem: "npm",
    requiredTools: ["node", "android sdk", "adb"],
    detect: (summary) => {
      if (!hasFramework(summary, "React Native")) return null;
      const pm = nodePackageManager(summary);
      return profile("react-native", "react-native", "mobile", "React Native", "TypeScript", pm, "npm", ["node", pm, "android sdk", "adb"], {
        install: installCommand(summary, pm),
        build: scriptCommand(summary, ["build"], pm),
        test: scriptCommand(summary, ["test"], pm),
        lint: scriptCommand(summary, ["lint"], pm),
        dev: scriptCommand(summary, ["android"], pm) ?? `${pmx(pm)} react-native run-android`,
        run: scriptCommand(summary, ["android"], pm) ?? `${pmx(pm)} react-native run-android`
      }, entryPoint(summary), ["React Native dependency"], 0.86, ["android-device", "android-emulator"]);
    }
  },
  {
    id: "ios",
    projectFamily: "mobile",
    framework: "iOS",
    language: "Swift",
    buildSystem: process.platform === "darwin" ? "xcodebuild" : "xcode-unavailable",
    requiredTools: process.platform === "darwin" ? ["swift", "xcodebuild"] : [],
    detect: (summary) => {
      if (!hasManifestExtension(summary, ".xcodeproj") && !hasManifestExtension(summary, ".xcworkspace") && !hasManifest(summary, "Package.swift") && !hasLanguage(summary, "Swift")) return null;
      const mac = process.platform === "darwin";
      return profile("ios", "ios", "mobile", mac ? "iOS" : "iOS source editing: available; Native iOS build: unavailable; Required host: macOS with Xcode", "Swift", undefined, mac ? "xcodebuild" : "xcode-unavailable", mac ? ["swift", "xcodebuild"] : [], {
        build: mac ? "xcodebuild build" : undefined,
        test: mac ? "xcodebuild test" : undefined,
        dev: mac ? "xcrun simctl launch" : undefined,
        run: mac ? "xcrun simctl launch" : undefined
      }, entryPoint(summary), ["iOS project metadata"], mac ? 0.84 : 0.8, mac ? ["ios-simulator"] : []);
    }
  }
];

function nodeWebAdapter(id: string, projectType: ProjectType, framework: string, language: string, buildSystem: string, confidence: number, evidence: string[], predicate?: (summary: WorkspaceScanSummary) => boolean): UniversalProjectAdapter {
  return {
    id,
    projectFamily: id === "node" ? "api" : "web",
    framework,
    language,
    buildSystem,
    requiredTools: ["node"],
    detect: (summary) => {
      const pm = nodePackageManager(summary);
      const match = predicate ? predicate(summary) : hasFramework(summary, framework.replace(" + Vite", ""));
      if (!match) return null;
      return profile(id, projectType, id === "node" ? "api" : "web", framework, language, pm, buildSystem, ["node", pm], {
        install: installCommand(summary, pm),
        build: scriptCommand(summary, ["build", "compile"], pm) ?? fallbackNodeBuild(framework, pm),
        test: scriptCommand(summary, ["test", "test:unit"], pm),
        lint: scriptCommand(summary, ["lint", "typecheck"], pm),
        dev: scriptCommand(summary, ["dev", "develop", "start", "serve"], pm) ?? fallbackNodeDev(framework, pm),
        run: scriptCommand(summary, ["start", "dev", "serve"], pm) ?? fallbackNodeDev(framework, pm),
        package: scriptCommand(summary, ["package", "dist", "make"], pm)
      }, entryPoint(summary), evidence, confidence, ["browser"]);
    }
  };
}

function desktopAdapter(id: string, projectType: ProjectType, framework: string, evidence: string[]): UniversalProjectAdapter {
  return {
    id,
    projectFamily: "desktop",
    framework,
    language: "TypeScript",
    buildSystem: id === "tauri" ? "tauri" : "npm",
    requiredTools: id === "tauri" ? ["node", "cargo", "rustc"] : ["node"],
    detect: (summary) => {
      if (!hasFramework(summary, framework)) return null;
      const pm = nodePackageManager(summary);
      const fallbackDev = id === "tauri" ? `${pmx(pm)} tauri dev` : `${pmx(pm)} electron .`;
      return profile(id, projectType, "desktop", framework, "TypeScript", pm, id === "tauri" ? "tauri" : "npm", id === "tauri" ? ["node", pm, "cargo", "rustc"] : ["node", pm], {
        install: installCommand(summary, pm),
        build: scriptCommand(summary, ["build"], pm),
        test: scriptCommand(summary, ["test"], pm),
        lint: scriptCommand(summary, ["lint"], pm),
        dev: scriptCommand(summary, ["dev", "electron:dev", "tauri", "start"], pm) ?? fallbackDev,
        run: scriptCommand(summary, ["start", "dev"], pm) ?? fallbackDev,
        package: scriptCommand(summary, ["package", "make", "dist", "tauri:build"], pm) ?? (id === "tauri" ? `${pmx(pm)} tauri build` : undefined)
      }, entryPoint(summary), evidence, id === "tauri" ? 0.97 : 0.88);
    }
  };
}

function pythonProfile(summary: WorkspaceScanSummary, id: string, projectType: ProjectType, framework: string, family: UniversalProjectFamily, confidence: number, run: string | undefined, evidence: string[]): ProjectAdapterProfile | null {
  if (id === "fastapi" && !hasFramework(summary, "FastAPI")) return null;
  if (id === "flask" && !hasFramework(summary, "Flask")) return null;
  if (id === "django" && !hasFramework(summary, "Django") && !hasManifest(summary, "manage.py")) return null;
  if (id === "python" && !hasLanguage(summary, "Python") && !hasAnyManifest(summary, ["pyproject.toml", "requirements.txt", "Pipfile", "poetry.lock", "uv.lock", "setup.py"])) return null;
  const pm = pythonPackageManager(summary);
  return profile(id, projectType, family, framework, "Python", pm, "python", pm === "poetry" ? ["python", "poetry"] : pm === "uv" ? ["python", "uv"] : ["python", "pip"], {
    install: pythonInstall(summary, pm),
    build: id === "django" ? "python manage.py check" : hasManifest(summary, "pyproject.toml") ? "python -m build" : undefined,
    test: pythonTest(summary, pm),
    lint: pythonLint(summary, pm),
    dev: run,
    run,
    package: hasManifest(summary, "pyproject.toml") ? "python -m build" : undefined
  }, entryPoint(summary), evidence, confidence);
}

function profile(id: string, projectType: ProjectType, projectFamily: UniversalProjectFamily, framework: string, language: string, packageManager: string | undefined, buildSystem: string | undefined, requiredTools: string[], commands: UniversalCommandProfile, entry: string | undefined, evidence: string[], confidence: number, runTargets?: UniversalRunTargetKind[]): ProjectAdapterProfile {
  return { id, projectType, projectFamily, framework, language, packageManager, buildSystem, requiredTools, commands, entryPoint: entry, evidence, confidence, runTargets };
}

function hasFramework(summary: WorkspaceScanSummary, framework: string): boolean {
  return summary.frameworks.some((item) => item.toLowerCase() === framework.toLowerCase());
}

function hasLanguage(summary: WorkspaceScanSummary, language: string): boolean {
  return summary.languages.some((item) => item.toLowerCase().includes(language.toLowerCase()));
}

function hasManifest(summary: WorkspaceScanSummary, manifest: string): boolean {
  return summary.manifestFiles.map(normalize).includes(normalize(manifest)) || summary.likelyEntryPoints.map(normalize).includes(normalize(manifest));
}

function hasAnyManifest(summary: WorkspaceScanSummary, manifests: string[]): boolean {
  return manifests.some((manifest) => hasManifest(summary, manifest));
}

function hasManifestExtension(summary: WorkspaceScanSummary, extension: string): boolean {
  return summary.manifestFiles.some((file) => normalize(file).endsWith(extension)) || summary.likelyEntryPoints.some((file) => normalize(file).endsWith(extension));
}

function hasEntry(summary: WorkspaceScanSummary, entry: string): boolean {
  return summary.likelyEntryPoints.map(normalize).includes(normalize(entry)) || summary.manifestFiles.map(normalize).includes(normalize(entry));
}

function entryPoint(summary: WorkspaceScanSummary): string | undefined {
  return summary.likelyEntryPoints[0]?.replace(/\\/g, "/");
}

function packageName(summary: WorkspaceScanSummary): string | undefined {
  return summary.projectName.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || undefined;
}

function nodePackageManager(summary: WorkspaceScanSummary): string {
  return ["npm", "pnpm", "yarn", "bun"].includes(summary.packageManager ?? "") ? summary.packageManager as string : "npm";
}

function pythonPackageManager(summary: WorkspaceScanSummary): string {
  if (hasManifest(summary, "poetry.lock")) return "poetry";
  if (hasManifest(summary, "uv.lock")) return "uv";
  if (hasManifest(summary, "Pipfile")) return "pipenv";
  return "pip";
}

function packageManagerExecutable(manager: string | undefined): string {
  if (manager === "pnpm") return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  if (manager === "yarn") return process.platform === "win32" ? "yarn.cmd" : "yarn";
  if (manager === "bun") return process.platform === "win32" ? "bun.exe" : "bun";
  if (manager === "poetry") return process.platform === "win32" ? "poetry.exe" : "poetry";
  if (manager === "uv") return process.platform === "win32" ? "uv.exe" : "uv";
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function packageManagerArgs(manager: string | undefined, script: string): string[] {
  if (manager === "yarn" && script !== "install") return [script];
  if (manager === "bun" && script !== "install") return ["run", script];
  return ["run", script];
}

function scriptCommand(summary: WorkspaceScanSummary, names: string[], manager: string | undefined): string | undefined {
  const script = names.find((name) => Boolean(summary.scripts[name]));
  if (!script) return undefined;
  return [packageManagerExecutable(manager), ...packageManagerArgs(manager, script)].join(" ");
}

function installCommand(summary: WorkspaceScanSummary, manager: string | undefined): string | undefined {
  if (!hasManifest(summary, "package.json")) return undefined;
  if (manager === "yarn") return `${packageManagerExecutable(manager)} install`;
  if (manager === "pnpm") return `${packageManagerExecutable(manager)} install`;
  if (manager === "bun") return `${packageManagerExecutable(manager)} install`;
  return `${packageManagerExecutable(manager)} install`;
}

function fallbackNodeBuild(framework: string, manager: string): string | undefined {
  if (!WEB_FRAMEWORKS.has(framework) && framework !== "React + Vite" && framework !== "Svelte + Vite" && framework !== "Vue + Vite") return undefined;
  if (framework.includes("Vite")) return `${pmx(manager)} vite build`;
  if (framework === "Next.js") return `${pmx(manager)} next build`;
  if (framework === "Nuxt") return `${pmx(manager)} nuxt build`;
  if (framework === "Astro") return `${pmx(manager)} astro build`;
  if (framework === "SvelteKit") return `${pmx(manager)} vite build`;
  return undefined;
}

function fallbackNodeDev(framework: string, manager: string): string | undefined {
  if (framework.includes("Vite") || framework === "SvelteKit") return `${pmx(manager)} vite --host 127.0.0.1`;
  if (framework === "Next.js") return `${pmx(manager)} next dev`;
  if (framework === "Nuxt") return `${pmx(manager)} nuxt dev`;
  if (framework === "Astro") return `${pmx(manager)} astro dev`;
  return undefined;
}

function pmx(manager: string): string {
  if (manager === "pnpm") return "pnpm exec";
  if (manager === "yarn") return "yarn";
  if (manager === "bun") return "bunx";
  return "npx";
}

function pythonInstall(summary: WorkspaceScanSummary, manager: string): string | undefined {
  if (manager === "poetry") return "poetry install";
  if (manager === "uv") return "uv sync";
  if (manager === "pipenv") return "pipenv install";
  if (hasManifest(summary, "requirements.txt")) return "python -m pip install -r requirements.txt";
  if (hasManifest(summary, "pyproject.toml") || hasManifest(summary, "setup.py")) return "python -m pip install -e .";
  return undefined;
}

function pythonTest(summary: WorkspaceScanSummary, manager: string): string | undefined {
  if (!summary.testDirectories.length && !summary.scripts.test) return undefined;
  if (manager === "poetry") return "poetry run pytest";
  if (manager === "uv") return "uv run pytest";
  return "python -m pytest";
}

function pythonLint(summary: WorkspaceScanSummary, manager: string): string | undefined {
  if (!hasManifest(summary, "pyproject.toml")) return undefined;
  if (manager === "poetry") return "poetry run ruff check .";
  if (manager === "uv") return "uv run ruff check .";
  return "python -m ruff check .";
}

function pythonModuleName(file: string): string {
  return file.replace(/\\/g, "/").replace(/\.py$/i, "").replace(/\//g, ".");
}

function parseCommandLine(commandLine: string): { command: string; args: string[] } | null {
  const parts = commandLine.match(/"[^"]+"|'[^']+'|\S+/g)?.map((part) => part.replace(/^["']|["']$/g, "")) ?? [];
  if (!parts.length) return null;
  return { command: parts[0], args: parts.slice(1) };
}

function uniqueRunCommands(commands: RunAppCommand[]): RunAppCommand[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const key = `${command.command} ${command.args.join(" ")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => right.confidence - left.confidence);
}

function normalize(value: string): string {
  return value.replace(/\\/g, "/");
}

const UNIVERSAL_TOOLS: Array<{ id: string; name: string; command: string; args: string[] }> = [
  { id: "node", name: "Node", command: process.platform === "win32" ? "node.exe" : "node", args: ["--version"] },
  { id: "npm", name: "npm", command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["--version"] },
  { id: "pnpm", name: "pnpm", command: process.platform === "win32" ? "pnpm.cmd" : "pnpm", args: ["--version"] },
  { id: "yarn", name: "Yarn", command: process.platform === "win32" ? "yarn.cmd" : "yarn", args: ["--version"] },
  { id: "python", name: "Python", command: process.platform === "win32" ? "python.exe" : "python", args: ["--version"] },
  { id: "pip", name: "pip", command: process.platform === "win32" ? "python.exe" : "python", args: ["-m", "pip", "--version"] },
  { id: "poetry", name: "Poetry", command: process.platform === "win32" ? "poetry.exe" : "poetry", args: ["--version"] },
  { id: "uv", name: "uv", command: process.platform === "win32" ? "uv.exe" : "uv", args: ["--version"] },
  { id: "java", name: "Java", command: process.platform === "win32" ? "java.exe" : "java", args: ["-version"] },
  { id: "android sdk", name: "Android SDK", command: process.platform === "win32" ? "adb.exe" : "adb", args: ["version"] },
  { id: "adb", name: "ADB", command: process.platform === "win32" ? "adb.exe" : "adb", args: ["version"] },
  { id: "flutter", name: "Flutter", command: process.platform === "win32" ? "flutter.bat" : "flutter", args: ["--version"] },
  { id: "dart", name: "Dart", command: process.platform === "win32" ? "dart.exe" : "dart", args: ["--version"] },
  { id: "go", name: "Go", command: process.platform === "win32" ? "go.exe" : "go", args: ["version"] },
  { id: "rustc", name: "Rust", command: process.platform === "win32" ? "rustc.exe" : "rustc", args: ["--version"] },
  { id: "cargo", name: "Cargo", command: process.platform === "win32" ? "cargo.exe" : "cargo", args: ["--version"] },
  { id: "dotnet", name: ".NET", command: process.platform === "win32" ? "dotnet.exe" : "dotnet", args: ["--info"] },
  { id: "git", name: "Git", command: process.platform === "win32" ? "git.exe" : "git", args: ["--version"] },
  { id: "docker", name: "Docker", command: process.platform === "win32" ? "docker.exe" : "docker", args: ["--version"] },
  { id: "swift", name: "Swift", command: process.platform === "win32" ? "swift.exe" : "swift", args: ["--version"] },
  { id: "xcodebuild", name: "Xcode", command: "xcodebuild", args: ["-version"] }
];

async function checkTool(tool: { id: string; name: string; command: string; args: string[] }, cwd: string | null, execFile: ExecFile): Promise<UniversalToolState> {
  const command = resolveKnownToolCommand(tool.id, tool.command);
  return new Promise((resolve) => {
    try {
      execFile(command, tool.args, { cwd: cwd ?? undefined, timeout: 5_000, windowsHide: true, maxBuffer: 16_000 }, (error, stdout, stderr) => {
        const output = `${stdout.toString()}\n${stderr.toString()}`.trim();
        if (error) {
          resolve({ ...tool, status: "missing", message: output || error.message });
        } else {
          resolve({ ...tool, command, status: "ready", version: output.split(/\r?\n/)[0]?.trim() });
        }
      });
    } catch (error) {
      resolve({ ...tool, status: "missing", message: error instanceof Error ? error.message : "Tool could not be launched." });
    }
  });
}

function resolveKnownToolCommand(id: string, command: string): string {
  if (process.platform !== "win32") return command;
  const candidates: Record<string, string[]> = {
    go: ["C:\\Program Files\\Go\\bin\\go.exe"],
    rustc: [path.join(process.env.USERPROFILE ?? "", ".cargo", "bin", "rustc.exe")],
    cargo: [path.join(process.env.USERPROFILE ?? "", ".cargo", "bin", "cargo.exe")]
  };
  return candidates[id]?.find((candidate) => candidate && fs.existsSync(candidate)) ?? command;
}

function toolId(tool: string): string {
  return tool.toLowerCase();
}
