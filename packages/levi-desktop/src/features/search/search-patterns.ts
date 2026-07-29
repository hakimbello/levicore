const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g;

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function escapeRegex(value: string): string {
  return value.replace(REGEX_SPECIAL, "\\$&");
}

/**
 * Converts the small glob dialect used by workspace search into a regular
 * expression. Supported tokens are `*`, `**`, and `?`.
 *
 * `**/` is optional so a pattern such as `**\/*.ts` also matches `index.ts`
 * at the workspace root. A single `*` never crosses a directory separator.
 */
export function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern.trim());
  let source = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;

    if (character === "*") {
      const next = normalized[index + 1];
      if (next === "*") {
        const afterGlobStar = normalized[index + 2];
        if (afterGlobStar === "/") {
          source += "(?:.*/)?";
          index += 2;
        } else {
          source += ".*";
          index += 1;
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }

    if (character === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegex(character);
  }

  return new RegExp(`^${source}$`, "i");
}

export function patternMatches(path: string, patternList: string): boolean {
  const terms = patternList
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length === 0) return true;

  const normalizedPath = normalizePath(path);
  return terms.some((term) => {
    try {
      return globToRegExp(term).test(normalizedPath);
    } catch {
      return normalizedPath.toLowerCase().includes(normalizePath(term).toLowerCase());
    }
  });
}
