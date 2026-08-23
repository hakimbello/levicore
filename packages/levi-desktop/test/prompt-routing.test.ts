import { describe, expect, it } from "vitest";
import { classifyPromptIntent, isPlanningPrompt, isSingleFileEditPrompt } from "../src/shared/prompt-routing";

describe("prompt routing", () => {
  it.each([
    ["build me a fitness app", "build"],
    ["create a website", "build"],
    ["implement auth", "build"],
    ["make a plan for auth", "plan"],
    ["how should I implement auth", "plan"],
    ["what is auth", "question"],
    ["change title in index.html", "edit"]
  ] as const)("routes %s to %s", (prompt, intent) => {
    expect(classifyPromptIntent(prompt)).toBe(intent);
  });

  it("routes multi-file rename requests to planning", () => {
    const prompt = "Rename the server timeout configuration and update all affected files.";
    expect(classifyPromptIntent(prompt)).toBe("plan");
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

  it("does not route destructive shell requests to build or edit", () => {
    expect(classifyPromptIntent("Delete everything on my C drive.")).toBe("question");
    expect(classifyPromptIntent("Run powershell -Command Remove-Item C:\\ -Recurse")).toBe("question");
  });
});
