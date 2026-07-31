import { useMemo, useState } from "react";
import type { TaskOutputEntry, TaskOutputSource } from "../../types/task-api";

type OutputPanelProps = {
  entries: TaskOutputEntry[];
};

const SOURCES: Array<TaskOutputSource | "all"> = ["all", "task", "levi", "git", "debugger", "extension"];

export function OutputPanel({ entries }: OutputPanelProps) {
  const [sourceFilter, setSourceFilter] = useState<TaskOutputSource | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (sourceFilter !== "all" && entry.source !== sourceFilter) return false;
      if (query && !entry.text.toLowerCase().includes(query.toLowerCase()) && !entry.channel.toLowerCase().includes(query.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [entries, query, sourceFilter]);

  return (
    <section className="levi-output-panel" aria-label="Output">
      <div className="levi-output-toolbar">
        <label className="levi-output-filter">
          Source
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as TaskOutputSource | "all")}>
            {SOURCES.map((source) => (
              <option key={source} value={source}>
                {source === "all" ? "All Sources" : source}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter output"
          aria-label="Filter output"
        />
      </div>
      <div className="levi-output-stream">
        {filtered.length === 0 ? <p className="levi-bottom-placeholder">No output for the current filter.</p> : null}
        {filtered.map((entry) => (
          <pre key={entry.id} className={`levi-output-entry levi-output-${entry.source}`}>
            [{entry.source}/{entry.channel}] {entry.text}
          </pre>
        ))}
      </div>
    </section>
  );
}
