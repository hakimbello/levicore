import { describe, expect, it } from "vitest";
import { createSearchMatcher, searchFileContent } from "./search-engine";

describe("createSearchMatcher", () => {
  it("escapes plain-text queries", () => {
    const matcher = createSearchMatcher("a+b", { matchCase: false, wholeWord: false, regex: false });
    expect(matcher.test("A+B")).toBe(true);
    expect(matcher.test("aaab")).toBe(false);
  });

  it("supports case-sensitive matching", () => {
    const matcher = createSearchMatcher("Levi", { matchCase: true, wholeWord: false, regex: false });
    expect(matcher.test("Levi")).toBe(true);
    matcher.lastIndex = 0;
    expect(matcher.test("levi")).toBe(false);
  });

  it("supports whole-word matching", () => {
    const matcher = createSearchMatcher("cat", { matchCase: false, wholeWord: true, regex: false });
    expect(matcher.test("cat catalog")).toBe(true);
    matcher.lastIndex = 0;
    expect(matcher.test("catalog")).toBe(false);
  });

  it("supports regular expressions", () => {
    const matcher = createSearchMatcher("foo\\d+", { matchCase: false, wholeWord: false, regex: true });
    expect(matcher.test("FOO123")).toBe(true);
  });

  it("throws for invalid regular expressions", () => {
    expect(() => createSearchMatcher("(", { matchCase: false, wholeWord: false, regex: true })).toThrow();
  });
});

describe("searchFileContent", () => {
  it("returns one-based positions and match lengths", () => {
    const matcher = createSearchMatcher("Levi", { matchCase: false, wholeWord: false, regex: false });
    const matches = searchFileContent("first line\n  Levi builds Levi", matcher, 10);

    expect(matches).toEqual([
      { lineNumber: 2, columnStart: 3, matchLength: 4, preview: "Levi builds Levi" },
      { lineNumber: 2, columnStart: 15, matchLength: 4, preview: "Levi builds Levi" }
    ]);
  });

  it("reports the complete regular-expression match length", () => {
    const matcher = createSearchMatcher("foo\\d+", { matchCase: false, wholeWord: false, regex: true });
    expect(searchFileContent("foo123", matcher, 10)[0]?.matchLength).toBe(6);
  });

  it("respects the remaining result limit", () => {
    const matcher = createSearchMatcher("x", { matchCase: false, wholeWord: false, regex: false });
    expect(searchFileContent("x x x", matcher, 2)).toHaveLength(2);
    expect(searchFileContent("x", matcher, 0)).toEqual([]);
  });

  it("handles CRLF content", () => {
    const matcher = createSearchMatcher("target", { matchCase: false, wholeWord: false, regex: false });
    expect(searchFileContent("one\r\ntarget", matcher, 10)[0]?.lineNumber).toBe(2);
  });

  it("terminates for zero-length regular-expression matches", () => {
    const matcher = createSearchMatcher("(?=a)", { matchCase: false, wholeWord: false, regex: true });
    const matches = searchFileContent("aaa", matcher, 10);
    expect(matches).toHaveLength(3);
    expect(matches.every((match) => match.matchLength === 1)).toBe(true);
  });

  it("truncates previews to 240 characters", () => {
    const longLine = `needle ${"x".repeat(300)}`;
    const matcher = createSearchMatcher("needle", { matchCase: false, wholeWord: false, regex: false });
    expect(searchFileContent(longLine, matcher, 10)[0]?.preview).toHaveLength(240);
  });
});
