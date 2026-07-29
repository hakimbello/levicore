import Editor from "@monaco-editor/react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
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

export function CodeEditor({
  value,
  language = "typescript",
  lineStart = 1,
  readOnly = true,
  onChange,
  onSave
}: CodeEditorProps) {
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
    editor.updateOptions({ readOnly, domReadOnly: readOnly });
    editor.revealLineInCenter(lineStart);
    editor.setPosition({ lineNumber: lineStart, column: 1 });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSave?.());
  };

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
