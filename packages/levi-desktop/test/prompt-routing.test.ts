import { describe, expect, it } from "vitest";
import { isPlanningPrompt, isSingleFileEditPrompt } from "../src/shared/prompt-routing";

describe("prompt routing", () => {
  it("routes multi-file rename requests to planning", () => {
    const prompt = "Rename the server timeout configuration and update all affected files.";
    expect(isPlanningPrompt(prompt)).toBe(true);
    expect(isSingleFileEditPrompt(prompt)).toBe(false);
  });

  it("routes single-file edit requests with explicit paths to edit", () => {
    const prompt = "Update src/config.ts to use a new timeout constant.";
    expect(isPlanningPrompt(prompt)).toBe(false);
    expect(isSingleFileEditPrompt(prompt)).toBe(true);
  });

  it("does not route incidental planning keywords inside edit prompts to planning", () => {
    const prompt = "Change Home heading to Build something remarkable.";
    expect(isPlanningPrompt(prompt)).toBe(false);
    expect(isSingleFileEditPrompt(prompt)).toBe(true);
  });
});
