"use strict";

const fs = require("node:fs");
const path = require("node:path");

const bundledRoot = path.join(__dirname, "..", "vendor", "levi-core");
const monorepoRoot = path.join(__dirname, "..", "..", "..", "src");

function resolveRuntimeModule(modulePath) {
  const bundled = path.join(bundledRoot, modulePath);
  const monorepo = path.join(monorepoRoot, modulePath);
  if (fs.existsSync(bundled)) return bundled;
  if (fs.existsSync(monorepo)) return monorepo;
  throw new Error(`Levi runtime module not found: ${modulePath}`);
}

function requireRuntime(modulePath) {
  return require(resolveRuntimeModule(modulePath));
}

module.exports = {
  requireRuntime,
  resolveRuntimeModule,
  bundledRoot,
};
