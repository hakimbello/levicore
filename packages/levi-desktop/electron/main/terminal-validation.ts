import {
  TERMINAL_MAX_COLS,
  TERMINAL_MAX_ROWS,
  TERMINAL_MAX_WRITE_LENGTH,
  TERMINAL_MIN_COLS,
  TERMINAL_MIN_ROWS,
  parseTerminalSize
} from "./terminal-service";

export type ValidatedTerminalCreateRequest = {
  cols: number;
  rows: number;
  name?: string;
  cwd?: string;
};

export type ValidatedTerminalResizeRequest = {
  id: string;
  cols: number;
  rows: number;
};

export type ValidatedTerminalRenameRequest = {
  id: string;
  name: string;
};

export type ValidatedTerminalSplitRequest = {
  sourceId: string;
  direction: "horizontal" | "vertical";
  cols: number;
  rows: number;
  cwd?: string;
};

export type ValidatedTerminalLayoutState = {
  tabs: Array<{ id: string; name: string; cwd: string; sessionId?: string }>;
  activeTabId: string | null;
  panelTab: "terminal" | "problems" | "output" | "debug-console";
  panelVisible: boolean;
  panelMaximized: boolean;
  panelHeightPx: number;
  splitLayout: TerminalSplitNode | null;
};

export type TerminalSplitNode =
  | { type: "pane"; tabId: string }
  | { type: "split"; direction: "horizontal" | "vertical"; children: [TerminalSplitNode, TerminalSplitNode] };

const MAX_TERMINAL_NAME_LENGTH = 64;

function assertString(value: unknown, fieldName: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(`${fieldName} must be a string up to ${maxLength} characters.`);
  }
  return value;
}

export function validateTerminalCreateRequest(value: unknown): ValidatedTerminalCreateRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Terminal create request must be an object.");
  }
  const request = value as Record<string, unknown>;
  const result: ValidatedTerminalCreateRequest = {
    cols: parseTerminalSize(request.cols, 96, TERMINAL_MIN_COLS, TERMINAL_MAX_COLS),
    rows: parseTerminalSize(request.rows, 16, TERMINAL_MIN_ROWS, TERMINAL_MAX_ROWS)
  };
  if (request.name !== undefined) {
    result.name = assertString(request.name, "name", MAX_TERMINAL_NAME_LENGTH);
  }
  if (request.cwd !== undefined) {
    result.cwd = assertString(request.cwd, "cwd", 500);
  }
  return result;
}

export function validateTerminalId(value: unknown): string {
  return assertString(value, "id", 64);
}

export function validateTerminalWrite(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > TERMINAL_MAX_WRITE_LENGTH) {
    throw new Error("Invalid terminal input.");
  }
  return value;
}

export function validateTerminalResizeRequest(value: unknown): ValidatedTerminalResizeRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Terminal resize request must be an object.");
  }
  const request = value as Record<string, unknown>;
  return {
    id: validateTerminalId(request.id),
    cols: parseTerminalSize(request.cols, 96, TERMINAL_MIN_COLS, TERMINAL_MAX_COLS),
    rows: parseTerminalSize(request.rows, 16, TERMINAL_MIN_ROWS, TERMINAL_MAX_ROWS)
  };
}

export function validateTerminalRenameRequest(value: unknown): ValidatedTerminalRenameRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Terminal rename request must be an object.");
  }
  const request = value as Record<string, unknown>;
  return {
    id: validateTerminalId(request.id),
    name: assertString(request.name, "name", MAX_TERMINAL_NAME_LENGTH)
  };
}

export function validateTerminalSplitRequest(value: unknown): ValidatedTerminalSplitRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Terminal split request must be an object.");
  }
  const request = value as Record<string, unknown>;
  const direction = request.direction;
  if (direction !== "horizontal" && direction !== "vertical") {
    throw new Error("Split direction must be horizontal or vertical.");
  }
  const result: ValidatedTerminalSplitRequest = {
    sourceId: validateTerminalId(request.sourceId),
    direction,
    cols: parseTerminalSize(request.cols, 96, TERMINAL_MIN_COLS, TERMINAL_MAX_COLS),
    rows: parseTerminalSize(request.rows, 16, TERMINAL_MIN_ROWS, TERMINAL_MAX_ROWS)
  };
  if (request.cwd !== undefined) {
    result.cwd = assertString(request.cwd, "cwd", 500);
  }
  return result;
}

function validateSplitNode(value: unknown): TerminalSplitNode {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid split layout node.");
  }
  const node = value as Record<string, unknown>;
  if (node.type === "pane") {
    return { type: "pane", tabId: assertString(node.tabId, "tabId", 64) };
  }
  if (node.type === "split") {
    const direction = node.direction;
    if (direction !== "horizontal" && direction !== "vertical") {
      throw new Error("Split direction must be horizontal or vertical.");
    }
    const children = node.children;
    if (!Array.isArray(children) || children.length !== 2) {
      throw new Error("Split nodes must have exactly two children.");
    }
    return {
      type: "split",
      direction,
      children: [validateSplitNode(children[0]), validateSplitNode(children[1])]
    };
  }
  throw new Error("Invalid split layout node type.");
}

export function validateTerminalLayoutState(value: unknown): ValidatedTerminalLayoutState {
  if (!value || typeof value !== "object") {
    throw new Error("Terminal layout must be an object.");
  }
  const layout = value as Record<string, unknown>;
  if (!Array.isArray(layout.tabs)) {
    throw new Error("Terminal layout tabs must be an array.");
  }
  const panelTab = layout.panelTab;
  if (panelTab !== "terminal" && panelTab !== "problems" && panelTab !== "output" && panelTab !== "debug-console") {
    throw new Error("Invalid panel tab.");
  }
  const panelHeightPx = layout.panelHeightPx;
  if (typeof panelHeightPx !== "number" || !Number.isFinite(panelHeightPx) || panelHeightPx < 120 || panelHeightPx > 2000) {
    throw new Error("Panel height must be between 120 and 2000 pixels.");
  }
  return {
    tabs: layout.tabs.map((tab) => {
      if (!tab || typeof tab !== "object") throw new Error("Invalid terminal tab.");
      const entry = tab as Record<string, unknown>;
      return {
        id: assertString(entry.id, "tab.id", 64),
        name: assertString(entry.name, "tab.name", MAX_TERMINAL_NAME_LENGTH),
        cwd: assertString(entry.cwd, "tab.cwd", 500),
        sessionId: typeof entry.sessionId === "string" ? entry.sessionId : undefined
      };
    }),
    activeTabId: layout.activeTabId === null ? null : validateTerminalId(layout.activeTabId),
    panelTab,
    panelVisible: layout.panelVisible === true,
    panelMaximized: layout.panelMaximized === true,
    panelHeightPx,
    splitLayout: layout.splitLayout === null ? null : validateSplitNode(layout.splitLayout)
  };
}
