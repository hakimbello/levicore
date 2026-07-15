#!/usr/bin/env node

const {
  approvePlan,
  executeApprovedPlan,
  initializeProject,
  inspectLatestRestorePoint,
  inspectLocalReadiness,
  inspectStatus,
  requestTask,
  restoreProject,
  reviewProject,
  validateProject,
} = require("../src/cli-workflow");
const { intakeRepository } = require("../src/repository-intake");
const { scanRepository } = require("../src/repository-scanner");
const { summarizeProject } = require("../src/project-summary");

function printUsage() {
  console.error("Usage: levi <init|status|readiness|request|approve|execute|validate|review|restore|scan> <repository-path> [args]");
}

async function main(argv) {
  const [command, repositoryPath, ...args] = argv;

  if (!command || !repositoryPath) {
    printUsage();
    return 1;
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    console.error(intake.error);
    return 1;
  }

  try {
    return await dispatchCommand(command, intake.path, args);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

async function dispatchCommand(command, repositoryPath, args) {
  if (command === "scan") {
    console.log(`Repository path is valid: ${repositoryPath}`);
    printJson(summarizeProject(scanRepository(repositoryPath)));
    return 0;
  }

  if (command === "init") {
    printJson(initializeProject(repositoryPath));
    return 0;
  }

  if (command === "status") {
    printJson(inspectStatus(repositoryPath));
    return 0;
  }

  if (command === "readiness") {
    console.log(inspectLocalReadiness(repositoryPath).text);
    return 0;
  }

  if (command === "request") {
    const result = requestTask(repositoryPath, args[0], args.slice(1));
    printJson(result.payload);
    return result.exitCode;
  }

  if (command === "approve") {
    printJson(approvePlan(repositoryPath));
    return 0;
  }

  if (command === "execute") {
    const execution = await executeApprovedPlan(repositoryPath);
    printJson(execution);
    return execution.status === "COMPLETED" ? 0 : 1;
  }

  if (command === "validate") {
    const validation = validateProject(repositoryPath, args);
    printJson(validation);
    return validation.status === "COMPLETED" ? 0 : 1;
  }

  if (command === "review") {
    const report = reviewProject(repositoryPath);
    printJson(report);
    return report.status === "COMPLETED" ? 0 : 1;
  }

  if (command === "restore") {
    if (args.length === 0) {
      printJson(inspectLatestRestorePoint(repositoryPath));
      return 0;
    }

    const restore = restoreProject(repositoryPath, args[0], args[1]);
    printJson(restore);
    return restore.status === "COMPLETED" ? 0 : 1;
  }

  printUsage();
  return 1;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

main(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
});
