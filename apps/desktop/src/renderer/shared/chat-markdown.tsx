import { Fragment, type ReactNode } from "react";

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "ul"; items: string[] };

const OL_RE = /^\d+[.)]\s+/;
const UL_RE = /^[-*•]\s+/;

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(OL_RE, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(UL_RE, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !OL_RE.test(lines[i] ?? "") &&
      !UL_RE.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i++;
    }
    blocks.push({ kind: "p", lines: para });
  }
  return blocks;
}

function parseInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+?\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

export function ChatMarkdown({ text }: { text: string }): JSX.Element {
  if (!text.trim()) return <></>;

  const blocks = parseBlocks(text);
  return (
    <div className="chat-md">
      {blocks.map((block, bi) => {
        if (block.kind === "ol") {
          return (
            <ol key={bi} className="chat-md__ol">
              {block.items.map((item, ii) => (
                <li key={ii}>{parseInline(item)}</li>
              ))}
            </ol>
          );
        }
        if (block.kind === "ul") {
          return (
            <ul key={bi} className="chat-md__ul">
              {block.items.map((item, ii) => (
                <li key={ii}>{parseInline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="chat-md__p">
            {block.lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 ? <br /> : null}
                {parseInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
