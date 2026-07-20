"use strict";

const fs = require("node:fs");
const path = require("node:path");

const extensionRoot = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(extensionRoot, "..", "..", "src");
const targetRoot = path.resolve(extensionRoot, "vendor", "levi-core");

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, targetPath);
    else if (entry.isFile() && entry.name.endsWith(".js")) fs.copyFileSync(sourcePath, targetPath);
  }
}

if (!fs.existsSync(sourceRoot)) {
  console.error(`Levi runtime source not found: ${sourceRoot}`);
  process.exit(1);
}

fs.rmSync(targetRoot, { recursive: true, force: true });
copyDirectory(sourceRoot, targetRoot);

const manifest = {
  bundledAt: new Date().toISOString(),
  sourceRoot: "src",
  targetRoot: "vendor/levi-core",
};
fs.writeFileSync(path.join(targetRoot, "bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Bundled Levi runtime from ${sourceRoot} to ${targetRoot}`);
