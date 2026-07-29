export type SearchOptions = {
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
};

export type FileSearchMatch = {
  lineNumber: number;
  columnStart: number;
  preview: string;
};

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

function escapeRegex(value: string): string {
  return value.replace(REGEX_SPECIAL, "\\$&");
}

export function createSearchMatcher(query: string, options: SearchOptions): RegExp {
  const source = options.regex ? query : escapeRegex(query);
  const wrapped = options.wholeWord ? `\\b(?:${source})\\b` : source;
  return new RegExp(wrapped, options.matchCase ? "g" : "gi");
}

export function searchFileContent(
  content: string,
  matcher: RegExp,
  remainingLimit: number
): FileSearchMatch[] {
  if (remainingLimit <= 0) return [];

  const matches: FileSearchMatch[] = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length && matches.length < remainingLimit; index += 1) {
    const line = lines[index] ?? "";
    matcher.lastIndex = 0;

    let hit: RegExpExecArray | null;
    while ((hit = matcher.exec(line)) && matches.length < remainingLimit) {
      matches.push({
        lineNumber: index + 1,
        columnStart: hit.index + 1,
        preview: line.trim().slice(0, 240)
      });

      // JavaScript regular expressions can repeatedly return the same empty
      // match. Advance manually so workspace search always terminates.
      if (hit[0].length === 0) matcher.lastIndex += 1;
    }
  }

  return matches;
}
