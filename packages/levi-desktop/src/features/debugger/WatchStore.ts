import { randomId } from "./ids";
import type { DebugWatchExpression } from "./DebugEvents";

function now(): string {
  return new Date().toISOString();
}

export class WatchStore {
  private readonly expressions = new Map<string, DebugWatchExpression>();

  constructor(initialExpressions: DebugWatchExpression[] = []) {
    this.replaceAll(initialExpressions);
  }

  list(): DebugWatchExpression[] {
    return Array.from(this.expressions.values());
  }

  replaceAll(expressions: DebugWatchExpression[]): void {
    this.expressions.clear();
    for (const expression of expressions) {
      this.expressions.set(expression.id, {
        ...expression,
        enabled: expression.enabled !== false
      });
    }
  }

  add(expression: string): DebugWatchExpression {
    const timestamp = now();
    const watch: DebugWatchExpression = {
      id: randomId("watch"),
      expression,
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.expressions.set(watch.id, watch);
    return watch;
  }

  remove(id: string): boolean {
    return this.expressions.delete(id);
  }

  setEnabled(id: string, enabled: boolean): DebugWatchExpression | null {
    const watch = this.expressions.get(id);
    if (!watch) return null;
    const updated = { ...watch, enabled, updatedAt: now() };
    this.expressions.set(id, updated);
    return updated;
  }

  setValue(id: string, value: string | undefined, error?: string): DebugWatchExpression | null {
    const watch = this.expressions.get(id);
    if (!watch) return null;
    const updated = { ...watch, value, error, updatedAt: now() };
    this.expressions.set(id, updated);
    return updated;
  }

  updateExpression(id: string, expression: string): DebugWatchExpression | null {
    const watch = this.expressions.get(id);
    if (!watch) return null;
    const updated = { ...watch, expression, value: undefined, error: undefined, updatedAt: now() };
    this.expressions.set(id, updated);
    return updated;
  }

  clearValues(): void {
    for (const [id, watch] of this.expressions) {
      this.expressions.set(id, { ...watch, value: undefined, error: undefined, updatedAt: now() });
    }
  }
}
