import { describe, expect, it } from "vitest";
import { globToRegExp, patternMatches } from "./search-patterns";

describe("globToRegExp", () => {
  it("matches root and nested files for a globstar directory pattern", () => {
    const matcher = globToRegExp("**/*.ts");

    expect(matcher.test("index.ts")).toBe(true);
    expect(matcher.test("src/index.ts")).toBe(true);
    expect(matcher.test("src/features/search/index.ts")).toBe(true);
    expect(matcher.test("src/index.tsx")).toBe(false);
  });

  it("keeps a single star inside one path segment", () => {
    const matcher = globToRegExp("src/*.ts");

    expect(matcher.test("src/index.ts")).toBe(true);
    expect(matcher.test("src/features/index.ts")).toBe(false);
  });

  it("supports question-mark wildcards", () => {
    const matcher = globToRegExp("src/file?.ts");

    expect(matcher.test("src/file1.ts")).toBe(true);
    expect(matcher.test("src/file10.ts")).toBe(false);
  });

  it("treats regex metacharacters as literals", () => {
    const matcher = globToRegExp("src/[draft](1).ts");

    expect(matcher.test("src/[draft](1).ts")).toBe(true);
    expect(matcher.test("src/draft1.ts")).toBe(false);
  });

  it("normalizes Windows path separators", () => {
    expect(globToRegExp("src/**/*.ts").test("src/features/index.ts")).toBe(true);
    expect(patternMatches("src\\features\\index.ts", "src/**/*.ts")).toBe(true);
  });
});

describe("patternMatches", () => {
  it("matches any comma-separated include pattern", () => {
    const patterns = "src/**/*.ts, tests/**/*.tsx";

    expect(patternMatches("src/index.ts", patterns)).toBe(true);
    expect(patternMatches("tests/App.test.tsx", patterns)).toBe(true);
    expect(patternMatches("README.md", patterns)).toBe(false);
  });

  it("returns true when no pattern is supplied", () => {
    expect(patternMatches("src/index.ts", "  ")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(patternMatches("SRC/INDEX.TS", "src/**/*.ts")).toBe(true);
  });
});
