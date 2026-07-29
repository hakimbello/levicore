import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceTreeNode } from "../../types/workspace-tree-api";
import "../../styles/search-panel.css";

type SearchMatch = {
  id: string;
  relativePath: string;
  lineNumber: number;
  columnStart: number;
  preview: string;
};

type SearchPanelProps = {
  enabled: boolean;
  focusSignal: number;
  onOpenMatch: (relativePath: string, lineNumber: number) => Promise<void>;
};

const MAX_RESULTS = 2_000;
const SEARCH_DELAY_MS = 180;

function flattenFiles(nodes: WorkspaceTreeNode[]): string[] {
  const files: string[] = [];
  const visit = (items: WorkspaceTreeNode[]) => {
    for (const item of items) {
      if (item.kind === "file") files.push(item.relativePath);
      else if (item.children) visit(item.children);
    }
  };
  visit(nodes);
  return files;
}

function patternMatches(path: string, pattern: string): boolean {
  const terms = pattern.split(",").map((term) => term.trim()).filter(Boolean);
  if (terms.length === 0) return true;
  return terms.some((term) => {
    const escaped = term.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
    try { return new RegExp(`^${escaped}$`, "i").test(path) || new RegExp(escaped, "i").test(path); }
    catch { return path.toLowerCase().includes(term.toLowerCase()); }
  });
}

function createMatcher(query: string, matchCase: boolean, wholeWord: boolean, regex: boolean): RegExp {
  const source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(wholeWord ? `\\b(?:${source})\\b` : source, matchCase ? "g" : "gi");
}

export function SearchPanel({ enabled, focusSignal, onOpenMatch }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [includePattern, setIncludePattern] = useState("");
  const [excludePattern, setExcludePattern] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    if (enabled) inputRef.current?.focus();
  }, [enabled, focusSignal]);

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!enabled || query.length === 0) {
      setMatches([]);
      setSearching(false);
      setError(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        setError(null);
        const started = performance.now();
        try {
          const matcher = createMatcher(query, matchCase, wholeWord, regex);
          const tree = await window.levi.workspace.listTree();
          const files = flattenFiles(tree.nodes).filter((path) =>
            patternMatches(path, includePattern) && (!excludePattern || !patternMatches(path, excludePattern))
          );
          const next: SearchMatch[] = [];

          for (const relativePath of files) {
            if (generation !== generationRef.current || next.length >= MAX_RESULTS) return;
            try {
              const file = await window.levi.workspace.readPath({ relativePath });
              const lines = file.content.split(/\r?\n/);
              for (let index = 0; index < lines.length && next.length < MAX_RESULTS; index += 1) {
                matcher.lastIndex = 0;
                let hit: RegExpExecArray | null;
                while ((hit = matcher.exec(lines[index] ?? "")) && next.length < MAX_RESULTS) {
                  next.push({
                    id: `${relativePath}:${index + 1}:${hit.index}`,
                    relativePath,
                    lineNumber: index + 1,
                    columnStart: hit.index + 1,
                    preview: (lines[index] ?? "").trim().slice(0, 240)
                  });
                  if (hit[0].length === 0) matcher.lastIndex += 1;
                }
              }
            } catch {
              // Skip binary, oversized, deleted, and unreadable files.
            }
          }

          if (generation !== generationRef.current) return;
          setMatches(next);
          setSelectedIndex(0);
          setDuration(Math.round(performance.now() - started));
        } catch (searchError) {
          if (generation !== generationRef.current) return;
          setMatches([]);
          setError(searchError instanceof Error ? searchError.message : "Search failed.");
        } finally {
          if (generation === generationRef.current) setSearching(false);
        }
      })();
    }, SEARCH_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [enabled, excludePattern, includePattern, matchCase, query, regex, wholeWord]);

  useEffect(() => {
    function handleKeys(event: KeyboardEvent) {
      if (!enabled) return;
      if (event.key === "Escape") {
        setQuery("");
        inputRef.current?.focus();
      } else if (event.key === "F4" && matches.length > 0) {
        event.preventDefault();
        const next = (selectedIndex + (event.shiftKey ? -1 : 1) + matches.length) % matches.length;
        setSelectedIndex(next);
        void onOpenMatch(matches[next]!.relativePath, matches[next]!.lineNumber);
      }
    }
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [enabled, matches, onOpenMatch, selectedIndex]);

  const grouped = useMemo(() => {
    const groups = new Map<string, SearchMatch[]>();
    for (const match of matches) groups.set(match.relativePath, [...(groups.get(match.relativePath) ?? []), match]);
    return Array.from(groups.entries());
  }, [matches]);

  return (
    <section className="levi-search-panel" aria-label="Workspace search">
      <header className="levi-search-header">
        <h1>Search</h1>
        <span>{searching ? "Searching…" : `${matches.length} matches in ${grouped.length} files · ${duration} ms`}</span>
      </header>
      <div className="levi-search-controls">
        <div className="levi-search-query-row">
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspace (Ctrl+Shift+F)" aria-label="Search workspace" />
          <button type="button" aria-pressed={matchCase} onClick={() => setMatchCase((value) => !value)} title="Match case">Aa</button>
          <button type="button" aria-pressed={wholeWord} onClick={() => setWholeWord((value) => !value)} title="Whole word">ab</button>
          <button type="button" aria-pressed={regex} onClick={() => setRegex((value) => !value)} title="Regular expression">.*</button>
        </div>
        <input value={includePattern} onChange={(event) => setIncludePattern(event.target.value)} placeholder="Files to include, e.g. src/**/*.ts" aria-label="Files to include" />
        <input value={excludePattern} onChange={(event) => setExcludePattern(event.target.value)} placeholder="Files to exclude, e.g. **/*.test.ts" aria-label="Files to exclude" />
      </div>
      {error ? <div className="levi-search-error" role="alert">{error}</div> : null}
      <div className="levi-search-results" role="tree" aria-label="Search results">
        {grouped.map(([relativePath, fileMatches]) => (
          <div key={relativePath} className="levi-search-file" role="treeitem" aria-expanded="true">
            <div className="levi-search-file-heading"><strong>{relativePath.split("/").pop()}</strong><span>{relativePath} · {fileMatches.length}</span></div>
            {fileMatches.map((match) => {
              const index = matches.findIndex((candidate) => candidate.id === match.id);
              return (
                <button
                  key={match.id}
                  type="button"
                  className={index === selectedIndex ? "levi-search-match levi-search-match-selected" : "levi-search-match"}
                  onClick={() => { setSelectedIndex(index); void onOpenMatch(match.relativePath, match.lineNumber); }}
                >
                  <span className="levi-search-line">{match.lineNumber}:{match.columnStart}</span>
                  <span>{match.preview || "(empty line)"}</span>
                </button>
              );
            })}
          </div>
        ))}
        {!searching && query && matches.length === 0 && !error ? <p className="levi-search-empty">No matches found.</p> : null}
      </div>
    </section>
  );
}
