import type { DapProtocolMessage, DebugSessionState } from "./DebugEvents";

export type DebugTransport = {
  write: (message: string) => void;
  onData?: (listener: (data: Uint8Array | string) => void) => () => void;
  dispose: () => void;
};

type PendingRequest = {
  command: string;
  resolve: (body: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type DebugSessionListeners = {
  event: Array<(message: DapProtocolMessage) => void>;
  response: Array<(message: DapProtocolMessage) => void>;
  state: Array<(state: DebugSessionState) => void>;
};

const HEADER_SEPARATOR = "\r\n\r\n";

export function encodeDapMessage(payload: Omit<DapProtocolMessage, "seq"> & { seq: number }): string {
  const body = JSON.stringify(payload);
  return `Content-Length: ${new TextEncoder().encode(body).length}${HEADER_SEPARATOR}${body}`;
}

export class DebugSession {
  private buffer = "";
  private seq = 1;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly listeners: DebugSessionListeners = {
    event: [],
    response: [],
    state: []
  };

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly transport: DebugTransport
  ) {
    this.transport.onData?.((data) => this.handleData(data));
  }

  onEvent(listener: (message: DapProtocolMessage) => void): () => void {
    this.listeners.event.push(listener);
    return () => {
      this.listeners.event = this.listeners.event.filter((candidate) => candidate !== listener);
    };
  }

  onResponse(listener: (message: DapProtocolMessage) => void): () => void {
    this.listeners.response.push(listener);
    return () => {
      this.listeners.response = this.listeners.response.filter((candidate) => candidate !== listener);
    };
  }

  onState(listener: (state: DebugSessionState) => void): () => void {
    this.listeners.state.push(listener);
    return () => {
      this.listeners.state = this.listeners.state.filter((candidate) => candidate !== listener);
    };
  }

  emitState(state: DebugSessionState): void {
    for (const listener of this.listeners.state) {
      listener(state);
    }
  }

  handleData(data: Uint8Array | string): void {
    this.buffer += typeof data === "string" ? data : new TextDecoder().decode(data);

    while (true) {
      const separatorIndex = this.buffer.indexOf(HEADER_SEPARATOR);
      if (separatorIndex < 0) return;
      const header = this.buffer.slice(0, separatorIndex);
      const lengthMatch = /^Content-Length:\s*(\d+)$/im.exec(header);
      if (!lengthMatch) {
        this.buffer = "";
        throw new Error("Malformed DAP message header.");
      }

      const bodyStart = separatorIndex + HEADER_SEPARATOR.length;
      const contentLength = Number(lengthMatch[1]);
      const body = this.buffer.slice(bodyStart, bodyStart + contentLength);
      if (body.length < contentLength) return;

      this.buffer = this.buffer.slice(bodyStart + contentLength);
      this.handleMessage(JSON.parse(body) as DapProtocolMessage);
    }
  }

  request(command: string, args: unknown = {}, timeoutMs = 10000): Promise<unknown> {
    const seq = this.seq++;
    const message: DapProtocolMessage = {
      seq,
      type: "request",
      command,
      arguments: args
    };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(seq);
        reject(new Error(`DAP request timed out: ${command}`));
      }, timeoutMs);
      this.pendingRequests.set(seq, {
        command,
        resolve,
        reject,
        timeout
      });
      this.transport.write(encodeDapMessage(message));
    });
  }

  dispose(): void {
    for (const [seq, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`DAP session disposed before ${pending.command} completed.`));
      this.pendingRequests.delete(seq);
    }
    this.transport.dispose();
  }

  private handleMessage(message: DapProtocolMessage): void {
    if (message.type === "response" && typeof message.request_seq === "number") {
      const pending = this.pendingRequests.get(message.request_seq);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.request_seq);
        if (message.success === false) {
          pending.reject(new Error(message.message ?? `${pending.command} failed.`));
        } else {
          pending.resolve(message.body);
        }
      }
      for (const listener of this.listeners.response) {
        listener(message);
      }
      return;
    }

    if (message.type === "event") {
      for (const listener of this.listeners.event) {
        listener(message);
      }
    }
  }
}
