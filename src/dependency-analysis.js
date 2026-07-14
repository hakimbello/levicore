const fs = require("node:fs");
const path = require("node:path");

const UNKNOWN = "UNKNOWN";

function analyzeDependencyManifest(rootPath, relativePath) {
  const normalizedPath = relativePath.split(path.sep).join("/");
  const manifestPath = path.join(rootPath, relativePath);
  const manifestName = path.basename(normalizedPath);

  if (manifestName === "package.json") {
    return analyzePackageJson(manifestPath, normalizedPath);
  }

  if (manifestName === "requirements.txt") {
    return analyzeRequirementsTxt(manifestPath, normalizedPath);
  }

  return {
    source: normalizedPath,
    dependencies: UNKNOWN,
  };
}

function analyzePackageJson(manifestPath, source) {
  let packageJson;

  try {
    packageJson = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {
      source,
      error: `Invalid dependency manifest: ${source}`,
    };
  }

  const dependencies = [];

  collectPackageDependencies(dependencies, packageJson.dependencies, "dependencies", source);
  collectPackageDependencies(dependencies, packageJson.devDependencies, "devDependencies", source);
  collectPackageDependencies(dependencies, packageJson.optionalDependencies, "optionalDependencies", source);
  collectPackageDependencies(dependencies, packageJson.peerDependencies, "peerDependencies", source);

  return {
    source,
    dependencies: dependencies.length > 0 ? dependencies : UNKNOWN,
  };
}

function collectPackageDependencies(results, dependencyGroup, groupName, source) {
  if (!dependencyGroup || typeof dependencyGroup !== "object" || Array.isArray(dependencyGroup)) {
    return;
  }

  for (const [name, version] of Object.entries(dependencyGroup)) {
    results.push({
      name,
      version: String(version),
      group: groupName,
      evidence: {
        source,
        signal: `${groupName}.${name}`,
      },
    });
  }
}

function analyzeRequirementsTxt(manifestPath, source) {
  let contents;

  try {
    contents = fs.readFileSync(manifestPath, "utf8");
  } catch (error) {
    return {
      source,
      error: `Unreadable dependency manifest: ${source}`,
    };
  }

  const dependencies = contents
    .split(/\r?\n/)
    .map((line, index) => parseRequirementLine(line, index + 1, source))
    .filter(Boolean);

  return {
    source,
    dependencies: dependencies.length > 0 ? dependencies : UNKNOWN,
  };
}

function parseRequirementLine(line, lineNumber, source) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) {
    return null;
  }

  const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*(.*)$/);

  if (!match) {
    return null;
  }

  return {
    name: match[1],
    version: match[2] ? match[2].trim() : UNKNOWN,
    group: "requirements",
    evidence: {
      source,
      signal: `line ${lineNumber}`,
    },
  };
}

module.exports = {
  analyzeDependencyManifest,
};
