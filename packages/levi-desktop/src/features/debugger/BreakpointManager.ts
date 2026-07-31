import type { DebugBreakpoint, DebugSetBreakpointRequest } from "./DebugEvents";

function now(): string {
  return new Date().toISOString();
}

function makeBreakpointId(relativePath: string, line: number, column?: number): string {
  return `${relativePath}:${line}:${column ?? 1}`;
}

export class BreakpointManager {
  private readonly breakpoints = new Map<string, DebugBreakpoint>();

  constructor(initialBreakpoints: DebugBreakpoint[] = []) {
    this.replaceAll(initialBreakpoints);
  }

  list(): DebugBreakpoint[] {
    return Array.from(this.breakpoints.values()).sort((left, right) => {
      if (left.relativePath !== right.relativePath) {
        return left.relativePath.localeCompare(right.relativePath);
      }
      return left.line - right.line;
    });
  }

  replaceAll(nextBreakpoints: DebugBreakpoint[]): void {
    this.breakpoints.clear();
    for (const breakpoint of nextBreakpoints) {
      this.breakpoints.set(breakpoint.id, {
        ...breakpoint,
        enabled: breakpoint.enabled !== false
      });
    }
  }

  set(request: DebugSetBreakpointRequest): DebugBreakpoint {
    const id = makeBreakpointId(request.relativePath, request.line, request.column);
    const existing = this.breakpoints.get(id);
    const timestamp = now();
    const breakpoint: DebugBreakpoint = {
      id,
      relativePath: request.relativePath,
      line: request.line,
      column: request.column,
      enabled: request.enabled ?? existing?.enabled ?? true,
      condition: request.condition,
      logMessage: request.logMessage,
      hitCondition: request.hitCondition,
      verified: existing?.verified,
      message: existing?.message,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };
    this.breakpoints.set(id, breakpoint);
    return breakpoint;
  }

  toggle(request: DebugSetBreakpointRequest): DebugBreakpoint | null {
    const id = makeBreakpointId(request.relativePath, request.line, request.column);
    if (this.breakpoints.has(id)) {
      this.breakpoints.delete(id);
      return null;
    }
    return this.set(request);
  }

  removeById(breakpointId: string): boolean {
    return this.breakpoints.delete(breakpointId);
  }

  removeAt(relativePath: string, line: number): boolean {
    const breakpoint = this.list().find((item) => item.relativePath === relativePath && item.line === line);
    return breakpoint ? this.removeById(breakpoint.id) : false;
  }

  setEnabled(breakpointId: string, enabled: boolean): DebugBreakpoint | null {
    const breakpoint = this.breakpoints.get(breakpointId);
    if (!breakpoint) return null;
    const updated = { ...breakpoint, enabled, updatedAt: now() };
    this.breakpoints.set(breakpointId, updated);
    return updated;
  }

  updateVerification(relativePath: string, lines: Array<{ line: number; verified?: boolean; message?: string }>): void {
    for (const line of lines) {
      const breakpoint = this.list().find((item) => item.relativePath === relativePath && item.line === line.line);
      if (!breakpoint) continue;
      this.breakpoints.set(breakpoint.id, {
        ...breakpoint,
        line: line.line,
        verified: line.verified,
        message: line.message,
        updatedAt: now()
      });
    }
  }

  updateAdapterBreakpoint(match: {
    relativePath?: string;
    line?: number;
    verified?: boolean;
    message?: string;
  }): void {
    if (!match.relativePath || typeof match.line !== "number") return;
    const breakpoint = this.list().find((item) => item.relativePath === match.relativePath);
    if (!breakpoint) return;
    const updated = {
      ...breakpoint,
      id: makeBreakpointId(match.relativePath, match.line, breakpoint.column),
      line: match.line,
      verified: match.verified,
      message: match.message,
      updatedAt: now()
    };
    this.breakpoints.delete(breakpoint.id);
    this.breakpoints.set(updated.id, updated);
  }
}
