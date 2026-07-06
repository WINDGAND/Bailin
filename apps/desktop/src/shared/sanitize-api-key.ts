/**
 * 清理从网页复制粘贴过来的 API Key。
 *
 * 背景：用户从服务商控制台网页复制 Key 时，浏览器/页面渲染方式可能带入肉眼不可见的
 * 字符——零宽空格（U+200B-200D）、BOM/ZWNBSP（U+FEFF）、不间断空格（U+00A0）、
 * 甚至因为页面用表格/多行容器渲染而带入换行。这些字符对用户完全不可见，却会让
 * Bearer token 鉴权静默失败（HTTP 401），且每个用户的浏览器/操作系统环境不同，
 * 开发者本地用自己的 Key 测试永远无法复现。
 *
 * API Key 本身不应包含任何空白字符，所以这里直接清掉全部空白（不只是首尾 trim）。
 */
export function sanitizeApiKey(raw: string): string {
  return raw.replace(/[\u200B-\u200D]/g, "").replace(/\s/g, "");
}
