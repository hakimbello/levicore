#!/usr/bin/env node

const { intakeRepository } = require("../src/repository-intake");

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
  return 0;
}

process.exitCode = main(process.argv.slice(2));
