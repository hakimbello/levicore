import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeWindowsEnvironment,
  resolveDeveloperToolFromEnvironment
} from "../electron/main/developer-environment";

describe("developer environment discovery", () => {
  it("merges machine, user, and process PATH entries without dropping process-specific paths", () => {
    const env = mergeWindowsEnvironment(
      {
        USERPROFILE: "C:\\Users\\tester",
        Path: ["C:\\Process\\bin", "C:\\Program Files\\Go\\bin"].join(path.delimiter),
        GOPATH: "%USERPROFILE%\\go",
        LEVI_PROCESS_ONLY: "1"
      },
      {
        Path: ["%USERPROFILE%\\.cargo\\bin", "C:\\Tools\\bin"].join(path.delimiter)
      },
      {
        Path: ["C:\\Program Files\\Go\\bin", "C:\\Windows\\System32"].join(path.delimiter),
        JAVA_HOME: "C:\\Program Files\\Android\\Android Studio\\jbr"
      }
    );

    const entries = (env.Path ?? "").split(path.delimiter);
    expect(entries).toContain("C:\\Program Files\\Go\\bin");
    expect(entries).toContain("C:\\Users\\tester\\.cargo\\bin");
    expect(entries).toContain("C:\\Process\\bin");
    expect(entries.filter((entry) => entry.toLowerCase() === "c:\\program files\\go\\bin")).toHaveLength(1);
    expect(env.LEVI_PROCESS_ONLY).toBe("1");
    expect(env.JAVA_HOME).toBe("C:\\Program Files\\Android\\Android Studio\\jbr");
    expect(env.GOPATH).toBe("C:\\Users\\tester\\go");
  });

  it("resolves known toolchain executables from PATH before fallback locations", () => {
    const env = mergeWindowsEnvironment(
      {
        USERPROFILE: "C:\\Users\\tester",
        Path: "C:\\Tools\\Go\\bin"
      },
      {},
      {}
    );
    const resolution = resolveDeveloperToolFromEnvironment("go", "go.exe", env, (candidate) => candidate === "C:\\Tools\\Go\\bin\\go.exe");

    expect(resolution.resolvedPath).toBe("C:\\Tools\\Go\\bin\\go.exe");
    expect(resolution.pathSearched).toContain("C:\\Tools\\Go\\bin");
    expect(resolution.fallbackLocationsChecked).toContain("C:\\Program Files\\Go\\bin");
  });

  it("falls back to Windows user tool locations when PATH is stale", () => {
    const env = mergeWindowsEnvironment(
      {
        USERPROFILE: "C:\\Users\\tester",
        Path: "C:\\Windows\\System32"
      },
      {},
      {}
    );
    const cargo = resolveDeveloperToolFromEnvironment(
      "cargo",
      "cargo.exe",
      env,
      (candidate) => candidate === "C:\\Users\\tester\\.cargo\\bin\\cargo.exe"
    );

    expect(cargo.resolvedPath).toBe("C:\\Users\\tester\\.cargo\\bin\\cargo.exe");
    expect(cargo.fallbackLocationsChecked).toContain("C:\\Users\\tester\\.cargo\\bin");
  });
});
