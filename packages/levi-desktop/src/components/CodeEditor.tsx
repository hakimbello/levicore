import Editor from "@monaco-editor/react";
import { colors, typography } from "../design";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import "../monaco-setup";

type CodeEditorProps = {
  value: string;
  language?: string;
  lineStart?: number;
};

export function CodeEditor({ value, language = "typescript", lineStart = 1 }: CodeEditorProps) {
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

  const handleMount: OnMount = (editor) => {
    editor.updateOptions({ readOnly: true, domReadOnly: true });
    editor.revealLineInCenter(lineStart);
    editor.setPosition({ lineNumber: lineStart, column: 1 });
  };

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      theme="levi-light"
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      options={{
        fontFamily: typography.monoFamily,
        fontSize: typography.sizes.small,
        lineHeight: typography.lineHeights.editor,
        minimap: { enabled: false },
        readOnly: true,
        domReadOnly: true,
        scrollBeyondLastLine: false,
        padding: { top: 16, bottom: 16 },
        renderLineHighlight: "gutter",
        overviewRulerBorder: false
      }}
    />
  );
}
