import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { applyDesignTokens, colors, elevation, layout, motion, radius, spacing, typography } from "../src/design";

const packageRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(packageRoot, "src");

function collectFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const absolutePath = path.join(root, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      return collectFiles(absolutePath);
    }
    return absolutePath;
  });
}

describe("Levi design system", () => {
  it("uses the approved spacing scale", () => {
    expect(Object.values(spacing)).toEqual([4, 8, 12, 16, 24, 32, 40, 48, 64]);
  });

  it("defines the required desktop layout dimensions", () => {
    expect(layout.windowPadding).toBe(32);
    expect(layout.sidebarWidth).toBe(256);
    expect(layout.conversationMaxWidth).toBe(900);
    expect(layout.promptMinHeight).toBe(64);
    expect(layout.promptMaxHeight).toBe(240);
    expect(layout.terminalCollapsedHeight).toBe(40);
  });

  it("keeps typography, radius, elevation, and motion on shared tokens", () => {
    expect(typography.sizes).toMatchObject({ hero: 32, section: 24, title: 20, body: 16, small: 14, caption: 12 });
    expect(radius).toMatchObject({ input: 12, button: 12, card: 16, dialog: 20 });
    expect(Object.keys(elevation)).toEqual(["level1", "level2", "level3"]);
    expect(motion).toMatchObject({ fast: 150, normal: 200, slow: 250 });
  });

  it("applies browser CSS variables with the correct units", () => {
    const root = document.createElement("div");
    applyDesignTokens(root);

    expect(root.style.getPropertyValue("--levi-layout-sidebarWidth")).toBe("256px");
    expect(root.style.getPropertyValue("--levi-space-32")).toBe("32px");
    expect(root.style.getPropertyValue("--levi-font-weight-semibold")).toBe("650");
    expect(root.style.getPropertyValue("--levi-motion-fast")).toBe("150ms");
    expect(root.style.getPropertyValue("--levi-color-background")).toBe(colors.background);
  });

  it("keeps raw color literals out of components and styles", () => {
    const offenders = collectFiles(srcRoot)
      .filter((file) => /\.(css|tsx?)$/.test(file))
      .filter((file) => !file.includes(`${path.sep}design${path.sep}`))
      .filter((file) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(readFileSync(file, "utf8")));

    expect(offenders.map((file) => path.relative(packageRoot, file))).toEqual([]);
  });

  it("uses layout tokens for the primary polished surfaces", () => {
    const css = readFileSync(path.join(srcRoot, "styles", "global.css"), "utf8");

    expect(css).toContain("var(--levi-layout-sidebarWidth)");
    expect(css).toContain("var(--levi-layout-conversationMaxWidth)");
    expect(css).toContain("var(--levi-layout-promptMinHeight)");
    expect(css).toContain("var(--levi-layout-promptMaxHeight)");
    expect(css).toContain("var(--levi-layout-terminalCollapsedHeight)");
  });
});
