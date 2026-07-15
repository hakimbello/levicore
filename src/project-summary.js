const path = require("node:path");
const { analyzeDependencyManifest } = require("./dependency-analysis");

const UNKNOWN = "UNKNOWN";
const DEPENDENCY_MANIFESTS = new Set(["package.json", "requirements.txt"]);

function summarizeProject(scanResult) {
  const projectFiles = withoutLeviRuntimeFiles(scanResult.files);
  const skippedFiles = withoutLeviRuntimeFiles(scanResult.skipped);

  return {
    root: scanResult.root,
    files: projectFiles,
    skipped: skippedFiles,
    languages: scanResult.detected.languages,
    frameworks: scanResult.detected.frameworks,
    packageManagers: scanResult.detected.packageManagers,
    entryPoints: scanResult.detected.entryPoints,
    tests: scanResult.detected.tests,
    majorDirectories: summarizeMajorDirectories(projectFiles),
    dependencies: summarizeDependencies({
      ...scanResult,
      files: projectFiles,
    }),
    structuralIndex: scanResult.structuralIndex || UNKNOWN,
    structuralRelationships: summarizeStructuralRelationships(scanResult.structuralIndex),
  };
}

function summarizeStructuralRelationships(structuralIndex) {
  if (!structuralIndex || !Array.isArray(structuralIndex.relationships) || structuralIndex.relationships.length === 0) {
    return UNKNOWN;
  }

  const counts = new Map();

  for (const relationship of structuralIndex.relationships) {
    if (!relationship || typeof relationship.relationshipType !== "string") {
      continue;
    }

    if (!counts.has(relationship.relationshipType)) {
      counts.set(relationship.relationshipType, {
        name: relationship.relationshipType,
        count: 0,
        evidence: [],
      });
    }

    const entry = counts.get(relationship.relationshipType);
    entry.count += 1;

    if (relationship.evidence && typeof relationship.evidence.source === "string") {
      entry.evidence.push({
        source: relationship.evidence.source,
        signal: relationship.evidence.signal || relationship.relationshipType,
      });
    }
  }

  if (counts.size === 0) {
    return UNKNOWN;
  }

  return Array.from(counts.values())
    .map((entry) => ({
      ...entry,
      evidence: entry.evidence.slice(0, 10),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
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

function withoutLeviRuntimeFiles(files) {
  if (!Array.isArray(files)) {
    return [];
  }

  return files.filter((file) => !isLeviRuntimePath(file.path));
}

function isLeviRuntimePath(filePath) {
  if (typeof filePath !== "string") {
    return false;
  }

  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[0] === ".levi";
}

module.exports = {
  summarizeProject,
};
