import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

const repoRoot = path.resolve(__dirname, "../../..");
const desktopRoot = path.join(repoRoot, "packages/levi-desktop");

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(desktopRoot, relativePath), "utf8");
}

function desktopPackageJson(): {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
  build: {
    artifactName?: string;
    npmRebuild?: boolean;
    asarUnpack?: string[];
    directories?: { output?: string };
    win?: {
      target?: Array<{ target?: string; arch?: string[] }> | string;
      signtoolOptions?: Record<string, unknown>;
      certificateFile?: string;
      certificatePassword?: string;
      cscLink?: string;
      cscKeyPassword?: string;
    };
    nsis?: Record<string, unknown>;
  };
} {
  return JSON.parse(readText("package.json"));
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
    const packageJson = desktopPackageJson();

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
});
