import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const repoRoot = path.resolve(__dirname, "../../..");
const desktopRoot = path.join(repoRoot, "packages/levi-desktop");

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(desktopRoot, relativePath), "utf8");
}

function desktopPackageJson(): {
  author?: string;
  bugs?: { url?: string };
  description?: string;
  homepage?: string;
  license?: string;
  repository?: { type?: string; url?: string };
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  build: {
    artifactName?: string;
    copyright?: string;
    npmRebuild?: boolean;
    asarUnpack?: string[];
    directories?: { output?: string };
    win?: {
      icon?: string;
      target?: Array<{ target?: string; arch?: string[] }> | string;
      signtoolOptions?: Record<string, unknown>;
      certificateFile?: string;
      certificatePassword?: string;
      cscLink?: string;
      cscKeyPassword?: string;
    };
    nsis?: Record<string, unknown>;
    publish?: unknown;
  };
} {
  return JSON.parse(readText("package.json"));
}

function isIgnored(relativeFromRepoRoot: string): boolean {
  const normalizedPath = relativeFromRepoRoot.replace(/\\/g, "/");

  try {
    execFileSync("git", ["-c", `safe.directory=${repoRoot}`, "check-ignore", "-v", "--", normalizedPath], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 1) {
      return false;
    }

    throw error;
  }
}

describe("Levi desktop package hygiene", () => {
  it("ignores generated desktop directories", () => {
    for (const entry of [
      "packages/levi-desktop/node_modules/",
      "packages/levi-desktop/dist/",
      "packages/levi-desktop/dist-electron/",
      "packages/levi-desktop/node_modules/.vite/",
      "packages/levi-desktop/.vite/",
      "packages/levi-desktop/coverage/"
    ]) {
      expect(isIgnored(entry)).toBe(true);
    }
  });

  it("does not ignore required desktop source files", () => {
    for (const entry of [
      "packages/levi-desktop/package.json",
      "packages/levi-desktop/src/app/App.tsx",
      "packages/levi-desktop/electron/main/index.ts",
      "packages/levi-desktop/index.html",
      "packages/levi-desktop/assets/levi.ico",
      "packages/levi-desktop/assets/levi.png",
      "packages/levi-desktop/assets/BRANDING.md",
      "packages/levi-desktop/vite.config.mjs",
      "packages/levi-desktop/README.md"
    ]) {
      expect(isIgnored(entry)).toBe(false);
    }
  });

  it("keeps local env files ignored at the repository root", () => {
    expect(isIgnored(".env")).toBe(true);
    expect(isIgnored("packages/levi-desktop/.env.local")).toBe(true);
  });

  it("documents generated directories in desktop README", () => {
    const readme = readText("README.md");
    expect(readme).toMatch(/dist\//);
    expect(readme).toMatch(/dist-electron\//);
    expect(readme).toMatch(/node_modules\//);
  });

  it("includes public release metadata for packaged builds", () => {
    const packageJson = desktopPackageJson();

    expect(packageJson.description).toBe("Standalone Levi desktop shell.");
    expect(packageJson.author).toBe("Hakim Bello");
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.homepage).toBe("https://github.com/hakimbello/levicore#readme");
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "https://github.com/hakimbello/levicore.git"
    });
    expect(packageJson.bugs).toEqual({
      url: "https://github.com/hakimbello/levicore/issues"
    });
  });

  it("packages production Windows installers instead of only unpacked directories", () => {
    const packageJson = desktopPackageJson();

    expect(packageJson.devDependencies.electron).toBe("37.10.3");
    expect(packageJson.scripts.package).toBe("npm run build && electron-builder --win nsis");
    expect(packageJson.scripts["package:dir"]).toBe("npm run build && electron-builder --win dir");
    expect(packageJson.build.npmRebuild).toBe(false);
    expect(packageJson.build.asarUnpack).toEqual(["node_modules/node-pty/prebuilds/**"]);
    expect(packageJson.build.directories?.output).toBe("release");
    expect(packageJson.build.artifactName).toBe("${productName}-${version}-${os}-${arch}.${ext}");
    expect(packageJson.build.win?.icon).toBe("assets/levi.ico");
    expect(fs.statSync(path.join(desktopRoot, "assets/levi.ico")).size).toBeGreaterThan(0);
    expect(fs.statSync(path.join(desktopRoot, "assets/levi.png")).size).toBeGreaterThan(0);
    expect(readText("assets/BRANDING.md")).toMatch(/created specifically for the Levi project/i);
    expect(packageJson.build.copyright).toBe("Copyright © 2026 Hakim Bello");
    expect(packageJson.build.win?.target).toEqual([{ target: "nsis", arch: ["x64"] }]);
    expect(packageJson.build.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true
    });
  });

  it("keeps unsigned local packaging separate from signing-required packaging", () => {
    const packageJson = desktopPackageJson();

    expect(packageJson.scripts.package).toBe("npm run build && electron-builder --win nsis");
    expect(packageJson.scripts.package).not.toContain("forceCodeSigning");
    expect(packageJson.scripts.package).not.toContain("validate-signing-env");
    expect(packageJson.scripts["package:signed"]).toBe(
      "node scripts/validate-signing-env.mjs --required && npm run build && electron-builder --win nsis -c.forceCodeSigning=true"
    );
  });

  it("uses environment-based Windows signing credentials without committed certificate configuration", () => {
    const packageJson = desktopPackageJson();
    const readme = readText("README.md");
    const signingScript = readText("scripts/validate-signing-env.mjs");

    expect(packageJson.build.win?.signtoolOptions).toBeUndefined();
    expect(packageJson.build.win?.certificateFile).toBeUndefined();
    expect(packageJson.build.win?.certificatePassword).toBeUndefined();
    expect(packageJson.build.win?.cscLink).toBeUndefined();
    expect(packageJson.build.win?.cscKeyPassword).toBeUndefined();
    for (const forbidden of ["certificatePassword", "WIN_CSC_LINK=", "CSC_LINK=", "WIN_CSC_KEY_PASSWORD=", "CSC_KEY_PASSWORD="]) {
      expect(JSON.stringify(packageJson)).not.toContain(forbidden);
    }
    for (const variable of ["WIN_CSC_LINK", "CSC_LINK", "WIN_CSC_KEY_PASSWORD", "CSC_KEY_PASSWORD"]) {
      expect(readme).toContain(variable);
      expect(signingScript).toContain(variable);
    }
  });

  it("fails safely when explicit signing is requested without credential environment", () => {
    const env = { ...process.env };
    delete env.WIN_CSC_LINK;
    delete env.CSC_LINK;
    delete env.WIN_CSC_KEY_PASSWORD;
    delete env.CSC_KEY_PASSWORD;
    const result = spawnSync(process.execPath, [path.join(desktopRoot, "scripts/validate-signing-env.mjs"), "--required"], {
      cwd: desktopRoot,
      env,
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Windows code signing was explicitly requested");
    expect(result.stderr).toContain("WIN_CSC_LINK or CSC_LINK");
    expect(result.stderr).toContain("WIN_CSC_KEY_PASSWORD or CSC_KEY_PASSWORD");
  });

  it("configures GitHub draft publishing without committing credentials", () => {
    const packageJson = desktopPackageJson();
    const readme = readText("README.md");

    expect(packageJson.dependencies["electron-updater"]).toMatch(/^\^6\./);
    expect(packageJson.scripts["package:publish"]).toBe("npm run build && electron-builder --win nsis --publish always");
    expect(packageJson.build.publish).toEqual([
      {
        provider: "github",
        owner: "hakimbello",
        repo: "levicore",
        releaseType: "draft"
      }
    ]);
    expect(JSON.stringify(packageJson)).not.toContain("GH_TOKEN=");
    expect(JSON.stringify(packageJson)).not.toContain("GITHUB_TOKEN=");
    expect(readme).toContain("Auto-update is implemented");
    expect(readme).toContain("npm run package:publish --workspace levi-desktop");
    expect(readme).toContain("GH_TOKEN");
    expect(readme).toContain("GITHUB_TOKEN");
    expect(readme).toContain("Live update verification remains blocked until a draft release is published");
  });
});
