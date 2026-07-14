const fs = require("node:fs");
const path = require("node:path");

function intakeRepository(repositoryPath) {
  const resolvedPath = path.resolve(repositoryPath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      error: `Repository path does not exist: ${repositoryPath}`,
    };
  }

  const stats = fs.statSync(resolvedPath);

  if (!stats.isDirectory()) {
    return {
      ok: false,
      error: `Repository path is not a directory: ${repositoryPath}`,
    };
  }

  return {
    ok: true,
    path: resolvedPath,
  };
}

module.exports = {
  intakeRepository,
};
