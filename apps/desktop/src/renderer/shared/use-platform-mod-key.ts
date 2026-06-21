import { useMemo } from "react";

/**
 * 返回当前平台的 Mod 键展示文本：macOS 用 "⌘"，其它平台用 "Ctrl"。
 * 用于 UI 提示（kbd / hint），让 Mac 用户看到正确的快捷键标记。
 *
 * 注意：这只是「展示文本」；实际事件监听仍然是 e.ctrlKey || e.metaKey。
 */
export function usePlatformModKey(): string {
  return useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl";
    const platform = navigator.platform || "";
    return /Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘" : "Ctrl";
  }, []);
}
