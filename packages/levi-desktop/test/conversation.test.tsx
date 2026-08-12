import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/app/App";
import { DEFAULT_CONVERSATION_MODEL } from "../src/types/levi-api";
import type { ConversationStreamEvent, EditStreamEvent } from "../src/types/levi-api";

vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    cols = 96;
    rows = 10;
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
  }
  return { Terminal: MockTerminal };
});

vi.mock("@xterm/addon-fit", () => {
  class MockFitAddon {
    fit = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

function emitConversationEvent(event: ConversationStreamEvent) {
  act(() => {
    for (const listener of window.__leviConversationListeners) {
      listener(event);
    }
  });
}

function emitEditEvent(event: EditStreamEvent) {
  act(() => {
    for (const listener of window.__leviEditListeners) {
      listener(event);
    }
  });
}

function emitPlanningEvent(event: import("../src/types/levi-api").PlanningStreamEvent) {
  act(() => {
    for (const listener of window.__leviPlanningListeners) {
      listener(event);
    }
  });
}

async function sendPrompt(prompt = "What is Levi?") {
  const user = userEvent.setup();
  render(<App />);
  const textbox = screen.getByRole("textbox", { name: "Prompt" });
  await user.type(textbox, prompt);
  await user.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(window.levi.conversation.start).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByText(prompt)).toBeInTheDocument());
  return user;
}

describe("Levi local conversation", () => {
  it("submits prompts through the typed preload conversation API using qwen3.6:latest", async () => {
    await sendPrompt();

    expect(window.levi.conversation.start).toHaveBeenCalledWith({
      model: DEFAULT_CONVERSATION_MODEL,
      messages: [{ role: "user", content: "What is Levi?" }]
    });
  });

  it("does not submit empty prompts", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(window.levi.conversation.start).not.toHaveBeenCalled();
  });

  it("submits with Enter and keeps Shift+Enter as a newline", async () => {
    const user = userEvent.setup();
    render(<App />);
    const textbox = screen.getByRole("textbox", { name: "Prompt" });

    await user.type(textbox, "line one{Shift>}{Enter}{/Shift}line two");
    expect(textbox).toHaveValue("line one\nline two");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(window.levi.conversation.start).toHaveBeenCalledWith({
        model: DEFAULT_CONVERSATION_MODEL,
        messages: [{ role: "user", content: "line one\nline two" }]
      })
    );
  });

  it("renders the user message immediately", async () => {
    let resolveStart: (value: { requestId: string }) => void = () => undefined;
    vi.mocked(window.levi.conversation.start).mockImplementation(
      () => new Promise((resolve) => {
        resolveStart = resolve;
      })
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "Build a tiny app");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Build a tiny app")).toBeInTheDocument();
    await act(async () => {
      resolveStart({ requestId: "conversation-1" });
    });
  });

  it("renders streamed chunks incrementally", async () => {
    await sendPrompt();

    emitConversationEvent({ type: "chunk", requestId: "conversation-1", content: "Levi is " });
    await waitFor(() => expect(screen.getByText(/Levi is/)).toBeInTheDocument());
    emitConversationEvent({ type: "chunk", requestId: "conversation-1", content: "local." });
    await waitFor(() => expect(screen.getByText("Levi is local.")).toBeInTheDocument());
  });

  it("blocks duplicate submissions while generating", async () => {
    let resolveStart: (value: { requestId: string }) => void = () => undefined;
    vi.mocked(window.levi.conversation.start).mockImplementation(
      () => new Promise((resolve) => {
        resolveStart = resolve;
      })
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "Explain Levi");
    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}");

    expect(window.levi.conversation.start).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveStart({ requestId: "conversation-1" });
    });
  });

  it("stops active generation and preserves partial output", async () => {
    const user = await sendPrompt();
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument());
    emitConversationEvent({ type: "chunk", requestId: "conversation-1", content: "Partial response" });
    await waitFor(() => expect(screen.getByText("Partial response")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(window.levi.conversation.cancel).toHaveBeenCalledWith("conversation-1");
    emitConversationEvent({ type: "stopped", requestId: "conversation-1", reason: "user" });

    expect(screen.getByText("Partial response")).toBeInTheDocument();
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("starts a new chat by clearing the conversation", async () => {
    const user = await sendPrompt();
    emitConversationEvent({ type: "chunk", requestId: "conversation-1", content: "Hello" });

    await user.click(screen.getByRole("button", { name: "New Chat" }));

    expect(screen.queryByText("What is Levi?")).not.toBeInTheDocument();
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What do you want to build?" })).toBeInTheDocument();
  });

  it("renders Ollama unavailable errors safely", async () => {
    await sendPrompt();

    emitConversationEvent({
      type: "error",
      requestId: "conversation-1",
      code: "OLLAMA_UNAVAILABLE",
      message: "Ollama is not running. Start Ollama, then try again.",
      recoverable: true
    });
    await waitFor(() =>
      expect(screen.getByText("Ollama is not running. Start Ollama, then try again.")).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders missing model errors safely", async () => {
    await sendPrompt("Hello again");

    emitConversationEvent({
      type: "error",
      requestId: "conversation-1",
      code: "MODEL_MISSING",
      message: "qwen3.6:latest is not installed. Install it in Ollama, then try again.",
      recoverable: true
    });
    await waitFor(() =>
      expect(screen.getByText("qwen3.6:latest is not installed. Install it in Ollama, then try again.")).toBeInTheDocument()
    );
  });

  it("does not render raw HTML from Markdown", async () => {
    await sendPrompt();

    emitConversationEvent({
      type: "chunk",
      requestId: "conversation-1",
      content: "<script>window.__leviRawHtmlRan = true</script>"
    });

    await waitFor(() => expect(screen.getByText("<script>window.__leviRawHtmlRan = true</script>")).toBeInTheDocument());
    expect(document.querySelector(".levi-message-body script")).toBeNull();
    expect((window as unknown as { __leviRawHtmlRan?: boolean }).__leviRawHtmlRan).toBeUndefined();
  });

  it("renders code blocks without executing them", async () => {
    await sendPrompt();

    emitConversationEvent({
      type: "chunk",
      requestId: "conversation-1",
      content: "```js\nwindow.__leviCodeRan = true\n```"
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument());
    expect(screen.getByText("window.__leviCodeRan = true")).toBeInTheDocument();
    expect((window as unknown as { __leviCodeRan?: boolean }).__leviCodeRan).toBeUndefined();
  });

  it("renders safe headings, lists, and inline code", async () => {
    await sendPrompt();

    emitConversationEvent({
      type: "chunk",
      requestId: "conversation-1",
      content: "# Steps\n1. Run `npm test`\n2. Review output"
    });

    await waitFor(() => expect(screen.getByRole("heading", { name: "Steps" })).toBeInTheDocument());
    expect(screen.getByText((_content, element) => element?.tagName === "LI" && element.textContent === "Run npm test")).toBeInTheDocument();
    expect(screen.getByText("npm test")).toBeInTheDocument();
    expect(screen.getByText("Review output")).toBeInTheDocument();
  });

  it("renders validated citations and opens a cited file read-only", async () => {
    const user = await sendPrompt("Where is Ollama communication implemented?");

    emitConversationEvent({
      type: "citations",
      requestId: "conversation-1",
      citations: [
        {
          sourceId: "WS1",
          relativePath: "electron/main/index.ts",
          lineStart: 20,
          lineEnd: 80,
          reason: "content mentions Ollama"
        }
      ]
    });
    emitConversationEvent({
      type: "chunk",
      requestId: "conversation-1",
      content: "Ollama communication is implemented in the Electron main process."
    });

    await user.click(screen.getByRole("button", { name: "electron/main/index.ts:20-80" }));

    expect(window.levi.workspace.openFile).toHaveBeenCalledWith({ sourceId: "WS1", lineStart: 20 });
    await waitFor(() => expect(screen.getByText("Read-only workspace view")).toBeInTheDocument());
  });

  it("routes edit prompts through the typed edit proposal API without renderer model selection", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "Change Home heading to Build something remarkable.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(window.levi.edits.propose).toHaveBeenCalledWith({
        prompt: "Change Home heading to Build something remarkable."
      })
    );
    expect(window.levi.conversation.start).not.toHaveBeenCalled();
  });

  it("routes broad build requests through the Agent build planner without invoking edit IPC", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "Add GitHub OAuth.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(window.levi.agent.plan).toHaveBeenCalledWith({
        prompt: expect.stringContaining("Add GitHub OAuth."),
        modelId: "qwen3.6:latest"
      })
    );
    expect(window.levi.edits.propose).not.toHaveBeenCalled();
    expect(window.levi.planning.create).not.toHaveBeenCalled();
    expect(window.levi.conversation.start).not.toHaveBeenCalled();
  });

  it("runs approved build actions through the Agent execution and verification APIs", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "Build me a simple vanilla HTML calculator.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Approve and Build" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Approve and Build" }));

    await waitFor(() => expect(window.levi.agent.approve).toHaveBeenCalledWith({ sessionId: "agent-1", actionId: "action-1" }));
    await waitFor(() => expect(window.levi.agent.preview).toHaveBeenCalledWith({ sessionId: "agent-1", actionId: "action-1" }));
    await waitFor(() =>
      expect(window.levi.agent.execute).toHaveBeenCalledWith({
        sessionId: "agent-1",
        actionId: "action-1",
        previewId: "preview-1"
      })
    );
    await waitFor(() => expect(window.levi.agent.verify).toHaveBeenCalledWith({ sessionId: "agent-1" }));
    expect(window.levi.planning.create).not.toHaveBeenCalled();
  });

  it("keeps repository questions on normal workspace chat", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "What is this repository?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(window.levi.conversation.start).toHaveBeenCalledTimes(1));
    expect(window.levi.planning.create).not.toHaveBeenCalled();
    expect(window.levi.edits.propose).not.toHaveBeenCalled();
  });

  it("renders a read-only plan panel and generates code only after explicit Generate Code", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "Make me a plan for adding GitHub OAuth.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(window.levi.planning.create).toHaveBeenCalledTimes(1));

    emitPlanningEvent({
      type: "plan",
      requestId: "plan-1",
      plan: {
        planId: "plan-result-1",
        requestId: "plan-1",
        goal: "Add GitHub OAuth",
        summary: "Plan GitHub OAuth integration without modifying files.",
        confidence: "medium",
        estimatedComplexity: "High",
        estimatedFiles: 3,
        estimatedSteps: 3,
        affectedFiles: [
          {
            relativePath: "package.json",
            certainty: "confirmed",
            role: "Dependency and script manifest",
            reason: "manifest identifies dependencies",
            evidenceSourceIds: ["PLAN1"]
          },
          {
            relativePath: "src/auth/session.ts",
            certainty: "possible",
            role: "Authentication surface",
            reason: "authentication path candidate",
            evidenceSourceIds: ["PLAN2"]
          }
        ],
        executionOrder: [
          {
            order: 1,
            title: "Review manifests and configuration",
            purpose: "Identify dependencies first.",
            affectedFiles: ["package.json"],
            risk: "high"
          }
        ],
        dependencies: ["GitHub OAuth app credentials"],
        validationCommands: ["npm test"],
        risks: ["Authentication changes can affect login state."],
        assumptions: ["OAuth belongs in the existing session flow."],
        openQuestions: ["Which callback URL should be used?"],
        blockedItems: [],
        suggestedNextAction: "Confirm requirements before IDE-002B execution.",
        applicableProjectRules: [
          {
            ruleId: "rule-1",
            text: "Use Vitest.",
            sourceId: "rule-source-1",
            sourcePath: "AGENTS.md",
            lineStart: 1,
            lineEnd: 1,
            scopePath: ".",
            category: "testing",
            strength: "preferred",
            confidence: "high",
            extraction: "deterministic"
          }
        ],
        designConstraints: [],
        ruleConflicts: [],
        ruleSources: [{ sourceId: "rule-source-1", relativePath: "AGENTS.md", scopePath: ".", kind: "guidance" }],
        timings: { retrievalMs: 1, modelMs: 2, totalMs: 3 }
      }
    });

    await waitFor(() => expect(screen.getByRole("region", { name: "Execution plan review" })).toBeInTheDocument());
    expect(screen.getByText("Read-only execution plan")).toBeInTheDocument();
    expect(screen.getByText("Possible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(window.levi.edits.apply).not.toHaveBeenCalled();
    await waitFor(() => expect(window.levi.planning.approve).toHaveBeenCalledWith("plan-result-1"));
    expect(window.levi.execution.proposeStep).not.toHaveBeenCalled();

    await user.click(await screen.findByRole("button", { name: "Generate Code" }));
    expect(window.levi.execution.proposeStep).toHaveBeenCalled();
  });

  it("restores the latest in-memory plan after renderer refresh", async () => {
    vi.mocked(window.levi.planning.getStatus).mockResolvedValue({
      route: { planning: "qwen3.6:latest" },
      latestPlan: {
        planId: "plan-result-1",
        requestId: "plan-1",
        goal: "Convert React to Vue",
        summary: "High-risk framework migration plan.",
        confidence: "low",
        estimatedComplexity: "Very High",
        estimatedFiles: 8,
        estimatedSteps: 4,
        affectedFiles: [],
        executionOrder: [],
        dependencies: [],
        validationCommands: [],
        risks: ["Framework migrations can affect most UI files."],
        assumptions: ["React is the current UI framework."],
        openQuestions: [],
        blockedItems: [],
        suggestedNextAction: "Review the high-risk plan.",
        applicableProjectRules: [],
        designConstraints: [],
        ruleConflicts: [],
        ruleSources: [],
        timings: { retrievalMs: 1, modelMs: 2, totalMs: 3 }
      }
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText("Restored the latest read-only plan from this Levi window.")).toBeInTheDocument());
    expect(screen.getByText("Convert React to Vue")).toBeInTheDocument();
  });

  it("shows backend edit rejection messages instead of leaving the preparing placeholder", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "Update src/Home.tsx and package.json.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(window.levi.edits.propose).toHaveBeenCalledTimes(1));

    emitEditEvent({
      type: "error",
      requestId: "edit-1",
      code: "UNSUPPORTED_SCOPE",
      message: "IDE-001D supports one-file edits only.",
      recoverable: false
    });

    await waitFor(() => expect(screen.getByText("IDE-001D supports one-file edits only.")).toBeInTheDocument());
    expect(screen.queryByText("Preparing a safe single-file diff...")).not.toBeInTheDocument();
  });

  it("renders an unapplied local diff and does not write before Apply", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "Change Home heading to Build something remarkable.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(window.levi.edits.propose).toHaveBeenCalledTimes(1));

    emitEditEvent({
      type: "proposal",
      requestId: "edit-1",
      proposal: {
        proposalId: "proposal-1",
        requestId: "edit-1",
        relativePath: "src/Home.tsx",
        summary: "Update heading text",
        assumptions: ["Heading exists"],
        warnings: ["Run tests manually"],
        suggestedValidationCommands: ["npm test"],
        confidence: "high",
        addedLineCount: 1,
        removedLineCount: 1,
        appliedProjectRules: [],
        ruleConflicts: [],
        status: "pending",
        timings: { retrievalMs: 1, modelMs: 2, diffMs: 3, totalMs: 6 },
        diff: [
          { type: "removed", oldLineNumber: 1, content: "<h1>Old</h1>" },
          { type: "added", newLineNumber: 1, content: "<h1>Build something remarkable.</h1>" }
        ]
      }
    });

    await waitFor(() => expect(screen.getByRole("region", { name: "Edit proposal review" })).toBeInTheDocument());
    expect(screen.getByText("Unapplied diff preview")).toBeInTheDocument();
    expect(screen.getByText("<h1>Old</h1>")).toBeInTheDocument();
    expect(screen.getByText("<h1>Build something remarkable.</h1>")).toBeInTheDocument();
    expect(window.levi.edits.apply).not.toHaveBeenCalled();
  });

  it("rejects a proposal without applying and preserves the conversation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "Change Home heading to Build something remarkable.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    emitEditEvent({
      type: "proposal",
      requestId: "edit-1",
      proposal: {
        proposalId: "proposal-1",
        requestId: "edit-1",
        relativePath: "src/Home.tsx",
        summary: "Update heading text",
        assumptions: [],
        warnings: [],
        suggestedValidationCommands: [],
        confidence: "high",
        addedLineCount: 1,
        removedLineCount: 1,
        appliedProjectRules: [],
        ruleConflicts: [],
        status: "pending",
        timings: { retrievalMs: 1, modelMs: 2, diffMs: 3, totalMs: 6 },
        diff: [{ type: "added", newLineNumber: 1, content: "new" }]
      }
    });

    await user.click(await screen.findByRole("button", { name: "Reject" }));

    expect(window.levi.edits.reject).toHaveBeenCalledWith("proposal-1");
    expect(window.levi.edits.apply).not.toHaveBeenCalled();
    expect(screen.getByText("Change Home heading to Build something remarkable.")).toBeInTheDocument();
  });

  it("applies a proposal only through explicit Apply and opens the updated file read-only", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Prompt" }), "Change Home heading to Build something remarkable.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    emitEditEvent({
      type: "proposal",
      requestId: "edit-1",
      proposal: {
        proposalId: "proposal-1",
        requestId: "edit-1",
        relativePath: "src/Home.tsx",
        summary: "Update heading text",
        assumptions: [],
        warnings: [],
        suggestedValidationCommands: [],
        confidence: "high",
        addedLineCount: 1,
        removedLineCount: 1,
        appliedProjectRules: [],
        ruleConflicts: [],
        status: "pending",
        timings: { retrievalMs: 1, modelMs: 2, diffMs: 3, totalMs: 6 },
        diff: [{ type: "added", newLineNumber: 1, content: "new" }]
      }
    });

    await user.click(await screen.findByRole("button", { name: "Apply" }));

    expect(window.levi.edits.apply).toHaveBeenCalledWith("proposal-1");
    await waitFor(() => expect(screen.getByText("Applied by Levi — read-only workspace view")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Undo Last Edit" })).toBeInTheDocument();
  });
});
