#!/usr/bin/env node

const { intakeRepository } = require("../src/repository-intake");
const { scanRepository } = require("../src/repository-scanner");
const { summarizeProject } = require("../src/project-summary");

function printUsage() {
  console.error("Usage: levi scan <repository-path>");
}

function main(argv) {
  const [command, repositoryPath] = argv;

  if (command !== "scan" || !repositoryPath || argv.length !== 2) {
    printUsage();
    return 1;
  }

  const result = intakeRepository(repositoryPath);

  if (!result.ok) {
    console.error(result.error);
    return 1;
  }

  console.log(`Repository path is valid: ${result.path}`);
  const scan = scanRepository(result.path);
  const summary = summarizeProject(scan);
  console.log(JSON.stringify(summary, null, 2));
  return 0;
}

process.exitCode = main(process.argv.slice(2));
