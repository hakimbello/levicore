import { useEffect, useMemo, useState } from "react";
import type { ProjectRule, ProjectRulesListResult, WorkspaceOpenFileResult } from "../../types/levi-api";
import { Icon } from "../../components/Icon";

type ProjectRulesPanelProps = {
  onOpenRuleSource: (result: WorkspaceOpenFileResult) => void;
};

function emptyRulesResult(): ProjectRulesListResult {
  return {
    status: {
      state: "idle",
      guidanceFileCount: 0,
      activeRuleCount: 0,
      conflictCount: 0,
      suspiciousCount: 0,
      timings: {
        discoveryMs: 0,
        extractionMs: 0,
        enrichmentMs: 0,
        activeContextMs: 0
      }
    },
    sources: [],
    rules: [],
    conflicts: [],
    design: {
      tokens: [],
      components: [],
      conventions: [],
      sources: []
    },
    suspiciousRules: []
  };
}

function statusText(result: ProjectRulesListResult): string {
  if (result.status.state === "scanning") return "Scanning project rules";
  if (result.status.state === "enriching") return "Enriching rule summary";
  if (result.status.state === "ready-without-model-enrichment") return "Rules ready without model enrichment";
  if (result.status.state === "ready") return "Rules ready";
  if (result.status.state === "failed") return result.status.error ?? "Rule scan failed";
  return "No rule scan yet";
}

function ruleSummary(result: ProjectRulesListResult): string {
  if (!result.rules.length) {
    return "No explicit project guidance found. Levi will rely on repository conventions and your current instructions.";
  }
  return [
    `Project rules: ${result.status.activeRuleCount}`,
    `Guidance files: ${result.status.guidanceFileCount}`,
    `Conflicts: ${result.status.conflictCount}`,
    "",
    ...result.rules
      .filter((rule) => !rule.suspicious)
      .slice(0, 80)
      .map((rule) => `- ${rule.text} (${rule.strength}, ${rule.category}) ${rule.sourcePath}:${rule.lineStart}-${rule.lineEnd}; scope ${rule.scopePath}`)
  ].join("\n");
}

function groupRules(rules: ProjectRule[]): Array<[string, ProjectRule[]]> {
  const groups = new Map<string, ProjectRule[]>();
  for (const rule of rules.filter((item) => !item.suspicious)) {
    groups.set(rule.category, [...(groups.get(rule.category) ?? []), rule]);
  }
  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

export function ProjectRulesPanel({ onOpenRuleSource }: ProjectRulesPanelProps) {
  const [result, setResult] = useState<ProjectRulesListResult>(emptyRulesResult);
  const [copyLabel, setCopyLabel] = useState("Copy Rule Summary");
  const groupedRules = useMemo(() => groupRules(result.rules), [result.rules]);

  async function loadRules(refresh = false) {
    const next = refresh ? await window.levi.rules.refresh() : await window.levi.rules.list();
    setResult(next);
  }

  useEffect(() => {
    void loadRules();
    return window.levi.rules.onEvent((event) => {
      if (event.type === "status") {
        setResult((current) => ({ ...current, status: event.status }));
      }
      if (event.type === "updated") {
        setResult(event.result);
      }
    });
  }, []);

  async function copySummary() {
    await navigator.clipboard?.writeText(ruleSummary(result));
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy Rule Summary"), 1600);
  }

  async function openRule(ruleId: string) {
    const file = await window.levi.rules.openSource({ ruleId });
    onOpenRuleSource(file);
  }

  return (
    <section className="levi-rules-panel" aria-label="Project Rules">
      <header className="levi-rules-header">
        <div>
          <div className="levi-rules-kicker">Workspace intelligence</div>
          <h1>Project Rules</h1>
          <p>{statusText(result)}</p>
        </div>
        <div className="levi-rules-actions">
          <button type="button" className="levi-secondary-button" onClick={() => void loadRules(true)}>
            <Icon name="refresh" />
            <span>Refresh Rules</span>
          </button>
          <button type="button" className="levi-secondary-button" onClick={() => void copySummary()}>
            {copyLabel}
          </button>
        </div>
      </header>

      <div className="levi-rules-stats" aria-label="Project rule status">
        <div>
          <span>Guidance Files</span>
          <strong>{result.status.guidanceFileCount}</strong>
        </div>
        <div>
          <span>Active Rules</span>
          <strong>{result.status.activeRuleCount}</strong>
        </div>
        <div>
          <span>Conflicts</span>
          <strong>{result.status.conflictCount}</strong>
        </div>
        <div>
          <span>Suspicious</span>
          <strong>{result.status.suspiciousCount}</strong>
        </div>
      </div>

      <div className="levi-rules-timings">
        Discovery {result.status.timings.discoveryMs}ms · extraction {result.status.timings.extractionMs}ms · enrichment{" "}
        {result.status.timings.enrichmentMs}ms
      </div>

      {!result.rules.length ? (
        <div className="levi-rules-empty">No explicit project guidance found. Levi will rely on repository conventions and your current instructions.</div>
      ) : null}

      {result.conflicts.length ? (
        <section className="levi-rules-conflicts" aria-label="Rule Conflicts">
          <h2>Rule Conflicts</h2>
          {result.conflicts.map((conflict) => (
            <div key={conflict.conflictId} className="levi-rule-conflict">
              <strong>{conflict.category}</strong>
              <span>{conflict.summary}</span>
              <small>Scope: {conflict.scopePath}</small>
            </div>
          ))}
        </section>
      ) : null}

      {result.suspiciousRules.length ? (
        <section className="levi-rules-conflicts" aria-label="Suspicious Instructions">
          <h2>Suspicious Instructions</h2>
          {result.suspiciousRules.map((rule) => (
            <div key={rule.ruleId} className="levi-rule-conflict">
              <strong>{rule.sourcePath}:{rule.lineStart}</strong>
              <span>{rule.text}</span>
            </div>
          ))}
        </section>
      ) : null}

      {groupedRules.map(([category, rules]) => (
        <section key={category} className="levi-rule-group">
          <h2>{category}</h2>
          <div className="levi-rule-list">
            {rules.map((rule) => (
              <article key={rule.ruleId} className="levi-rule-card">
                <div>
                  <strong>{rule.text}</strong>
                  <span>
                    {rule.sourcePath}:{rule.lineStart}-{rule.lineEnd}
                  </span>
                </div>
                <div className="levi-rule-meta">
                  <em>{rule.strength}</em>
                  <span>scope {rule.scopePath}</span>
                  <button type="button" className="levi-secondary-button" onClick={() => void openRule(rule.ruleId)}>
                    View Source
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {result.design.tokens.length || result.design.components.length || result.design.conventions.length ? (
        <section className="levi-rule-group">
          <h2>Design Intelligence</h2>
          <div className="levi-design-evidence">
            {result.design.tokens.slice(0, 12).map((token) => (
              <code key={`${token.sourcePath}-${token.lineStart}-${token.name}`}>
                {token.name}: {token.value}
              </code>
            ))}
            {result.design.components.slice(0, 8).map((component) => (
              <span key={`${component.sourcePath}-${component.name}`}>
                {component.name} · {component.kind}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

