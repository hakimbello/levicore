import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(__dirname, "..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(packageRoot, relativePath), "utf8");
}

describe("ExecutionReviewPanel live regression guards", () => {
  it("does not treat step-applied mid-transaction as final aggregate review", () => {
    const source = readSource("src/features/home/ExecutionReviewPanel.tsx");
    expect(source).toMatch(/const allStepsComplete = transaction\.status === "completed"/);
    expect(source).not.toMatch(/transaction\.status === "completed" \|\| transaction\.status === "step-applied"/);
  });

  it("offers keep and rollback when a cancelled transaction has applied steps", () => {
    const source = readSource("src/features/home/ExecutionReviewPanel.tsx");
    expect(source).toMatch(/stoppedWithApplied/);
    expect(source).toMatch(/transaction\.status === "cancelled"/);
  });
});
