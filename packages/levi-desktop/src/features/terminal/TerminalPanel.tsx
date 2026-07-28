import { lazy, useState } from "react";
import { Icon } from "../../components/Icon";
import { LazySurface } from "../../components/LazySurface";
import type { SelectedProject } from "../../types/levi-api";

const TerminalHost = lazy(async () => {
  const module = await import("./TerminalHost");
  return { default: module.TerminalHost };
});

type TerminalPanelProps = {
  selectedProject: SelectedProject | null;
};

export function TerminalPanel({ selectedProject }: TerminalPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [cwd, setCwd] = useState<string | null>(null);

  return (
    <section className={expanded ? "levi-terminal levi-terminal-expanded" : "levi-terminal"} aria-label="Terminal">
      <div className="levi-terminal-bar">
        <div>
          <div className="levi-terminal-title">Terminal</div>
          <div className="levi-terminal-cwd">{selectedProject?.name ?? cwd ?? "LeviCore"}</div>
        </div>
        <button
          type="button"
          className="levi-terminal-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <Icon name="terminal" />
          <span>{expanded ? "Collapse" : "Expand"}</span>
        </button>
      </div>
      {expanded ? (
        <LazySurface label="Terminal">
          <TerminalHost selectedProject={selectedProject} onCwdChange={setCwd} />
        </LazySurface>
      ) : null}
    </section>
  );
}
