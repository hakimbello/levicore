export const colors = {
  background: "#f5f4f1",
  surface: "#fbfaf8",
  surfaceElevated: "#ffffff",
  border: "#ded8ce",
  divider: "rgba(31, 29, 25, 0.1)",
  primaryText: "#181713",
  secondaryText: "#58534a",
  mutedText: "#8a8377",
  accent: "#2563eb",
  accentSoft: "#eaf1ff",
  success: "#168a50",
  successSoft: "#edf8f1",
  warning: "#b7791f",
  warningSoft: "#fff7e6",
  danger: "#c2413b",
  dangerSoft: "#fff0ef",
  codeSurface: "#f3f1ec",
  overlay: "rgba(24, 23, 19, 0.48)"
} as const;

export type LeviColorToken = keyof typeof colors;
