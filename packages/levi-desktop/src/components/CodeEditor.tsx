import Editor from "@monaco-editor/react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { colors, typography } from "../design";
import type { DebugBreakpoint } from "../features/debugger";
import "../monaco-setup";

type CodeEditorProps = {
  value: string;
  language?: string;
  relativePath?: string;
  lineStart?: number;
  readOnly?: boolean;
  breakpoints?: DebugBreakpoint[];
  activeExecutionLine?: number;
  onChange?: (value: string) => void;
  onSave?: () => void;
  onToggleBreakpoint?: (line: number) => void;
};

type MountedEditor = Parameters<OnMount>[0];
type MountedMonaco = Parameters<OnMount>[1];

export function CodeEditor({
  value,
  language = "typescript",
  relativePath,
  lineStart = 1,
  readOnly = true,
  breakpoints = [],
  activeExecutionLine,
  onChange,
  onSave,
  onToggleBreakpoint
}: CodeEditorProps) {
  const editorRef = useRef<MountedEditor | null>(null);
  const monacoRef = useRef<MountedMonaco | null>(null);
  const decorationIdsRef = useRef<string[]>([]);

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

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.updateOptions({ readOnly, domReadOnly: readOnly });
    editor.revealLineInCenter(lineStart);
    editor.setPosition({ lineNumber: lineStart, column: 1 });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSave?.());
    editor.onMouseDown((event) => {
      const targetType = event.target.type;
      const gutterClick =
        targetType === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        targetType === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS ||
        targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;
      const lineNumber = event.target.position?.lineNumber;
      if (gutterClick && typeof lineNumber === "number") {
        onToggleBreakpoint?.(lineNumber);
      }
    });
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const lineNumber = Math.max(1, Math.min(lineStart, editor.getModel()?.getLineCount() ?? lineStart));
    editor.revealLineInCenter(lineNumber);
    editor.setPosition({ lineNumber, column: 1 });
    editor.focus();
  }, [lineStart]);

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
              : "levi-debug-breakpoint"
            : "levi-debug-breakpoint-disabled",
          glyphMarginHoverMessage: {
            value: [
              breakpoint.enabled ? "Breakpoint" : "Disabled breakpoint",
              breakpoint.condition ? `Condition: ${breakpoint.condition}` : "",
              breakpoint.logMessage ? `Logpoint: ${breakpoint.logMessage}` : "",
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
        : [])
    ];
    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }, [activeExecutionLine, breakpoints, relativePath]);

  return (
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
        overviewRulerBorder: false
      }}
    />
  );
}
