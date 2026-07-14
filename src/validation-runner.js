const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function runValidation(options) {
  validateOptions(options);

  const repositoryRoot = path.resolve(options.repositoryRoot);
  const results = options.commands.map((command) => runCommand(repositoryRoot, command));
  const failed = results.some((result) => result.exitCode !== 0);

  return {
    status: failed ? "FAILED" : "COMPLETED",
    results,
  };
}

function runCommand(repositoryRoot, command) {
  const result = spawnSync(command, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: true,
  });

  return {
    command,
    cwd: repositoryRoot,
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
  };
}

function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Validation runner options are required.");
  }

  if (typeof options.repositoryRoot !== "string" || options.repositoryRoot.trim() === "") {
    throw new Error("Validation runner repositoryRoot is required.");
  }

  const repositoryRoot = path.resolve(options.repositoryRoot);

  if (!fs.existsSync(repositoryRoot) || !fs.statSync(repositoryRoot).isDirectory()) {
    throw new Error("Validation runner repositoryRoot must be an existing directory.");
  }

  if (!Array.isArray(options.commands) || options.commands.length === 0) {
    throw new Error("Validation runner commands are required.");
  }

  for (const command of options.commands) {
    if (typeof command !== "string" || command.trim() === "") {
      throw new Error("Validation runner command must be a non-empty string.");
    }
  }
}

module.exports = {
  runValidation,
};
