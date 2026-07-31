import { BottomPanel } from "./BottomPanel";
import type { DebugConsoleEntry, DebugEvaluateResult } from "../debugger/DebugEvents";
import type { SelectedProject } from "../../types/levi-api";

type TerminalPanelProps = {
  selectedProject: SelectedProject | null;
  debugConsole?: DebugConsoleEntry[];
  debugLastEvaluation?: DebugEvaluateResult;
  onEvaluateDebug?: (expression: string) => Promise<unknown>;
  onClearDebugConsole?: () => Promise<void>;
};

export function TerminalPanel({
  selectedProject,
  debugConsole = [],
  debugLastEvaluation,
  onEvaluateDebug = async () => undefined,
  onClearDebugConsole = async () => undefined
}: TerminalPanelProps) {
  return (
    <BottomPanel
      selectedProject={selectedProject}
      debugConsole={debugConsole}
      debugLastEvaluation={debugLastEvaluation}
      onEvaluateDebug={onEvaluateDebug}
      onClearDebugConsole={onClearDebugConsole}
    />
  );
}
