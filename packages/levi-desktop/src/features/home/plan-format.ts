import type { ExecutionPlan } from "../../types/levi-api";

export type PlanActionNotice = {
  planId: string;
  message: string;
};

export function formatPlanForClipboard(plan: ExecutionPlan): string {
  return [
    `Goal: ${plan.goal}`,
    `Summary: ${plan.summary}`,
    `Confidence: ${plan.confidence}`,
    `Estimated Complexity: ${plan.estimatedComplexity}`,
    `Estimated Files: ${plan.estimatedFiles}`,
    `Estimated Steps: ${plan.estimatedSteps}`,
    "",
    "Affected Files:",
    ...plan.affectedFiles.map((file) => `- ${file.relativePath} (${file.certainty}) - ${file.role}`),
    "",
    "Execution Order:",
    ...plan.executionOrder.map((step) => `${step.order}. ${step.title}: ${step.purpose} [${step.risk}]`),
    "",
    "Validation Commands:",
    ...(plan.validationCommands.length ? plan.validationCommands.map((command) => `- ${command}`) : ["- None identified"]),
    "",
    "Risks:",
    ...plan.risks.map((risk) => `- ${risk}`),
    "",
    "Assumptions:",
    ...plan.assumptions.map((assumption) => `- ${assumption}`),
    "",
    "Applicable Project Rules:",
    ...(plan.applicableProjectRules.length
      ? plan.applicableProjectRules.map((rule) => `- ${rule.text} (${rule.sourcePath}:${rule.lineStart}-${rule.lineEnd})`)
      : ["- None"])
  ].join("\n");
}
