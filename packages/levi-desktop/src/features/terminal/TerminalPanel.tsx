import { BottomPanel } from "./BottomPanel";
import type { DebugConsoleEntry, DebugEvaluateResult } from "../debugger/DebugEvents";
import type { SelectedProject } from "../../types/levi-api";
import type { TaskOutputEntry, TaskProblem } from "../../types/task-api";

type TerminalPanelProps = {
  selectedProject: SelectedProject | null;
  debugConsole?: DebugConsoleEntry[];
  debugLastEvaluation?: DebugEvaluateResult;
  onEvaluateDebug?: (expression: string) => Promise<unknown>;
  onClearDebugConsole?: () => Promise<void>;
  problems?: TaskProblem[];
  output?: TaskOutputEntry[];
  onOpenProblem?: (problem: TaskProblem) => void;
};

export function TerminalPanel({
  selectedProject,
  debugConsole = [],
  debugLastEvaluation,
  onEvaluateDebug = async () => undefined,
  onClearDebugConsole = async () => undefined,
  problems = [],
  output = [],
  onOpenProblem = () => undefined
}: TerminalPanelProps) {
  return (
    <BottomPanel
      selectedProject={selectedProject}
      debugConsole={debugConsole}
      debugLastEvaluation={debugLastEvaluation}
      onEvaluateDebug={onEvaluateDebug}
      onClearDebugConsole={onClearDebugConsole}
      problems={problems}
      output={output}
      onOpenProblem={onOpenProblem}
    />
  );
}
