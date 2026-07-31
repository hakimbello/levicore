import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProblemsPanel } from "../src/features/tasks/ProblemsPanel";
import { TasksPanel } from "../src/features/tasks/TasksPanel";

describe("Tasks renderer integration", () => {
  it("renders detected tasks and triggers run", async () => {
    const user = userEvent.setup();
    const onRunTask = vi.fn(async () => undefined);
    render(
      <TasksPanel
        enabled
        detected={[{ id: "builtin:build", label: "Build", source: "builtin", group: "build", command: "npm.cmd", args: ["run", "build"], problemMatchers: ["$tsc"] }]}
        recent={[]}
        running={[]}
        failed={[]}
        pinned={[]}
        onRunTask={onRunTask}
        onCancelRun={vi.fn(async () => undefined)}
        onPinTask={vi.fn(async () => undefined)}
        onRunAgain={vi.fn(async () => undefined)}
        onRevealTerminal={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onRunTask).toHaveBeenCalledWith("builtin:build");
  });

  it("opens problems at file locations", async () => {
    const user = userEvent.setup();
    const onOpenProblem = vi.fn();
    render(
      <ProblemsPanel
        problems={[
          {
            id: "p1",
            relativePath: "src/app.ts",
            line: 12,
            column: 4,
            severity: "error",
            message: "Type error",
            source: "Build"
          }
        ]}
        onOpenProblem={onOpenProblem}
      />
    );

    await user.click(screen.getByRole("button", { name: /Type error/i }));
    expect(onOpenProblem).toHaveBeenCalledWith(expect.objectContaining({ relativePath: "src/app.ts", line: 12, column: 4 }));
  });
});

describe("App tasks IPC integration", () => {
  it("loads task list through preload bridge", async () => {
    const { useTasks } = await import("../src/features/tasks/useTasks");
    const { renderHook, waitFor: wait } = await import("@testing-library/react");
    const { result } = renderHook(() => useTasks(true));
    await wait(() => expect(result.current.loaded).toBe(true));
    expect(window.levi.tasks.list).toHaveBeenCalled();
    expect(result.current.list.detected.length).toBeGreaterThan(0);
  });
});
