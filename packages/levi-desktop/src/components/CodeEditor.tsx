import Editor from "@monaco-editor/react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { colors, typography } from "../design";
import type { DebugBreakpoint, DebugEvaluateResult, DebugInlineValue, DebugSetBreakpointRequest } from "../features/debugger";
import "../monaco-setup";

type CodeEditorProps = {
  value: string;
  language?: string;
  relativePath?: string;
  lineStart?: number;
  columnStart?: number;
  readOnly?: boolean;
  breakpoints?: DebugBreakpoint[];
  activeExecutionLine?: number;
  exceptionLine?: number;
  debugPaused?: boolean;
  activeFrameId?: number;
  inlineValues?: DebugInlineValue[];
  onChange?: (value: string) => void;
  onSave?: () => void;
  onToggleBreakpoint?: (line: number) => void;
  onEditBreakpoint?: (line: number, request: DebugSetBreakpointRequest) => Promise<void>;
  onEvaluateHover?: (expression: string, frameId?: number) => Promise<DebugEvaluateResult | undefined>;
  onEvaluateSelection?: (expression: string) => Promise<void>;
  onSelectionChange?: (selection: { content: string; lineStart: number; lineEnd: number } | null) => void;
};

type MountedEditor = Parameters<OnMount>[0];
type MountedMonaco = Parameters<OnMount>[1];

type BreakpointMenuState = {
  line: number;
  x: number;
  y: number;
  breakpoint?: DebugBreakpoint;
};

const IDENTIFIER_PATTERN = /\b[A-Za-z_$][\w$]*\b/g;

function buildInlineValueMap(values: DebugInlineValue[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of values) {
    map.set(item.name, item.value);
  }
  return map;
}

function formatHoverMarkdown(result: DebugEvaluateResult, children?: Array<{ name: string; value: string; type?: string }>): string {
  const lines = [`**${result.expression}**`, `\`${result.result}\`${result.type ? ` *(${result.type})*` : ""}`];
  if (result.error) lines.push(`Error: ${result.error}`);
  if (children?.length) {
    lines.push("", "**Properties:**");
    for (const child of children.slice(0, 20)) {
      lines.push(`- \`${child.name}\`: ${child.value}${child.type ? ` *(${child.type})*` : ""}`);
    }
    if (children.length > 20) lines.push(`- … and ${children.length - 20} more`);
  } else if (result.namedVariables !== undefined || result.indexedVariables !== undefined) {
    const count = result.namedVariables ?? result.indexedVariables;
    lines.push("", `*Expand in Variables panel (${count} children)*`);
  }
  return lines.join("\n\n");
}

export function CodeEditor({
  value,
  language = "typescript",
  relativePath,
  lineStart = 1,
  columnStart = 1,
  readOnly = true,
  breakpoints = [],
  activeExecutionLine,
  exceptionLine,
  debugPaused = false,
  activeFrameId,
  inlineValues = [],
  onChange,
  onSave,
  onToggleBreakpoint,
  onEditBreakpoint,
  onEvaluateHover,
  onEvaluateSelection,
  onSelectionChange
}: CodeEditorProps) {
  const editorRef = useRef<MountedEditor | null>(null);
  const monacoRef = useRef<MountedMonaco | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const inlineDecorationIdsRef = useRef<string[]>([]);
  const hoverDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const hoverGenerationRef = useRef(0);
  const [breakpointMenu, setBreakpointMenu] = useState<BreakpointMenuState | null>(null);
  const [editCondition, setEditCondition] = useState("");
  const [editHitCondition, setEditHitCondition] = useState("");
  const [editLogMessage, setEditLogMessage] = useState("");

  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme("levi-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": colors.surface,
        "editor.foreground": colors.primaryText,
        "editorLineNumber.foreground": colors.mutedText,
        "editorLineNumber.activeForeground": colors.secondaryText,
        "editorCursor.foreground": colors.accent,
        "editor.selectionBackground": colors.accentSoft,
        "editorWidget.background": colors.surfaceElevated,
        "editorWidget.border": colors.border
      }
    });
  };

  const registerProviders = useCallback(
    (editor: MountedEditor, monaco: MountedMonaco) => {
      hoverDisposableRef.current?.dispose();

      hoverDisposableRef.current = monaco.languages.registerHoverProvider(language, {
        provideHover: async (model, position) => {
          if (!debugPaused || !onEvaluateHover) return null;
          const word = model.getWordAtPosition(position);
          if (!word?.word) return null;
          const generation = ++hoverGenerationRef.current;
          const result = await onEvaluateHover(word.word, activeFrameId);
          if (!result || generation !== hoverGenerationRef.current) return null;
          return {
            range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
            contents: [{ value: formatHoverMarkdown(result) }]
          };
        }
      });

      editor.addAction({
        id: "levi.debug.evaluateSelection",
        label: "Evaluate Selection",
        contextMenuGroupId: "9_cutcopypaste",
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyE],
        run: () => {
          const selection = editor.getSelection();
          const model = editor.getModel();
          if (!selection || !model || !onEvaluateSelection) return;
          const expression = model.getValueInRange(selection).trim();
          if (expression) void onEvaluateSelection(expression);
        }
      });
    },
    [activeFrameId, debugPaused, inlineValues, language, onEvaluateHover, onEvaluateSelection]
  );

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.updateOptions({ readOnly, domReadOnly: readOnly });
    editor.revealLineInCenter(lineStart);
    editor.setPosition({ lineNumber: lineStart, column: columnStart });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSave?.());
    editor.onDidChangeCursorSelection((event) => {
      if (!onSelectionChange) return;
      const model = editor.getModel();
      const selection = event.selection;
      if (!model || selection.isEmpty()) {
        onSelectionChange(null);
        return;
      }
      const content = model.getValueInRange(selection);
      onSelectionChange(content.trim() ? { content, lineStart: selection.startLineNumber, lineEnd: selection.endLineNumber } : null);
    });
    editor.onMouseDown((event) => {
      const targetType = event.target.type;
      const gutterClick =
        targetType === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        targetType === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS ||
        targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
      const lineNumber = event.target.position?.lineNumber;
      if (gutterClick && typeof lineNumber === "number" && event.event.rightButton) {
        event.event.preventDefault();
        const breakpoint = breakpoints.find((item) => item.line === lineNumber);
        setEditCondition(breakpoint?.condition ?? "");
        setEditHitCondition(breakpoint?.hitCondition ?? "");
        setEditLogMessage(breakpoint?.logMessage ?? "");
        setBreakpointMenu({
          line: lineNumber,
          x: event.event.posx,
          y: event.event.posy,
          breakpoint
        });
        return;
      }
      if (gutterClick && typeof lineNumber === "number" && !event.event.rightButton) {
        onToggleBreakpoint?.(lineNumber);
      }
    });
    registerProviders(editor, monaco);
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    registerProviders(editor, monaco);
  }, [registerProviders]);

  useEffect(() => {
    return () => {
      hoverDisposableRef.current?.dispose();
      window.levi?.debug?.cancelEvaluations?.();
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const lineNumber = Math.max(1, Math.min(lineStart, editor.getModel()?.getLineCount() ?? lineStart));
    const column = Math.max(1, columnStart);
    editor.revealLineInCenter(lineNumber);
    editor.setPosition({ lineNumber, column });
    editor.focus();
  }, [columnStart, lineStart]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const decorations = [
      ...breakpoints.map((breakpoint) => ({
        range: new monaco.Range(breakpoint.line, 1, breakpoint.line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: breakpoint.enabled
            ? breakpoint.verified === false
              ? "levi-debug-breakpoint-unverified"
              : breakpoint.logMessage
                ? "levi-debug-logpoint"
                : breakpoint.condition || breakpoint.hitCondition
                  ? "levi-debug-conditional-breakpoint"
                  : "levi-debug-breakpoint"
            : "levi-debug-breakpoint-disabled",
          glyphMarginHoverMessage: {
            value: [
              breakpoint.enabled ? (breakpoint.logMessage ? "Logpoint" : "Breakpoint") : "Disabled breakpoint",
              breakpoint.condition ? `Condition: ${breakpoint.condition}` : "",
              breakpoint.hitCondition ? `Hit count: ${breakpoint.hitCondition}` : "",
              breakpoint.logMessage ? `Log: ${breakpoint.logMessage}` : "",
              breakpoint.message ?? ""
            ]
              .filter(Boolean)
              .join("\n\n")
          }
        }
      })),
      ...(typeof activeExecutionLine === "number"
        ? [
            {
              range: new monaco.Range(activeExecutionLine, 1, activeExecutionLine, 1),
              options: {
                isWholeLine: true,
                className: "levi-debug-current-line",
                glyphMarginClassName: "levi-debug-current-glyph"
              }
            }
          ]
        : []),
      ...(typeof exceptionLine === "number"
        ? [
            {
              range: new monaco.Range(exceptionLine, 1, exceptionLine, 1),
              options: {
                isWholeLine: true,
                className: "levi-debug-exception-line",
                glyphMarginClassName: "levi-debug-exception-glyph"
              }
            }
          ]
        : [])
    ];
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }, [activeExecutionLine, breakpoints, exceptionLine, relativePath]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model || !debugPaused || inlineValues.length === 0) {
      inlineDecorationIdsRef.current = editor.deltaDecorations(inlineDecorationIdsRef.current, []);
      return;
    }
    const valueMap = buildInlineValueMap(inlineValues);
    const inlineDecorations: Parameters<typeof editor.deltaDecorations>[1] = [];
    for (let line = 1; line <= model.getLineCount(); line += 1) {
      const lineContent = model.getLineContent(line);
      IDENTIFIER_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = IDENTIFIER_PATTERN.exec(lineContent)) !== null) {
        const name = match[0];
        const inlineValue = valueMap.get(name);
        if (!inlineValue) continue;
        inlineDecorations.push({
          range: new monaco.Range(line, match.index + name.length + 1, line, match.index + name.length + 1),
          options: {
            after: {
              content: ` = ${inlineValue}`,
              inlineClassName: "levi-debug-inline-value"
            }
          }
        });
      }
    }
    inlineDecorationIdsRef.current = editor.deltaDecorations(inlineDecorationIdsRef.current, inlineDecorations);
  }, [debugPaused, inlineValues, value]);

  async function submitBreakpointEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!breakpointMenu || !relativePath || !onEditBreakpoint) return;
    await onEditBreakpoint(breakpointMenu.line, {
      relativePath,
      line: breakpointMenu.line,
      enabled: breakpointMenu.breakpoint?.enabled ?? true,
      condition: editCondition.trim() || undefined,
      hitCondition: editHitCondition.trim() || undefined,
      logMessage: editLogMessage.trim() || undefined
    });
    setBreakpointMenu(null);
  }

  return (
    <div className="levi-code-editor-host">
      <Editor
        height="100%"
        language={language}
        value={value}
        theme="levi-light"
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={(nextValue) => onChange?.(nextValue ?? "")}
        options={{
          fontFamily: typography.monoFamily,
          fontSize: typography.sizes.small,
          lineHeight: typography.lineHeights.editor,
          minimap: { enabled: false },
          glyphMargin: true,
          readOnly,
          domReadOnly: readOnly,
          scrollBeyondLastLine: false,
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: "gutter",
          overviewRulerBorder: false,
          inlineSuggest: { enabled: true }
        }}
      />
      {breakpointMenu ? (
        <div
          className="levi-debug-breakpoint-menu"
          style={{ top: breakpointMenu.y, left: breakpointMenu.x }}
          role="dialog"
          aria-label="Edit breakpoint"
        >
          <form onSubmit={(event) => void submitBreakpointEdit(event)}>
            <strong>Line {breakpointMenu.line}</strong>
            <label>
              <span>Condition</span>
              <input value={editCondition} onChange={(event) => setEditCondition(event.target.value)} placeholder="count > 3" />
            </label>
            <label>
              <span>Hit count</span>
              <input value={editHitCondition} onChange={(event) => setEditHitCondition(event.target.value)} placeholder=">= 5" />
            </label>
            <label>
              <span>Log message</span>
              <input value={editLogMessage} onChange={(event) => setEditLogMessage(event.target.value)} placeholder="count is {count}" />
            </label>
            <div className="levi-debug-breakpoint-menu-actions">
              <button type="button" className="levi-button levi-button-secondary" onClick={() => setBreakpointMenu(null)}>
                Cancel
              </button>
              {breakpointMenu.breakpoint ? (
                <button
                  type="button"
                  className="levi-button levi-button-secondary"
                  onClick={() => {
                    onToggleBreakpoint?.(breakpointMenu.line);
                    setBreakpointMenu(null);
                  }}
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  className="levi-button levi-button-secondary"
                  onClick={() => {
                    onToggleBreakpoint?.(breakpointMenu.line);
                    setBreakpointMenu(null);
                  }}
                >
                  Add Breakpoint
                </button>
              )}
              <button type="submit" className="levi-apply-button">
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
