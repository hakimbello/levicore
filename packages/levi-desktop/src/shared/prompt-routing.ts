const QUESTION_ONLY_PATTERN = /^(what|where|which|who|why|when|does|do|is|are|can you explain|explain|summarize)\b/i;
const PLANNING_PATTERN =
  /\b(add|implement|introduce|integrate|convert|migrate|replace|refactor|redesign|support|enable|build|create|plan|design|approach|how would|how should|rename|github oauth|authentication|auth|login|fastify|vue)\b/i;
const SINGLE_FILE_EDIT_PATTERN = /\b(change|modify|update|fix|rename|replace|remove|delete|make)\b/i;
const MULTI_FILE_SCOPE_PATTERN = /\b(all affected files|all files|across files|multiple files|every file|each file)\b/i;
const PATH_PATTERN =
  /(?<![\w.-])([A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)+|[A-Za-z0-9_-]+\.(?:json|scss|html|java|ya?ml|toml|[cm]?[jt]sx?|css|md|py|go|rs|cs)|\.env)(?![\w.-])/g;

function explicitPaths(prompt: string): string[] {
  return Array.from(prompt.matchAll(PATH_PATTERN), (match) => match[1] ?? "");
}

export function isPlanningPrompt(prompt: string): boolean {
  const normalized = prompt.trim();
  if (!normalized) {
    return false;
  }
  if (/^(plan|create a plan|draft a plan|design a plan)\b/i.test(normalized)) {
    return true;
  }
  if (MULTI_FILE_SCOPE_PATTERN.test(normalized)) {
    return true;
  }
  if (/^how (would|should|do|can) (you|i|we)\b/i.test(normalized) && PLANNING_PATTERN.test(normalized)) {
    return true;
  }
  if (QUESTION_ONLY_PATTERN.test(normalized) && !/^how\b/i.test(normalized)) {
    return false;
  }
  if (/\b(rename|refactor|migrate|convert)\b/i.test(normalized) && explicitPaths(normalized).length === 0) {
    return true;
  }
  if (
    SINGLE_FILE_EDIT_PATTERN.test(normalized) &&
    explicitPaths(normalized).length <= 1 &&
    !MULTI_FILE_SCOPE_PATTERN.test(normalized) &&
    !/\b(rename|refactor|migrate|convert)\b/i.test(normalized)
  ) {
    return false;
  }
  if (SINGLE_FILE_EDIT_PATTERN.test(normalized) && explicitPaths(normalized).length === 1) {
    return false;
  }
  return PLANNING_PATTERN.test(normalized);
}

export function isSingleFileEditPrompt(prompt: string): boolean {
  const normalized = prompt.trim();
  if (isPlanningPrompt(normalized)) {
    return false;
  }
  if (/\b(plan|planning|approach|how would|how should)\b/i.test(normalized)) {
    return false;
  }
  if (explicitPaths(normalized).length === 0 && /\b(auth|authentication|oauth|convert|migrate|framework|vue|fastify|express)\b/i.test(normalized)) {
    return false;
  }
  return SINGLE_FILE_EDIT_PATTERN.test(normalized) && explicitPaths(normalized).length <= 1;
}
