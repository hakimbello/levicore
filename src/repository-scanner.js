const fs = require("node:fs");
const path = require("node:path");

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "coverage",
  "dist",
  "build",
  "out",
  "node_modules",
  "vendor",
]);

const SUPPORTED_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

const SECRET_NAME_PATTERNS = [
  /(^|[._-])env($|[._-])/i,
  /secret/i,
  /credential/i,
  /private[-_]?key/i,
  /api[-_]?key/i,
  /token/i,
];

function isSecretLike(filePath) {
  const name = path.basename(filePath);
  return SECRET_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function isSupportedFile(filePath) {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isBinaryFile(filePath) {
  const buffer = Buffer.alloc(512);
  const fd = fs.openSync(filePath, "r");

  try {
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);

    for (let index = 0; index < bytesRead; index += 1) {
      if (buffer[index] === 0) {
        return true;
      }
    }

    return false;
  } finally {
    fs.closeSync(fd);
  }
}

function toRelativePath(rootPath, filePath) {
  return path.relative(rootPath, filePath).split(path.sep).join("/");
}

function scanRepository(repositoryPath) {
  const rootPath = path.resolve(repositoryPath);
  const files = [];
  const skipped = [];

  function scanDirectory(directoryPath) {
    let entries;

    try {
      entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    } catch (error) {
      skipped.push({
        path: toRelativePath(rootPath, directoryPath),
        reason: "unreadable",
      });
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = toRelativePath(rootPath, entryPath);

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          skipped.push({
            path: relativePath,
            reason: "ignored-directory",
          });
          continue;
        }

        scanDirectory(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        skipped.push({
          path: relativePath,
          reason: "unsupported",
        });
        continue;
      }

      if (isSecretLike(entryPath)) {
        skipped.push({
          path: relativePath,
          reason: "secret-like",
        });
        continue;
      }

      let binary;

      try {
        binary = isBinaryFile(entryPath);
      } catch (error) {
        skipped.push({
          path: relativePath,
          reason: "unreadable",
        });
        continue;
      }

      if (binary) {
        skipped.push({
          path: relativePath,
          reason: "binary",
        });
        continue;
      }

      if (!isSupportedFile(entryPath)) {
        skipped.push({
          path: relativePath,
          reason: "unsupported",
        });
        continue;
      }

      files.push({
        path: relativePath,
      });
    }
  }

  scanDirectory(rootPath);

  return {
    root: rootPath,
    files,
    skipped,
  };
}

module.exports = {
  scanRepository,
};
