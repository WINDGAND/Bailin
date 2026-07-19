import { Fragment, type ReactNode } from "react";

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "h"; level: 1 | 2 | 3; text: string };

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; label: string; href: string };

const OL_RE = /^\d+[.)]\s+/;
const UL_RE = /^[-*•]\s+/;
// GitHub Release 正文几乎总用 "## 标题" 这种写法分节；聊天消息里模型偶尔
// 也会吐出标题语法，一并支持，不用为更新横幅单独写一套解析器。
const HEADING_RE = /^(#{1,3})\s+(.+)$/;
// 链接只匹配 http(s) 前缀，避免 javascript: 等协议，也避免 URL 内括号截断误解析。
const INLINE_CHUNK_RE = /(\*\*[^*\n]+?\*\*|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\))/g;

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

/** 仅允许 http(s)，其它协议退回纯文本，避免 javascript: 等注入。 */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** 导出供验证脚本覆盖链接 / bold 内联解析。 */
export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_CHUNK_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ kind: "text", text: text.slice(lastIndex, index) });
    }

    const full = match[0];
    if (full.startsWith("**") && full.endsWith("**") && full.length > 4) {
      tokens.push({ kind: "strong", text: full.slice(2, -2) });
    } else {
      const label = match[2] ?? "";
      const href = match[3] ?? "";
      // 正则已限制 http(s)；isSafeHttpUrl 再挡一层畸形 URL。
      if (label && href && isSafeHttpUrl(href)) {
        tokens.push({ kind: "link", label, href });
      } else {
        tokens.push({ kind: "text", text: full });
      }
    }

    lastIndex = index + full.length;
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return tokens;
}

function parseInline(text: string): ReactNode[] {
  return tokenizeInline(text).map((token, idx) => {
    if (token.kind === "strong") {
      return <strong key={idx}>{token.text}</strong>;
    }
    if (token.kind === "link") {
      return (
        <a
          key={idx}
          className="chat-md__a"
          href={token.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {token.label}
        </a>
      );
    }
    return <Fragment key={idx}>{token.text}</Fragment>;
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
