import { colors } from "./colors";
import { elevation } from "./elevation";
import { layout } from "./layout";
import { motion } from "./motion";
import { radius } from "./radius";
import { spacing } from "./spacing";
import { typography } from "./typography";

function px(value: number): string {
  return `${value}px`;
}

function setRawToken(root: HTMLElement, name: string, value: string | number) {
  root.style.setProperty(name, String(value));
}

function setPxToken(root: HTMLElement, name: string, value: string | number) {
  root.style.setProperty(name, typeof value === "number" ? px(value) : value);
}

export function applyDesignTokens(root: HTMLElement = document.documentElement) {
  for (const [name, value] of Object.entries(colors)) {
    setRawToken(root, `--levi-color-${name}`, value);
  }

  for (const [name, value] of Object.entries(spacing)) {
    setPxToken(root, `--levi-space-${name.replace("px", "")}`, value);
  }

  setRawToken(root, "--levi-font-family", typography.fontFamily);
  setRawToken(root, "--levi-font-mono", typography.monoFamily);
  for (const [name, value] of Object.entries(typography.sizes)) {
    setPxToken(root, `--levi-font-size-${name}`, value);
  }
  for (const [name, value] of Object.entries(typography.weights)) {
    setRawToken(root, `--levi-font-weight-${name}`, value);
  }
  for (const [name, value] of Object.entries(typography.lineHeights)) {
    setRawToken(root, `--levi-line-height-${name}`, value);
  }

  for (const [name, value] of Object.entries(radius)) {
    setPxToken(root, `--levi-radius-${name}`, value);
  }

  for (const [name, value] of Object.entries(elevation)) {
    setRawToken(root, `--levi-elevation-${name.replace("level", "")}`, value);
  }

  for (const [name, value] of Object.entries(motion)) {
    setRawToken(root, `--levi-motion-${name}`, typeof value === "number" ? `${value}ms` : value);
  }

  for (const [name, value] of Object.entries(layout)) {
    setPxToken(root, `--levi-layout-${name}`, value);
  }
}
