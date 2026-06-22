/**
 * 沙箱 guard 表达式求值器。
 * 只接受白名单标识符 / 运算符；任何字符外的内容都不会被求值。
 * 详细规范见 README「角色协议」（SpriteProgram guard 白名单）。
 */

export interface GuardContext {
  tick: number;
  mouseInBounds: boolean;
  dragging: boolean;
  idleSeconds: number;
  arrived: () => boolean;
  frameDone: () => boolean;
  rand: () => number;
}

const ALLOWED_IDENTIFIERS = new Set([
  "tick",
  "mouseInBounds",
  "dragging",
  "idleSeconds",
  "arrived",
  "frameDone",
  "rand",
  "true",
  "false"
]);

const ALLOWED_CHAR_RE =
  /^[\s\d.+\-*/%()<>=!&|a-zA-Z_]*$/;

/**
 * 用最朴素的 token 校验 + new Function 求值。
 * 不接受 ., ?., {, }, [, ], "', `, ;, =>, function, return 等任何字符。
 */
export function evalGuard(expr: string | undefined, ctx: GuardContext): boolean {
  if (!expr) return true;
  const trimmed = expr.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > 120) return false;
  if (!ALLOWED_CHAR_RE.test(trimmed)) return false;

  const idMatches = trimmed.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  for (const id of idMatches) {
    if (!ALLOWED_IDENTIFIERS.has(id)) {
      return false;
    }
  }
  if (/[A-Za-z0-9_]\s*\(/.test(trimmed)) {
    const calls = trimmed.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g) ?? [];
    for (const c of calls) {
      const id = c.replace(/\s*\($/, "");
      if (!["arrived", "frameDone", "rand"].includes(id)) return false;
    }
  }
  if (/=[^=]|<=>|=>|==[^=]/.test("X" + trimmed + "X") && /=(?!=)/.test(trimmed)) {
    return false;
  }
  try {
    const fn = new Function(
      "tick",
      "mouseInBounds",
      "dragging",
      "idleSeconds",
      "arrived",
      "frameDone",
      "rand",
      `"use strict"; return (${trimmed});`
    );
    const out = fn(
      ctx.tick,
      ctx.mouseInBounds,
      ctx.dragging,
      ctx.idleSeconds,
      ctx.arrived,
      ctx.frameDone,
      ctx.rand
    );
    return Boolean(out);
  } catch {
    return false;
  }
}
