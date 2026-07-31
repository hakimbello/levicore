import type { DebugStackFrame, DebugThread } from "./DebugEvents";

export class CallStackStore {
  private readonly threads = new Map<number, DebugThread>();

  list(): DebugThread[] {
    return Array.from(this.threads.values()).map((thread) => ({
      ...thread,
      frames: thread.frames.map((frame) => ({ ...frame }))
    }));
  }

  replaceThreads(threads: DebugThread[]): void {
    this.threads.clear();
    for (const thread of threads) {
      this.threads.set(thread.id, {
        ...thread,
        frames: thread.frames.map((frame) => ({ ...frame }))
      });
    }
  }

  setFrames(threadId: number, frames: DebugStackFrame[], stopped = true): void {
    const thread = this.threads.get(threadId) ?? { id: threadId, name: `Thread ${threadId}`, frames: [] };
    this.threads.set(threadId, {
      ...thread,
      stopped,
      frames: frames.map((frame) => ({ ...frame }))
    });
  }

  clear(): void {
    this.threads.clear();
  }
}
