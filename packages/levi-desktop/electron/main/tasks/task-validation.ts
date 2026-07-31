export function validateTaskRunRequest(value: unknown): { taskId: string } {
  if (!value || typeof value !== "object") {
    throw new Error("Task run request must be an object.");
  }
  const request = value as Record<string, unknown>;
  if (typeof request.taskId !== "string" || request.taskId.length === 0 || request.taskId.length > 120) {
    throw new Error("taskId must be a non-empty string.");
  }
  return { taskId: request.taskId };
}

export function validateTaskCancelRequest(value: unknown): { runId: string } {
  if (!value || typeof value !== "object") {
    throw new Error("Task cancel request must be an object.");
  }
  const request = value as Record<string, unknown>;
  if (typeof request.runId !== "string" || request.runId.length === 0 || request.runId.length > 120) {
    throw new Error("runId must be a non-empty string.");
  }
  return { runId: request.runId };
}

export function validateTaskOutputRequest(value: unknown): { source?: string; channel?: string } {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object") {
    throw new Error("Task output request must be an object.");
  }
  const request = value as Record<string, unknown>;
  const result: { source?: string; channel?: string } = {};
  if (request.source !== undefined) {
    if (request.source !== "task" && request.source !== "levi" && request.source !== "git" && request.source !== "debugger" && request.source !== "extension") {
      throw new Error("Invalid output source.");
    }
    result.source = request.source;
  }
  if (request.channel !== undefined) {
    if (typeof request.channel !== "string" || request.channel.length > 120) {
      throw new Error("Invalid output channel.");
    }
    result.channel = request.channel;
  }
  return result;
}

export function validateTaskPinRequest(value: unknown): { taskId: string; pinned: boolean } {
  if (!value || typeof value !== "object") {
    throw new Error("Task pin request must be an object.");
  }
  const request = value as Record<string, unknown>;
  if (typeof request.taskId !== "string" || request.taskId.length === 0 || request.taskId.length > 120) {
    throw new Error("taskId must be a non-empty string.");
  }
  if (typeof request.pinned !== "boolean") {
    throw new Error("pinned must be a boolean.");
  }
  return { taskId: request.taskId, pinned: request.pinned };
}
