import Editor from "@monaco-editor/react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { colors, typography } from "../design";
import "../monaco-setup";

type CodeEditorProps = {
  value: string;
  language?: string;
  lineStart?: number;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSave?: () => void;
};

type MountedEditor = Parameters<OnMount>[0];
type MonacoInstance = Parameters<OnMount>[1];
type SearchNavigationDetail = {
  lineNumber: number;
  columnStart: number;
  matchLength: number;
};

const SEARCH_NAVIGATION_EVENT = "levi:search-navigation";

export function CodeEditor({
  value,
  language = "typescript",
  lineStart = 1,
  readOnly = true,
  onChange,
  onSave
}: CodeEditorProps) {
  const editorRef = useRef<MountedEditor | null>(null);
  const monacoRef = useRef<MonacoInstance | null>(null);

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
    function handleSearchNavigation(event: Event) {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const model = editor?.getModel();
      if (!editor || !monaco || !model) return;

      const detail = (event as CustomEvent<SearchNavigationDetail>).detail;
      if (!detail) return;

      window.requestAnimationFrame(() => {
        const currentModel = editor.getModel();
        if (!currentModel) return;
        const lineNumber = Math.max(1, Math.min(detail.lineNumber, currentModel.getLineCount()));
        const maxColumn = currentModel.getLineMaxColumn(lineNumber);
        const startColumn = Math.max(1, Math.min(detail.columnStart, maxColumn));
        const endColumn = Math.max(startColumn, Math.min(startColumn + detail.matchLength, maxColumn));
        const selection = new monaco.Selection(lineNumber, startColumn, lineNumber, endColumn);
        editor.setSelection(selection);
        editor.revealRangeInCenter(selection, monaco.editor.ScrollType.Smooth);
        editor.focus();
      });
    }

    window.addEventListener(SEARCH_NAVIGATION_EVENT, handleSearchNavigation);
    return () => window.removeEventListener(SEARCH_NAVIGATION_EVENT, handleSearchNavigation);
  }, []);

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
