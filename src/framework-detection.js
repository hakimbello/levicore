const fs = require("node:fs");
const path = require("node:path");

const UNKNOWN = "UNKNOWN";

const LANGUAGE_EXTENSIONS = new Map([
  [".js", "JavaScript"],
  [".jsx", "JavaScript"],
  [".mjs", "JavaScript"],
  [".ts", "TypeScript"],
  [".tsx", "TypeScript"],
  [".py", "Python"],
  [".rb", "Ruby"],
  [".rs", "Rust"],
  [".go", "Go"],
  [".java", "Java"],
  [".cs", "C#"],
  [".c", "C"],
  [".cc", "C++"],
  [".cpp", "C++"],
  [".h", "C/C++ Header"],
  [".hpp", "C++ Header"],
  [".css", "CSS"],
  [".html", "HTML"],
]);

const PACKAGE_MANAGER_FILES = new Map([
  ["package-lock.json", "npm"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "Yarn"],
  ["requirements.txt", "pip"],
  ["pyproject.toml", "Python packaging"],
  ["Pipfile", "Pipenv"],
  ["poetry.lock", "Poetry"],
]);

function addDetected(map, name, evidence) {
  if (!map.has(name)) {
    map.set(name, []);
  }

  map.get(name).push(evidence);
}

function readPackageJson(rootPath, relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootPath, relativePath), "utf8"));
  } catch (error) {
    return null;
  }
}

function hasDependency(packageJson, dependencyName) {
  return Boolean(
    (packageJson.dependencies && packageJson.dependencies[dependencyName]) ||
      (packageJson.devDependencies && packageJson.devDependencies[dependencyName])
  );
}

function detectFromPackageJson(rootPath, file, detections) {
  if (file.path !== "package.json") {
    return;
  }

  const packageJson = readPackageJson(rootPath, file.path);

  if (!packageJson) {
    return;
  }

  if (hasDependency(packageJson, "next")) {
    addDetected(detections.frameworks, "Next.js", {
      source: file.path,
      signal: "package.json dependency: next",
    });
  }

  if (hasDependency(packageJson, "react")) {
    addDetected(detections.frameworks, "React", {
      source: file.path,
      signal: "package.json dependency: react",
    });
  }

  if (typeof packageJson.main === "string") {
    addDetected(detections.entryPoints, packageJson.main, {
      source: file.path,
      signal: "package.json main",
    });
  }

  if (packageJson.scripts && typeof packageJson.scripts.test === "string") {
    addDetected(detections.tests, "npm test", {
      source: file.path,
      signal: "package.json scripts.test",
    });
  }
}

function detectFrameworksFromFiles(file, detections) {
  const name = path.basename(file.path);

  if (name === "next.config.js" || name === "next.config.mjs") {
    addDetected(detections.frameworks, "Next.js", {
      source: file.path,
      signal: name,
    });
  }

  if (name === "manage.py") {
    addDetected(detections.frameworks, "Django", {
      source: file.path,
      signal: "manage.py",
    });
  }
}

function detectEntryPointsAndTests(file, detections) {
  const normalizedPath = file.path;
  const name = path.basename(normalizedPath);

  if (name === "index.js" || name === "server.js" || name === "app.js" || name === "main.py") {
    addDetected(detections.entryPoints, normalizedPath, {
      source: normalizedPath,
      signal: "entry point filename",
    });
  }

  if (
    normalizedPath.startsWith("test/") ||
    normalizedPath.startsWith("tests/") ||
    /\.test\.[cm]?[jt]sx?$/.test(name) ||
    /_test\.py$/.test(name) ||
    /^test_.*\.py$/.test(name)
  ) {
    addDetected(detections.tests, normalizedPath, {
      source: normalizedPath,
      signal: "test filename or directory",
    });
  }
}

function detectProjectSignals(scanResult) {
  const detections = {
    languages: new Map(),
    frameworks: new Map(),
    packageManagers: new Map(),
    entryPoints: new Map(),
    tests: new Map(),
  };

  for (const file of scanResult.files) {
    const extension = path.extname(file.path).toLowerCase();
    const language = LANGUAGE_EXTENSIONS.get(extension);
    const packageManager = PACKAGE_MANAGER_FILES.get(path.basename(file.path));

    if (language) {
      addDetected(detections.languages, language, {
        source: file.path,
        signal: `extension ${extension}`,
      });
    }

    if (packageManager) {
      addDetected(detections.packageManagers, packageManager, {
        source: file.path,
        signal: path.basename(file.path),
      });
    }

    detectFromPackageJson(scanResult.root, file, detections);
    detectFrameworksFromFiles(file, detections);
    detectEntryPointsAndTests(file, detections);
  }

  return {
    languages: formatDetections(detections.languages),
    frameworks: formatDetections(detections.frameworks),
    packageManagers: formatDetections(detections.packageManagers),
    entryPoints: formatDetections(detections.entryPoints),
    tests: formatDetections(detections.tests),
  };
}

function formatDetections(detections) {
  if (detections.size === 0) {
    return UNKNOWN;
  }

  return Array.from(detections.entries()).map(([name, evidence]) => ({
    name,
    evidence,
  }));
}

module.exports = {
  detectProjectSignals,
};
