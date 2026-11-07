import type { ReactNode } from "react";

function renderLines(content: string): ReactNode[] {
  const lines = content.split("\n");
  return lines.map((line, index) => {
    const escaped = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
    if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
    if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
    if (line.startsWith("- ")) {
      return (
        <p
          key={index}
          className="journal-list-line"
          dangerouslySetInnerHTML={{ __html: `• ${escaped.slice(2)}` }}
        />
      );
    }
    if (!line.trim()) return <div key={index} className="journal-spacer" />;
    return <p key={index} dangerouslySetInnerHTML={{ __html: escaped }} />;
  });
}

/** Shared, escaping-safe renderer for journal entries and session summaries. */
export function JournalBody({ content, className = "" }: { content: string; className?: string }) {
  return <div className={className}>{renderLines(content)}</div>;
}
