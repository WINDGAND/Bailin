import { Fragment, type ReactNode } from "react";

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "h"; level: 1 | 2 | 3; text: string };

const OL_RE = /^\d+[.)]\s+/;
const UL_RE = /^[-*•]\s+/;
// GitHub Release 正文几乎总用 "## 标题" 这种写法分节；聊天消息里模型偶尔
// 也会吐出标题语法，一并支持，不用为更新横幅单独写一套解析器。
const HEADING_RE = /^(#{1,3})\s+(.+)$/;

/** 导出仅为了给 scripts/verify/verify-chat-markdown.mjs 做纯函数回归测试。 */
export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i++;
      continue;
    }
    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1]!.length as 1 | 2 | 3;
      blocks.push({ kind: "h", level, text: heading[2]! });
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
        if (block.kind === "h") {
          const HeadingTag = (`h${block.level + 3}`) as "h4" | "h5" | "h6";
          return (
            <HeadingTag key={bi} className={`chat-md__h chat-md__h${block.level}`}>
              {parseInline(block.text)}
            </HeadingTag>
          );
        }
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
