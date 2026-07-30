import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = path.resolve(__dirname, "../../..");
const desktopRoot = path.join(repoRoot, "packages/levi-desktop");

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(desktopRoot, relativePath), "utf8");
}

function isIgnored(relativeFromRepoRoot: string): boolean {
  try {
    execSync(`git check-ignore -v "${relativeFromRepoRoot.replace(/\\/g, "/")}"`, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return true;
  } catch {
    return false;
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

  it("packages production Windows installers instead of only unpacked directories", () => {
    const packageJson = JSON.parse(readText("package.json")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
      build: {
        artifactName?: string;
        npmRebuild?: boolean;
        asarUnpack?: string[];
        directories?: { output?: string };
        win?: { target?: Array<{ target?: string; arch?: string[] }> | string };
        nsis?: Record<string, unknown>;
      };
    };

    expect(packageJson.devDependencies.electron).toBe("37.10.3");
    expect(packageJson.scripts.package).toBe("npm run build && electron-builder --win nsis");
    expect(packageJson.scripts["package:dir"]).toBe("npm run build && electron-builder --win dir");
    expect(packageJson.build.npmRebuild).toBe(false);
    expect(packageJson.build.asarUnpack).toEqual(["node_modules/node-pty/prebuilds/**"]);
    expect(packageJson.build.directories?.output).toBe("release");
    expect(packageJson.build.artifactName).toBe("${productName}-${version}-${os}-${arch}.${ext}");
    expect(packageJson.build.win?.target).toEqual([{ target: "nsis", arch: ["x64"] }]);
    expect(packageJson.build.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true
    });
  });
});
