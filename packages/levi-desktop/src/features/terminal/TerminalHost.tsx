import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { colors, typography } from "../../design";
import type { SelectedProject } from "../../types/levi-api";

type TerminalHostProps = {
  selectedProject: SelectedProject | null;
  onCwdChange: (cwd: string | null) => void;
};

export function TerminalHost({ selectedProject, onCwdChange }: TerminalHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<{ id: string; cwd: string } | null>(null);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: typography.monoFamily,
      fontSize: typography.sizes.caption,
      lineHeight: typography.lineHeights.compact,
      rows: 10,
      theme: {
        background: colors.surface,
        foreground: colors.primaryText,
        cursor: colors.accent,
        selectionBackground: colors.accentSoft
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    let disposed = false;
    const inputSubscription = terminal.onData((data) => {
      const session = sessionRef.current;
      if (session) {
        void window.levi.terminal.write(session.id, data);
      }
    });
    const outputUnsubscribe = window.levi.terminal.onData((event) => {
      const session = sessionRef.current;
      if (session?.id === event.id) {
        terminal.write(event.data);
      }
    });

    void window.levi.terminal.create({ cols: terminal.cols, rows: terminal.rows }).then((session) => {
      if (disposed) {
        void window.levi.terminal.dispose(session.id);
        return;
      }
      sessionRef.current = session;
      onCwdChange(session.cwd);
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      disposed = true;
      outputUnsubscribe();
      inputSubscription.dispose();
      const session = sessionRef.current;
      if (session) {
        void window.levi.terminal.dispose(session.id);
      }
      sessionRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      onCwdChange(null);
    };
  }, [onCwdChange]);

  useEffect(() => {
    if (!fitAddonRef.current || !sessionRef.current) {
      return;
    }
    fitAddonRef.current.fit();
    void window.levi.terminal.resize({
      id: sessionRef.current.id,
      cols: terminalRef.current?.cols ?? 96,
      rows: terminalRef.current?.rows ?? 10
    });
  }, [selectedProject]);

  return <div ref={containerRef} className="levi-terminal-host" />;
}
