import type { ReactNode } from "react";

type MarkdownBlock =
  | { type: "code"; code: string; language?: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; items: string[]; ordered: boolean }
  | { type: "paragraph"; text: string };

function parseBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([\w-]+)?\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: "code", code: codeLines.join("\n"), language: fence[1] });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length === 1 ? 2 : 3, text: heading[2] });
      index += 1;
      continue;
    }

    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*(?:[-*]|\d+\.)\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "list", items, ordered });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^```/.test(lines[index]) &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return <span key={index}>{part}</span>;
  });
}

export function SafeMarkdown({ content }: { content: string }) {
  return (
    <div className="levi-markdown">
      {parseBlocks(content).map((block, index) => {
        if (block.type === "code") {
          return (
            <div key={index} className="levi-code-block">
              <button
                type="button"
                className="levi-copy-button"
                onClick={() => void navigator.clipboard?.writeText(block.code)}
              >
                Copy
              </button>
              <pre>
                <code>{block.code}</code>
              </pre>
            </div>
          );
        }
        if (block.type === "heading") {
          const HeadingTag = block.level === 2 ? "h2" : "h3";
          return <HeadingTag key={index}>{renderInline(block.text)}</HeadingTag>;
        }
        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ListTag>
          );
        }
        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}
