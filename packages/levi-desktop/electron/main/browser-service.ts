import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow } from "electron";
import type {
  BrowserActionPreview,
  BrowserActionResult,
  BrowserCloseResult,
  BrowserCreateRequest,
  BrowserCreateResult,
  BrowserElementActionRequest,
  BrowserElementSnapshot,
  BrowserFillRequest,
  BrowserNavigateRequest,
  BrowserPageSnapshot,
  BrowserPressRequest,
  BrowserScreenshotRequest,
  BrowserScreenshotResult,
  BrowserScrollRequest,
  BrowserSession,
  BrowserStatusRequest,
  BrowserStatusResult
} from "../../src/features/browser";
import { isInsideRoot, normalizeSlashes } from "./workspace-context";

const MAX_ELEMENTS = 60;
const MAX_TEXT = 240;
const MAX_URL_LENGTH = 2_000;
const MAX_FILL_LENGTH = 4_000;
const MAX_SCROLL_DELTA = 10_000;
const MAX_KEY_LENGTH = 64;
const SCREENSHOT_DIR = "browser-screenshots";

export type BrowserPageDriver = {
  load(url: string): Promise<void>;
  back(): Promise<void>;
  forward(): Promise<void>;
  reload(): Promise<void>;
  title(): Promise<string>;
  url(): string;
  snapshot(): Promise<BrowserElementSnapshot[]>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  press(key: string): Promise<void>;
  scroll(deltaX: number, deltaY: number): Promise<void>;
  screenshot(fullPage: boolean): Promise<Buffer>;
  close(): Promise<void>;
  isClosed(): boolean;
};

export type BrowserDriverFactory = (options: { id: string; headless: boolean }) => BrowserPageDriver;

type ManagedBrowserSession = {
  session: BrowserSession;
  driver: BrowserPageDriver;
  elements: Map<string, { selector: string; description: string; sensitive: boolean }>;
  screenshots: string[];
};

export class BrowserService {
  private readonly sessions = new Map<string, ManagedBrowserSession>();
  private activeSessionId: string | undefined;
  private readonly screenshotRoot: string;

  constructor(
    private readonly getWorkspaceRoot: () => string | null,
    options: { screenshotRoot?: string; driverFactory?: BrowserDriverFactory } = {}
  ) {
    this.screenshotRoot = options.screenshotRoot ?? path.join(typeof app?.getPath === "function" ? app.getPath("userData") : os.tmpdir(), SCREENSHOT_DIR);
    this.driverFactory = options.driverFactory ?? createElectronDriver;
  }

  private readonly driverFactory: BrowserDriverFactory;

  async create(rawRequest: unknown): Promise<BrowserCreateResult> {
    const request = validateCreateRequest(rawRequest);
    const id = randomUUID();
    const now = new Date().toISOString();
    const session: BrowserSession = {
      id,
      workspace: this.getWorkspaceRoot() ?? undefined,
      status: "Starting",
      createdAt: now,
      updatedAt: now,
      headless: request.headless ?? true
    };
    const managed: ManagedBrowserSession = {
      session,
      driver: this.driverFactory({ id, headless: session.headless }),
      elements: new Map(),
      screenshots: []
    };
    this.sessions.set(id, managed);
    this.activeSessionId = id;
    try {
      if (request.url) await this.navigate({ sessionId: id, url: request.url, purpose: request.purpose });
      else await this.refreshMetadata(managed, "Ready");
      return { session: { ...managed.session }, snapshot: request.url ? await this.snapshot({ sessionId: id }).then((result) => result.snapshot) : undefined };
    } catch (error) {
      await this.fail(managed, error);
      throw error;
    }
  }

  status(rawRequest: unknown = {}): BrowserStatusResult {
    const request = validateStatusRequest(rawRequest);
    const sessions = [...this.sessions.values()].map((entry) => ({ ...entry.session }));
    return {
      sessions: request.sessionId ? sessions.filter((session) => session.id === request.sessionId) : sessions,
      activeSessionId: this.activeSessionId
    };
  }

  async snapshot(rawRequest: unknown): Promise<{ snapshot: BrowserPageSnapshot }> {
    const managed = this.requireSession(validateSessionIdRequest(rawRequest).sessionId);
    if (managed.session.status === "Closed") throw new Error("Browser session is closed.");
    try {
      const elements = await managed.driver.snapshot();
      managed.elements.clear();
      for (const element of elements.slice(0, MAX_ELEMENTS)) {
        const selector = `[data-levi-ref="${cssEscape(element.ref)}"]`;
        managed.elements.set(element.ref, {
          selector,
          description: `${element.role || element.elementType} ${element.name || element.text || element.ref}`.trim(),
          sensitive: element.sensitive
        });
      }
      const title = await managed.driver.title();
      const url = managed.driver.url();
      await assertUrlAllowed(url, this.getWorkspaceRoot());
      Object.assign(managed.session, { currentUrl: url, title, status: "Ready" as const, updatedAt: new Date().toISOString(), lastError: undefined });
      return {
        snapshot: {
          sessionId: managed.session.id,
          url,
          title,
          status: managed.session.status,
          elements: elements.slice(0, MAX_ELEMENTS),
          capturedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      await this.fail(managed, error);
      throw error;
    }
  }

  async navigate(rawRequest: unknown): Promise<BrowserActionResult> {
    const request = validateNavigateRequest(rawRequest);
    const managed = this.requireSession(request.sessionId);
    await this.runAction(managed, "Navigating", async () => {
      if (request.history === "back") await managed.driver.back();
      else if (request.history === "forward") await managed.driver.forward();
      else if (request.history === "reload") await managed.driver.reload();
      else {
        const url = await assertUrlAllowed(request.url, this.getWorkspaceRoot());
        await managed.driver.load(url);
      }
      await assertUrlAllowed(managed.driver.url(), this.getWorkspaceRoot());
    });
    return { session: { ...managed.session }, snapshot: await this.snapshot({ sessionId: managed.session.id }).then((result) => result.snapshot) };
  }

  async click(rawRequest: unknown): Promise<BrowserActionResult> {
    const request = validateElementRequest(rawRequest, "Browser click request is invalid.");
    const managed = this.requireSession(request.sessionId);
    const target = this.requireElement(managed, request.elementRef);
    await this.runAction(managed, "Acting", () => managed.driver.click(target.selector));
    return { session: { ...managed.session }, snapshot: await this.snapshot({ sessionId: managed.session.id }).then((result) => result.snapshot) };
  }

  async fill(rawRequest: unknown): Promise<BrowserActionResult> {
    const request = validateFillRequest(rawRequest);
    const managed = this.requireSession(request.sessionId);
    const target = this.requireElement(managed, request.elementRef);
    await this.runAction(managed, "Acting", () => managed.driver.fill(target.selector, request.value));
    return { session: { ...managed.session }, snapshot: await this.snapshot({ sessionId: managed.session.id }).then((result) => result.snapshot) };
  }

  async press(rawRequest: unknown): Promise<BrowserActionResult> {
    const request = validatePressRequest(rawRequest);
    const managed = this.requireSession(request.sessionId);
    await this.runAction(managed, "Acting", () => managed.driver.press(request.key));
    return { session: { ...managed.session }, snapshot: await this.snapshot({ sessionId: managed.session.id }).then((result) => result.snapshot) };
  }

  async scroll(rawRequest: unknown): Promise<BrowserActionResult> {
    const request = validateScrollRequest(rawRequest);
    const managed = this.requireSession(request.sessionId);
    await this.runAction(managed, "Acting", () => managed.driver.scroll(request.deltaX ?? 0, request.deltaY ?? 0));
    return { session: { ...managed.session }, snapshot: await this.snapshot({ sessionId: managed.session.id }).then((result) => result.snapshot) };
  }

  async screenshot(rawRequest: unknown): Promise<BrowserScreenshotResult> {
    const request = validateScreenshotRequest(rawRequest);
    const managed = this.requireSession(request.sessionId);
    await this.runAction(managed, "Acting", async () => {
      const buffer = await managed.driver.screenshot(request.fullPage ?? false);
      await fs.mkdir(this.screenshotRoot, { recursive: true });
      const screenshotPath = path.join(this.screenshotRoot, `${managed.session.id}-${Date.now()}.png`);
      if (buffer.length > 8 * 1024 * 1024) throw new Error("Browser screenshot exceeds the size limit.");
      await fs.writeFile(screenshotPath, buffer);
      managed.screenshots.push(screenshotPath);
      managed.session.lastScreenshot = screenshotPath;
    });
    return { session: { ...managed.session }, screenshotPath: managed.session.lastScreenshot! };
  }

  async close(rawRequest: unknown): Promise<BrowserCloseResult> {
    const { sessionId } = validateSessionIdRequest(rawRequest);
    const managed = this.requireSession(sessionId);
    await this.closeManaged(managed);
    return { sessionId, status: "Closed" };
  }

  preview(rawRequest: unknown): BrowserActionPreview {
    const record = rawRequest && typeof rawRequest === "object" ? rawRequest as Record<string, unknown> : {};
    const action = parseAction(record.action);
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : undefined;
    const elementRef = typeof record.elementRef === "string" ? record.elementRef : undefined;
    const value = typeof record.value === "string" ? record.value : undefined;
    const managed = sessionId ? this.sessions.get(sessionId) : undefined;
    const target = elementRef && managed ? managed.elements.get(elementRef) : undefined;
    const sensitive = target?.sensitive ?? isSensitiveValue(value);
    return {
      previewId: randomUUID(),
      sessionId,
      action,
      targetUrl: typeof record.url === "string" ? redactUrl(record.url) : undefined,
      elementRef,
      elementDescription: target?.description,
      valuePreview: value === undefined ? undefined : sensitive ? "<redacted>" : truncate(value, 160),
      sensitive,
      purpose: typeof record.purpose === "string" ? truncate(record.purpose, 500) : undefined,
      riskLevel: action === "close" || action === "fill" ? "medium" : action === "open" || action === "navigate" ? "medium" : "low",
      createdAt: new Date().toISOString()
    };
  }

  activeSession(): BrowserSession | undefined {
    return this.activeSessionId ? this.sessions.get(this.activeSessionId)?.session : undefined;
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((managed) => this.closeManaged(managed).catch(() => undefined)));
  }

  private requireSession(sessionId: string): ManagedBrowserSession {
    const managed = this.sessions.get(sessionId);
    if (!managed) throw new Error("Browser session was not found.");
    if (managed.driver.isClosed() && managed.session.status !== "Closed") {
      managed.session.status = "Failed";
      managed.session.lastError = "Browser session closed unexpectedly.";
      managed.session.updatedAt = new Date().toISOString();
    }
    return managed;
  }

  private requireElement(managed: ManagedBrowserSession, elementRef: string): { selector: string; description: string; sensitive: boolean } {
    const element = managed.elements.get(elementRef);
    if (!element) throw new Error("Browser element reference was not found. Refresh the page snapshot.");
    return element;
  }

  private async runAction(managed: ManagedBrowserSession, status: BrowserSession["status"], action: () => Promise<void>): Promise<void> {
    if (managed.session.status === "Closed") throw new Error("Browser session is closed.");
    managed.session.status = status;
    managed.session.updatedAt = new Date().toISOString();
    try {
      await action();
      await this.refreshMetadata(managed, "Ready");
    } catch (error) {
      await this.fail(managed, error);
      throw error;
    }
  }

  private async refreshMetadata(managed: ManagedBrowserSession, status: BrowserSession["status"]): Promise<void> {
    managed.session.currentUrl = managed.driver.url();
    managed.session.title = await managed.driver.title();
    managed.session.status = status;
    managed.session.updatedAt = new Date().toISOString();
    managed.session.lastError = undefined;
  }

  private async fail(managed: ManagedBrowserSession, error: unknown): Promise<void> {
    managed.session.status = "Failed";
    managed.session.lastError = error instanceof Error ? error.message : "Browser action failed.";
    managed.session.updatedAt = new Date().toISOString();
  }

  private async closeManaged(managed: ManagedBrowserSession): Promise<void> {
    if (managed.session.status !== "Closed") {
      await managed.driver.close().catch(() => undefined);
      managed.session.status = "Closed";
      managed.session.updatedAt = new Date().toISOString();
    }
    for (const screenshot of managed.screenshots) {
      await fs.rm(screenshot, { force: true }).catch(() => undefined);
    }
    managed.screenshots = [];
    managed.elements.clear();
    if (this.activeSessionId === managed.session.id) this.activeSessionId = undefined;
  }
}

function createElectronDriver(options: { id: string; headless: boolean }): BrowserPageDriver {
  const window = new BrowserWindow({
    show: !options.headless,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  return {
    load: (url) => window.loadURL(url),
    back: async () => { if (window.webContents.canGoBack()) window.webContents.goBack(); await waitForLoad(window); },
    forward: async () => { if (window.webContents.canGoForward()) window.webContents.goForward(); await waitForLoad(window); },
    reload: async () => { window.webContents.reload(); await waitForLoad(window); },
    title: async () => window.webContents.getTitle(),
    url: () => window.webContents.getURL(),
    snapshot: () => window.webContents.executeJavaScript(SNAPSHOT_SCRIPT, true),
    click: (selector) => window.webContents.executeJavaScript(ACTION_SCRIPT("click", selector), true),
    fill: (selector, value) => window.webContents.executeJavaScript(ACTION_SCRIPT("fill", selector, value), true),
    press: async (key) => { window.webContents.sendInputEvent({ type: "keyDown", keyCode: key }); },
    scroll: async (deltaX, deltaY) => {
      window.webContents.sendInputEvent({ type: "mouseWheel", x: 20, y: 20, deltaX, deltaY });
    },
    screenshot: async (fullPage) => {
      const image = fullPage
        ? await window.webContents.capturePage()
        : await window.capturePage();
      return image.toPNG();
    },
    close: async () => { if (!window.isDestroyed()) window.close(); },
    isClosed: () => window.isDestroyed()
  };
}

function waitForLoad(window: BrowserWindow): Promise<void> {
  if (window.webContents.isLoadingMainFrame()) {
    return new Promise((resolve) => window.webContents.once("did-finish-load", () => resolve()));
  }
  return Promise.resolve();
}

const SNAPSHOT_SCRIPT = `(() => {
  const candidates = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role],[tabindex]')).slice(0, ${MAX_ELEMENTS});
  let index = 0;
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const text = (value) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, ${MAX_TEXT});
  const roleFor = (el) => el.getAttribute('role') || ({ A: 'link', BUTTON: 'button', INPUT: 'textbox', TEXTAREA: 'textbox', SELECT: 'combobox' }[el.tagName] || el.tagName.toLowerCase());
  const nameFor = (el) => text(el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.value || el.name || el.id);
  return candidates.filter(visible).map((el) => {
    const ref = 'E' + (++index);
    el.setAttribute('data-levi-ref', ref);
    const inputType = el.getAttribute('type') || undefined;
    const sensitive = ['password','token','secret'].includes(String(inputType || '').toLowerCase()) || /password|token|secret/i.test(String(el.name || el.id || el.getAttribute('aria-label') || ''));
    return {
      ref,
      role: roleFor(el),
      name: nameFor(el),
      elementType: el.tagName.toLowerCase(),
      text: text(el.innerText || el.value),
      enabled: !el.disabled && el.getAttribute('aria-disabled') !== 'true',
      checked: typeof el.checked === 'boolean' ? el.checked : undefined,
      inputType,
      sensitive
    };
  });
})()`;

function ACTION_SCRIPT(action: "click" | "fill", selector: string, value = ""): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Browser element reference is stale.');
    if (${JSON.stringify(action)} === 'click') {
      el.click();
      return;
    }
    el.focus();
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`;
}

async function assertUrlAllowed(value: unknown, workspaceRoot: string | null): Promise<string> {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH || value.includes("\0")) throw new Error("Browser URL is invalid.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Browser URL is invalid.");
  }
  if (parsed.username || parsed.password) throw new Error("Browser URL must not include credentials.");
  if (parsed.protocol === "http:") {
    if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return parsed.toString();
    throw new Error("Browser HTTP URLs are limited to localhost development servers.");
  }
  if (parsed.protocol === "https:") return parsed.toString();
  if (parsed.protocol === "file:") {
    if (!workspaceRoot) throw new Error("File browser URLs require an open workspace.");
    const rootRealPath = await fs.realpath(workspaceRoot);
    const filePath = decodeURIComponent(parsed.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    const realPath = await fs.realpath(filePath);
    if (!isInsideRoot(rootRealPath, realPath)) throw new Error("Browser file URL must stay inside the workspace.");
    return parsed.toString();
  }
  throw new Error("Browser URL protocol is not allowed.");
}

function validateCreateRequest(value: unknown): BrowserCreateRequest {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object") throw new Error("Browser create request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    url: record.url === undefined ? undefined : String(record.url),
    headless: record.headless === undefined ? undefined : record.headless === true,
    purpose: typeof record.purpose === "string" ? truncate(record.purpose, 500) : undefined
  };
}

function validateStatusRequest(value: unknown): BrowserStatusRequest {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object") throw new Error("Browser status request is invalid.");
  const sessionId = (value as Record<string, unknown>).sessionId;
  return { sessionId: sessionId === undefined ? undefined : validateId(sessionId, "sessionId") };
}

function validateSessionIdRequest(value: unknown): { sessionId: string } {
  if (!value || typeof value !== "object") throw new Error("Browser session request is invalid.");
  return { sessionId: validateId((value as Record<string, unknown>).sessionId, "sessionId") };
}

function validateNavigateRequest(value: unknown): BrowserNavigateRequest {
  if (!value || typeof value !== "object") throw new Error("Browser navigate request is invalid.");
  const record = value as Record<string, unknown>;
  const history = record.history === "back" || record.history === "forward" || record.history === "reload" ? record.history : undefined;
  if (!history && typeof record.url !== "string") throw new Error("Browser navigate request requires a URL or history action.");
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    url: typeof record.url === "string" ? record.url : undefined,
    history,
    purpose: typeof record.purpose === "string" ? truncate(record.purpose, 500) : undefined
  };
}

function validateElementRequest(value: unknown, message: string): BrowserElementActionRequest {
  if (!value || typeof value !== "object") throw new Error(message);
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    elementRef: validateElementRef(record.elementRef),
    purpose: typeof record.purpose === "string" ? truncate(record.purpose, 500) : undefined
  };
}

function validateFillRequest(value: unknown): BrowserFillRequest {
  const request = validateElementRequest(value, "Browser fill request is invalid.");
  const valueText = (value as Record<string, unknown>).value;
  if (typeof valueText !== "string" || valueText.length > MAX_FILL_LENGTH || valueText.includes("\0")) throw new Error("Browser fill value is invalid.");
  return { ...request, value: valueText };
}

function validatePressRequest(value: unknown): BrowserPressRequest {
  if (!value || typeof value !== "object") throw new Error("Browser press request is invalid.");
  const record = value as Record<string, unknown>;
  if (typeof record.key !== "string" || record.key.length === 0 || record.key.length > MAX_KEY_LENGTH || record.key.includes("\0")) throw new Error("Browser key is invalid.");
  return { sessionId: validateId(record.sessionId, "sessionId"), key: record.key, purpose: typeof record.purpose === "string" ? truncate(record.purpose, 500) : undefined };
}

function validateScrollRequest(value: unknown): BrowserScrollRequest {
  if (!value || typeof value !== "object") throw new Error("Browser scroll request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    deltaX: boundedNumber(record.deltaX),
    deltaY: boundedNumber(record.deltaY),
    purpose: typeof record.purpose === "string" ? truncate(record.purpose, 500) : undefined
  };
}

function validateScreenshotRequest(value: unknown): BrowserScreenshotRequest {
  if (!value || typeof value !== "object") throw new Error("Browser screenshot request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    fullPage: record.fullPage === true,
    purpose: typeof record.purpose === "string" ? truncate(record.purpose, 500) : undefined
  };
}

function parseAction(value: unknown): BrowserActionPreview["action"] {
  const allowed = new Set(["open", "navigate", "back", "forward", "reload", "click", "fill", "press", "scroll", "screenshot", "snapshot", "close"]);
  if (typeof value === "string" && allowed.has(value)) return value as BrowserActionPreview["action"];
  throw new Error("Browser action is invalid.");
}

function validateId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 140 || value.includes("\0")) throw new Error(`${field} is invalid.`);
  return value;
}

function validateElementRef(value: unknown): string {
  if (typeof value !== "string" || !/^E\d{1,4}$/.test(value)) throw new Error("Browser element reference is invalid.");
  return value;
}

function boundedNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Browser scroll delta is invalid.");
  return Math.max(-MAX_SCROLL_DELTA, Math.min(MAX_SCROLL_DELTA, value));
}

function isSensitiveValue(value: string | undefined): boolean {
  return typeof value === "string" && /(password|token|secret|api[_-]?key)/i.test(value);
}

function redactUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      parsed.username = "";
      parsed.password = "";
    }
    return parsed.toString();
  } catch {
    return truncate(value, 160);
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function cssEscape(value: string): string {
  return normalizeSlashes(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export { assertUrlAllowed as validateBrowserUrlForTest };
