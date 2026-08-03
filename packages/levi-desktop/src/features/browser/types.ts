export type BrowserSessionStatus = "Starting" | "Ready" | "Navigating" | "Acting" | "Failed" | "Closed";

export type BrowserElementSnapshot = {
  ref: string;
  role: string;
  name: string;
  elementType: string;
  text: string;
  enabled: boolean;
  checked?: boolean;
  inputType?: string;
  sensitive: boolean;
};

export type BrowserPageSnapshot = {
  sessionId: string;
  url: string;
  title: string;
  status: BrowserSessionStatus;
  elements: BrowserElementSnapshot[];
  capturedAt: string;
};

export type BrowserSession = {
  id: string;
  workspace?: string;
  currentUrl?: string;
  title?: string;
  status: BrowserSessionStatus;
  createdAt: string;
  updatedAt: string;
  headless: boolean;
  lastScreenshot?: string;
  lastError?: string;
};

export type BrowserActionKind =
  | "open"
  | "navigate"
  | "back"
  | "forward"
  | "reload"
  | "click"
  | "fill"
  | "press"
  | "scroll"
  | "screenshot"
  | "snapshot"
  | "close";

export type BrowserCreateRequest = {
  url?: string;
  headless?: boolean;
  purpose?: string;
};

export type BrowserSessionRequest = {
  sessionId: string;
};

export type BrowserStatusRequest = {
  sessionId?: string;
};

export type BrowserNavigateRequest = {
  sessionId: string;
  url?: string;
  history?: "back" | "forward" | "reload";
  purpose?: string;
};

export type BrowserElementActionRequest = {
  sessionId: string;
  elementRef: string;
  purpose?: string;
};

export type BrowserFillRequest = BrowserElementActionRequest & {
  value: string;
};

export type BrowserPressRequest = {
  sessionId: string;
  key: string;
  purpose?: string;
};

export type BrowserScrollRequest = {
  sessionId: string;
  deltaX?: number;
  deltaY?: number;
  purpose?: string;
};

export type BrowserScreenshotRequest = {
  sessionId: string;
  fullPage?: boolean;
  purpose?: string;
};

export type BrowserActionPreview = {
  previewId: string;
  sessionId?: string;
  action: BrowserActionKind;
  targetUrl?: string;
  elementRef?: string;
  elementDescription?: string;
  valuePreview?: string;
  sensitive: boolean;
  purpose?: string;
  riskLevel: "low" | "medium" | "high";
  createdAt: string;
};

export type BrowserActionResult = {
  session: BrowserSession;
  snapshot?: BrowserPageSnapshot;
  screenshotPath?: string;
};

export type BrowserCreateResult = {
  session: BrowserSession;
  snapshot?: BrowserPageSnapshot;
};

export type BrowserStatusResult = {
  sessions: BrowserSession[];
  activeSessionId?: string;
};

export type BrowserSnapshotResult = {
  snapshot: BrowserPageSnapshot;
};

export type BrowserScreenshotResult = {
  session: BrowserSession;
  screenshotPath: string;
};

export type BrowserCloseResult = {
  sessionId: string;
  status: "Closed";
};
