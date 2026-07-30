import type { ExecutionPublicTransaction } from "../../types/levi-api";

type HistoryPanelProps = {
  transactions: ExecutionPublicTransaction[];
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function changedFiles(transaction: ExecutionPublicTransaction): string {
  const aggregateFiles = transaction.aggregateReview?.files.map((file) => file.relativePath) ?? [];
  const stepFiles = transaction.steps.map((step) => step.relativePath);
  const files = aggregateFiles.length ? aggregateFiles : stepFiles;
  return files.length ? files.join(", ") : "No files recorded";
}

export function HistoryPanel({ transactions }: HistoryPanelProps) {
  const ordered = [...transactions].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <section className="levi-history-panel" aria-label="History">
      <header className="levi-history-header">
        <div>
          <div className="levi-history-kicker">Execution session</div>
          <h1>History</h1>
          <p>Execution transactions recorded during this Levi desktop session.</p>
        </div>
      </header>

      {!ordered.length ? (
        <div className="levi-history-empty">No execution history yet. Approved execution transactions will appear here during this session.</div>
      ) : (
        <div className="levi-history-list" aria-label="Execution history entries">
          {ordered.map((transaction) => (
            <article key={transaction.transactionId} className="levi-history-entry">
              <div>
                <h2>{transaction.goal}</h2>
                <p>{changedFiles(transaction)}</p>
              </div>
              <dl className="levi-history-meta">
                <div>
                  <dt>Status</dt>
                  <dd>{transaction.status}</dd>
                </div>
                <div>
                  <dt>Progress</dt>
                  <dd>
                    {transaction.totals.appliedCount}/{transaction.totals.stepCount} files applied
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(transaction.createdAt)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
