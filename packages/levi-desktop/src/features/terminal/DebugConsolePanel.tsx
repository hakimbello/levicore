import type { DebugConsoleEntry, DebugEvaluateResult } from "../debugger/DebugEvents";

type DebugConsolePanelProps = {
  consoleEntries: DebugConsoleEntry[];
  lastEvaluation?: DebugEvaluateResult;
  onEvaluate: (expression: string) => Promise<unknown>;
  onClearConsole: () => Promise<void>;
};

export function DebugConsolePanel({ consoleEntries, lastEvaluation, onEvaluate, onClearConsole }: DebugConsolePanelProps) {
  return (
    <section className="levi-bottom-debug-console" aria-label="Debug Console">
      <div className="levi-bottom-debug-toolbar">
        <form
          className="levi-bottom-debug-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const input = form.elements.namedItem("expression") as HTMLInputElement | null;
            const expression = input?.value.trim();
            if (!expression) return;
            void onEvaluate(expression).then(() => {
              if (input) input.value = "";
            });
          }}
        >
          <input name="expression" type="text" placeholder="Evaluate expression" aria-label="Debug console expression" />
          <button type="submit">Evaluate</button>
        </form>
        <button type="button" onClick={() => void onClearConsole()}>
          Clear
        </button>
      </div>
      {lastEvaluation ? (
        <pre className="levi-bottom-debug-result">
          {lastEvaluation.error ? lastEvaluation.error : lastEvaluation.result}
        </pre>
      ) : null}
      <div className="levi-bottom-debug-output">
        {consoleEntries.length === 0 ? <p className="levi-bottom-placeholder">Adapter output and debug console messages will appear here.</p> : null}
        {consoleEntries.map((entry) => (
          <pre key={entry.id} className={`levi-bottom-debug-entry levi-bottom-debug-${entry.category}`}>
            {entry.output}
          </pre>
        ))}
      </div>
    </section>
  );
}
