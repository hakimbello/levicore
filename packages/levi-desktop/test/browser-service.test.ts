import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { BrowserService, validateBrowserUrlForTest, type BrowserPageDriver } from "../electron/main/browser-service";
import type { BrowserElementSnapshot } from "../src/features/browser";

class FakeBrowserDriver implements BrowserPageDriver {
  currentUrl = "about:blank";
  currentTitle = "Blank";
  closed = false;
  clicks: string[] = [];
  fills: Array<{ selector: string; value: string }> = [];
  pressed: string[] = [];
  scrolls: Array<{ deltaX: number; deltaY: number }> = [];
  failSnapshot = false;

  constructor(private readonly elements: BrowserElementSnapshot[] = defaultElements()) {}

  async load(url: string): Promise<void> {
    this.currentUrl = url;
    this.currentTitle = url.includes("example.com") ? "Example Domain" : "Loaded";
  }

  async back(): Promise<void> {
    this.currentTitle = "Back";
  }

  async forward(): Promise<void> {
    this.currentTitle = "Forward";
  }

  async reload(): Promise<void> {
    this.currentTitle = "Reloaded";
  }

  async title(): Promise<string> {
    return this.currentTitle;
  }

  url(): string {
    return this.currentUrl;
  }

  async snapshot(): Promise<BrowserElementSnapshot[]> {
    if (this.failSnapshot || this.closed) throw new Error("Browser driver crashed.");
    return this.elements;
  }

  async click(selector: string): Promise<void> {
    this.clicks.push(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    this.fills.push({ selector, value });
  }

  async press(key: string): Promise<void> {
    this.pressed.push(key);
  }

  async scroll(deltaX: number, deltaY: number): Promise<void> {
    this.scrolls.push({ deltaX, deltaY });
  }

  async screenshot(): Promise<Buffer> {
    return Buffer.from("fake-png");
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  isClosed(): boolean {
    return this.closed;
  }
}

function defaultElements(): BrowserElementSnapshot[] {
  return [
    { ref: "E1", role: "button", name: "Continue", elementType: "button", text: "Continue", enabled: true, sensitive: false },
    { ref: "E2", role: "textbox", name: "Password", elementType: "input", text: "", enabled: true, inputType: "password", sensitive: true }
  ];
}

async function createWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "levi-browser-service-"));
}

describe("BrowserService", () => {
  it("validates browser URLs against protocol and workspace rules", async () => {
    const root = await createWorkspace();
    const insideFile = path.join(root, "index.html");
    const outsideFile = path.join(os.tmpdir(), `levi-outside-${Date.now()}.html`);
    await fs.writeFile(insideFile, "<button>ok</button>");
    await fs.writeFile(outsideFile, "<button>no</button>");

    await expect(validateBrowserUrlForTest("https://example.com", root)).resolves.toBe("https://example.com/");
    await expect(validateBrowserUrlForTest("http://127.0.0.1:5173", root)).resolves.toBe("http://127.0.0.1:5173/");
    await expect(validateBrowserUrlForTest(pathToFileURL(insideFile).toString(), root)).resolves.toContain("index.html");
    await expect(validateBrowserUrlForTest("http://example.com", root)).rejects.toThrow(/localhost/i);
    await expect(validateBrowserUrlForTest("https://user:secret@example.com", root)).rejects.toThrow(/credentials/i);
    await expect(validateBrowserUrlForTest("javascript:alert(1)", root)).rejects.toThrow(/protocol/i);
    await expect(validateBrowserUrlForTest(pathToFileURL(outsideFile).toString(), root)).rejects.toThrow(/workspace/i);
  });

  it("creates sessions, navigates, snapshots semantic refs, and closes cleanly", async () => {
    const driver = new FakeBrowserDriver();
    const service = new BrowserService(() => null, { driverFactory: () => driver });

    const created = await service.create({ url: "https://example.com", headless: true });
    expect(created.session.status).toBe("Ready");
    expect(created.snapshot?.elements.map((element) => element.ref)).toEqual(["E1", "E2"]);

    const status = service.status({});
    expect(status.activeSessionId).toBe(created.session.id);
    expect(status.sessions[0].currentUrl).toBe("https://example.com/");

    await service.navigate({ sessionId: created.session.id, history: "reload" });
    expect(driver.currentTitle).toBe("Reloaded");

    await service.close({ sessionId: created.session.id });
    expect(driver.closed).toBe(true);
    expect(service.status({}).activeSessionId).toBeUndefined();
  });

  it("executes approved-style element actions only against known snapshot refs", async () => {
    const driver = new FakeBrowserDriver();
    const service = new BrowserService(() => null, { driverFactory: () => driver });
    const { session } = await service.create({ url: "https://example.com" });

    await service.click({ sessionId: session.id, elementRef: "E1" });
    await service.fill({ sessionId: session.id, elementRef: "E2", value: "correct horse" });
    await service.press({ sessionId: session.id, key: "Enter" });
    await service.scroll({ sessionId: session.id, deltaY: 500 });

    expect(driver.clicks).toEqual(['[data-levi-ref="E1"]']);
    expect(driver.fills).toEqual([{ selector: '[data-levi-ref="E2"]', value: "correct horse" }]);
    expect(driver.pressed).toEqual(["Enter"]);
    expect(driver.scrolls).toEqual([{ deltaX: 0, deltaY: 500 }]);
    await expect(service.click({ sessionId: session.id, elementRef: "E999" })).rejects.toThrow(/reference/i);
  });

  it("redacts sensitive fill previews", async () => {
    const service = new BrowserService(() => null, { driverFactory: () => new FakeBrowserDriver() });
    const { session } = await service.create({ url: "https://example.com" });

    const preview = service.preview({ action: "fill", sessionId: session.id, elementRef: "E2", value: "super-secret-token" });
    expect(preview.valuePreview).toBe("<redacted>");
    expect(preview.sensitive).toBe(true);
  });

  it("stores bounded screenshots and removes them on close", async () => {
    const root = await createWorkspace();
    const service = new BrowserService(() => null, { screenshotRoot: root, driverFactory: () => new FakeBrowserDriver() });
    const { session } = await service.create({ url: "https://example.com" });

    const result = await service.screenshot({ sessionId: session.id, fullPage: true });
    await expect(fs.stat(result.screenshotPath)).resolves.toBeTruthy();
    await service.close({ sessionId: session.id });
    await expect(fs.stat(result.screenshotPath)).rejects.toThrow();
  });

  it("marks sessions failed after a driver crash and never crashes callers", async () => {
    const driver = new FakeBrowserDriver();
    const service = new BrowserService(() => null, { driverFactory: () => driver });
    const { session } = await service.create({ url: "https://example.com" });
    driver.failSnapshot = true;

    await expect(service.snapshot({ sessionId: session.id })).rejects.toThrow(/crashed/i);
    expect(service.status({ sessionId: session.id }).sessions[0].status).toBe("Failed");
  });

  it.skip("real browser qualification skipped: Electron Chromium is unavailable in the Vitest main-process environment", () => undefined);
});
