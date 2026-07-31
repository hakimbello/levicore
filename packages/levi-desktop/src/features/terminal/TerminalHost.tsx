import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { colors, typography } from "../../design";

const SCROLLBACK_LINES = 10000;

type TerminalHostProps = {
  sessionId?: string;
  cwd: string;
  active: boolean;
  onSessionReady: (sessionId: string, cwd: string) => void;
  onCwdChange: (cwd: string | null) => void;
  onExit?: () => void;
};

export function TerminalHost({ sessionId, cwd, active, onSessionReady, onCwdChange, onExit }: TerminalHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(sessionId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      scrollback: SCROLLBACK_LINES,
      allowProposedApi: true,
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
      const id = sessionRef.current;
      if (id) {
        void window.levi.terminal.write(id, data);
      }
    });
    const outputUnsubscribe = window.levi.terminal.onData((event) => {
      if (sessionRef.current === event.id) {
        terminal.write(event.data);
      }
    });
    const selectionSubscription = terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      if (selection && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(selection);
      }
    });

    const ensureSession = async () => {
      if (sessionRef.current) {
        onCwdChange(cwd);
        return;
      }
      const session = await window.levi.terminal.create({ cols: terminal.cols, rows: terminal.rows, cwd });
      if (disposed) {
        void window.levi.terminal.dispose(session.id);
        return;
      }
      sessionRef.current = session.id;
      onSessionReady(session.id, session.cwd);
      onCwdChange(session.cwd);
    };
    void ensureSession();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      if (!fitAddonRef.current || !terminalRef.current || !sessionRef.current) return;
      fitAddonRef.current.fit();
      void window.levi.terminal.resize({
        id: sessionRef.current,
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows
      });
    });
    resizeObserver.observe(containerRef.current);

    const keyHandler = terminal.attachCustomKeyEventHandler((event) => {
      if (event.ctrlKey && event.shiftKey && event.key === "F") {
        setSearchVisible((value) => !value);
        return false;
      }
      if (event.ctrlKey && event.key === "c" && terminal.hasSelection()) {
        const selection = terminal.getSelection();
        if (selection && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(selection);
        }
        return false;
      }
      if (event.ctrlKey && event.key === "v" && navigator.clipboard?.readText) {
        void navigator.clipboard.readText().then((text) => {
          const id = sessionRef.current;
          if (id) void window.levi.terminal.write(id, text);
        });
        return false;
      }
      return true;
    });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      outputUnsubscribe();
      inputSubscription.dispose();
      selectionSubscription.dispose();
      const id = sessionRef.current;
      if (id) {
        void window.levi.terminal.dispose(id);
      }
      sessionRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      onCwdChange(null);
      onExit?.();
    };
  }, [cwd, onCwdChange, onExit, onSessionReady]);

  useEffect(() => {
    if (!active || !fitAddonRef.current || !sessionRef.current || !terminalRef.current) {
      return;
    }
    fitAddonRef.current.fit();
    void window.levi.terminal.resize({
      id: sessionRef.current,
      cols: terminalRef.current.cols,
      rows: terminalRef.current.rows
    });
  }, [active]);

  useEffect(() => {
    if (!searchVisible || !searchQuery || !terminalRef.current) return;
    const terminal = terminalRef.current;
    terminal.clearSelection();
    const buffer = terminal.buffer.active;
    for (let row = buffer.length - 1; row >= 0; row -= 1) {
      const line = buffer.getLine(row);
      const text = line?.translateToString(true) ?? "";
      const index = text.toLowerCase().indexOf(searchQuery.toLowerCase());
      if (index >= 0) {
        terminal.scrollToLine(Math.max(row - 2, 0));
        terminal.select(index, row, searchQuery.length);
        break;
      }
    }
  }, [searchQuery, searchVisible]);

  return (
    <div className="levi-terminal-pane">
      {searchVisible ? (
        <form
          className="levi-terminal-search"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Find in terminal"
            aria-label="Find in terminal"
          />
          <button type="button" className="levi-terminal-search-close" onClick={() => setSearchVisible(false)}>
            Close
          </button>
        </form>
      ) : null}
      <div ref={containerRef} className="levi-terminal-host" />
    </div>
  );
}
