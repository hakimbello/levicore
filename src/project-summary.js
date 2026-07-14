const path = require("node:path");
const { analyzeDependencyManifest } = require("./dependency-analysis");

const UNKNOWN = "UNKNOWN";
const DEPENDENCY_MANIFESTS = new Set(["package.json", "requirements.txt"]);

function summarizeProject(scanResult) {
  return {
    root: scanResult.root,
    files: scanResult.files,
    skipped: scanResult.skipped,
    languages: scanResult.detected.languages,
    frameworks: scanResult.detected.frameworks,
    packageManagers: scanResult.detected.packageManagers,
    entryPoints: scanResult.detected.entryPoints,
    tests: scanResult.detected.tests,
    majorDirectories: summarizeMajorDirectories(scanResult.files),
    dependencies: summarizeDependencies(scanResult),
  };
}

function summarizeMajorDirectories(files) {
  const directories = new Map();

  for (const file of files) {
    const parts = file.path.split("/");

    if (parts.length < 2) {
      continue;
    }

    const directory = parts[0];

    if (!directories.has(directory)) {
      directories.set(directory, []);
    }

    directories.get(directory).push({
      source: file.path,
      signal: "top-level directory contains supported file",
    });
  }

  if (directories.size === 0) {
    return UNKNOWN;
  }

  return Array.from(directories.entries()).map(([name, evidence]) => ({
    name,
    evidence,
  }));
}

function summarizeDependencies(scanResult) {
  const manifests = scanResult.files.filter((file) => DEPENDENCY_MANIFESTS.has(path.basename(file.path)));

  if (manifests.length === 0) {
    return UNKNOWN;
  }

  return manifests.map((manifest) => analyzeDependencyManifest(scanResult.root, manifest.path));
}

module.exports = {
  summarizeProject,
};
