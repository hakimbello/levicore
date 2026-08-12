export type PromptIntent = "question" | "plan" | "edit" | "build";

const QUESTION_ONLY_PATTERN = /^(what|where|which|who|why|when|does|do|is|are|can you explain|explain|summarize)\b/i;
const EXPLICIT_PLAN_PATTERN =
  /^(plan|create a plan|draft a plan|make a plan|design a plan)\b|\b(plan|planning|approach|architecture|implementation plan)\b|\bhow (would|should|do|can) (you|i|we)\b/i;
const BUILD_VERB_PATTERN = /^(build|create|make|implement|add|set up|setup|fix)\b|\b(build|create|make|implement|add|set up|setup)\b/i;
const BUILD_TARGET_PATTERN =
  /\b(app|application|website|site|dashboard|page|auth|authentication|oauth|login|project|feature|component|form|tracker|calculator|todo|weather|fitness)\b/i;
const SINGLE_FILE_EDIT_PATTERN = /\b(change|modify|update|fix|rename|replace|remove|delete)\b/i;
const MULTI_FILE_SCOPE_PATTERN = /\b(all affected files|all files|across files|multiple files|every file|each file)\b/i;
const UNSAFE_DESTRUCTIVE_SCOPE_PATTERN = /\b(everything|entire|whole)\b|\b(c drive|c:\\|root drive|system32)\b/i;
const SHELL_COMMAND_PATTERN = /\b(powershell|pwsh|cmd|bash|remove-item|rm\s+-|del\s+\/|format\s+|shutdown)\b/i;
const PATH_PATTERN =
  /(?<![\w.-])([A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)+|[A-Za-z0-9_-]+\.(?:json|scss|html|java|ya?ml|toml|[cm]?[jt]sx?|css|md|py|go|rs|cs)|\.env)(?![\w.-])/g;

function explicitPaths(prompt: string): string[] {
  return Array.from(prompt.matchAll(PATH_PATTERN), (match) => match[1] ?? "");
}

function isQuestionPrompt(prompt: string): boolean {
  return QUESTION_ONLY_PATTERN.test(prompt) && !/^how\b/i.test(prompt);
}

function isExplicitPlanPrompt(prompt: string): boolean {
  return EXPLICIT_PLAN_PATTERN.test(prompt);
}

function isBoundedEditPrompt(prompt: string): boolean {
  const paths = explicitPaths(prompt);
  if (!SINGLE_FILE_EDIT_PATTERN.test(prompt)) {
    return false;
  }
  if (MULTI_FILE_SCOPE_PATTERN.test(prompt) || UNSAFE_DESTRUCTIVE_SCOPE_PATTERN.test(prompt) || SHELL_COMMAND_PATTERN.test(prompt)) {
    return false;
  }
  if (paths.length === 1) {
    return true;
  }
  if (paths.length > 1) {
    return false;
  }
  return /\b(change|modify|update|replace|fix)\b/i.test(prompt) && !BUILD_TARGET_PATTERN.test(prompt);
}

function isBuildPrompt(prompt: string): boolean {
  if (!BUILD_VERB_PATTERN.test(prompt)) {
    return false;
  }
  if (SHELL_COMMAND_PATTERN.test(prompt) || UNSAFE_DESTRUCTIVE_SCOPE_PATTERN.test(prompt)) {
    return false;
  }
  if (MULTI_FILE_SCOPE_PATTERN.test(prompt)) {
    return true;
  }
  if (/\bfix this project\b/i.test(prompt)) {
    return true;
  }
  return BUILD_TARGET_PATTERN.test(prompt) && !isBoundedEditPrompt(prompt);
}

export function classifyPromptIntent(prompt: string): PromptIntent {
  const normalized = prompt.trim();
  if (!normalized) {
    return "question";
  }
  if (MULTI_FILE_SCOPE_PATTERN.test(normalized) || /\b(rename|refactor|migrate|convert)\b/i.test(normalized) && explicitPaths(normalized).length === 0) {
    return "plan";
  }
  if (isExplicitPlanPrompt(normalized)) {
    return "plan";
  }
  if (isQuestionPrompt(normalized)) {
    return "question";
  }
  if (isBoundedEditPrompt(normalized)) {
    return "edit";
  }
  if (isBuildPrompt(normalized)) {
    return "build";
  }
  return "question";
}

export function isPlanningPrompt(prompt: string): boolean {
  return classifyPromptIntent(prompt) === "plan";
}

export function isBuildPromptIntent(prompt: string): boolean {
  return classifyPromptIntent(prompt) === "build";
}

export function isSingleFileEditPrompt(prompt: string): boolean {
  return classifyPromptIntent(prompt) === "edit";
}
