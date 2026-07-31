import type { DebugStackFrame, DebugThread } from "./DebugEvents";

export class CallStackStore {
  private readonly threads = new Map<number, DebugThread>();
  private activeThreadId: number | undefined;
  private activeFrameId: number | undefined;

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
    if (stopped && frames.length > 0) {
      this.activeThreadId = threadId;
      this.activeFrameId = frames[0].id;
    }
  }

  getActiveThreadId(): number | undefined {
    return this.activeThreadId;
  }

  getActiveFrame(): DebugStackFrame | undefined {
    if (this.activeThreadId === undefined || this.activeFrameId === undefined) return undefined;
    return this.threads.get(this.activeThreadId)?.frames.find((frame) => frame.id === this.activeFrameId);
  }

  setActiveFrame(threadId: number, frameId: number): DebugStackFrame | undefined {
    const frame = this.threads.get(threadId)?.frames.find((candidate) => candidate.id === frameId);
    if (!frame) return undefined;
    this.activeThreadId = threadId;
    this.activeFrameId = frameId;
    return frame;
  }

  clear(): void {
    this.threads.clear();
    this.activeThreadId = undefined;
    this.activeFrameId = undefined;
  }
}
