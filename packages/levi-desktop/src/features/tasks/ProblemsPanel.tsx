import type { TaskProblem } from "../../types/task-api";

type ProblemsPanelProps = {
  problems: TaskProblem[];
  onOpenProblem: (problem: TaskProblem) => void;
};

function severityClass(severity: TaskProblem["severity"]): string {
  return `levi-problem-${severity}`;
}

export function ProblemsPanel({ problems, onOpenProblem }: ProblemsPanelProps) {
  if (problems.length === 0) {
    return (
      <div className="levi-bottom-placeholder-panel">
        <p className="levi-bottom-placeholder">No problems have been detected.</p>
      </div>
    );
  }

  return (
    <section className="levi-problems-panel" aria-label="Problems">
      <ul className="levi-problems-list">
        {problems.map((problem) => (
          <li key={problem.id} className={`levi-problems-item ${severityClass(problem.severity)}`}>
            <button type="button" className="levi-problems-open" onClick={() => onOpenProblem(problem)}>
              <span className="levi-problems-severity">{problem.severity}</span>
              <span className="levi-problems-message">{problem.message}</span>
              <span className="levi-problems-location">
                {problem.relativePath}:{problem.line}:{problem.column} · {problem.source}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
