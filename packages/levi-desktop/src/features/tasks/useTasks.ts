import { useCallback, useEffect, useState } from "react";
import type { TaskEvent, TaskHistoryEntry, TaskListResult, TaskOutputEntry, TaskProblem, TaskRun } from "../../types/task-api";

export function useTasks(enabled: boolean) {
  const [list, setList] = useState<TaskListResult>({ detected: [], recent: [], running: [], failed: [], pinned: [] });
  const [problems, setProblems] = useState<TaskProblem[]>([]);
  const [output, setOutput] = useState<TaskOutputEntry[]>([]);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const [nextList, nextProblems, nextOutput, nextHistory] = await Promise.all([
      window.levi.tasks.list(),
      window.levi.tasks.problems(),
      window.levi.tasks.output(),
      window.levi.tasks.history()
    ]);
    setList(nextList);
    setProblems(nextProblems);
    setOutput(nextOutput);
    setHistory(nextHistory);
    setLoaded(true);
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    return window.levi.tasks.onEvent((event: TaskEvent) => {
      if (event.type === "problems") {
        setProblems(event.problems);
      }
      if (event.type === "output-entry") {
        setOutput((current) => [...current, event.entry].slice(-2000));
      }
      if (event.type === "status") {
        void refresh();
      }
    });
  }, [enabled, refresh]);

  const runTask = useCallback(async (taskId: string) => {
    const run = await window.levi.tasks.run({ taskId });
    await refresh();
    return run;
  }, [refresh]);

  const cancelRun = useCallback(async (runId: string) => {
    const run = await window.levi.tasks.cancel({ runId });
    await refresh();
    return run;
  }, [refresh]);

  const pinTask = useCallback(async (taskId: string, pinned: boolean) => {
    const next = await window.levi.tasks.pin({ taskId, pinned });
    setList(next);
  }, []);

  const runAgain = useCallback(async (entry: TaskHistoryEntry | TaskRun) => {
    return runTask(entry.taskId);
  }, [runTask]);

  return {
    list,
    problems,
    output,
    history,
    loaded,
    refresh,
    runTask,
    cancelRun,
    pinTask,
    runAgain
  };
}
