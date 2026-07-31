import type { DebugEvaluationCacheEntry, DebugEvaluateResult } from "./DebugEvents";
import { MAX_EVALUATION_CACHE_SIZE } from "./variableLimits";

export class EvaluationCache {
  private entries: DebugEvaluationCacheEntry[] = [];

  makeKey(expression: string, context: string, frameId?: number): string {
    return `${context}:${frameId ?? "active"}:${expression}`;
  }

  get(key: string): DebugEvaluateResult | undefined {
    const entry = this.entries.find((item) => item.key === key);
    return entry?.result;
  }

  set(key: string, expression: string, context: "repl" | "watch" | "hover", frameId: number | undefined, result: DebugEvaluateResult): void {
    this.entries = [
      {
        key,
        expression,
        context,
        frameId,
        result: { ...result, cached: false },
        timestamp: new Date().toISOString()
      },
      ...this.entries.filter((item) => item.key !== key)
    ].slice(0, MAX_EVALUATION_CACHE_SIZE);
  }

  list(): DebugEvaluationCacheEntry[] {
    return this.entries.map((entry) => ({
      ...entry,
      result: { ...entry.result, cached: true }
    }));
  }

  clear(): void {
    this.entries = [];
  }
}
