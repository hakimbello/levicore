export const typography = {
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  monoFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
  sizes: {
    hero: 32,
    section: 24,
    title: 20,
    body: 16,
    small: 14,
    caption: 12
  },
  weights: {
    regular: 400,
    medium: 520,
    semibold: 650,
    bold: 720
  },
  lineHeights: {
    tight: 1.18,
    body: 1.55,
    compact: 1.35,
    editor: 22
  }
} as const;
