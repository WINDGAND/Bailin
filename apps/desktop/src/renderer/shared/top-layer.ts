export type TopLayerHost = {
  setAttribute(name: string, value: string): void;
  matches(selector: string): boolean;
  showPopover?: () => void;
  hidePopover?: () => void;
};

let registered: TopLayerHost | null = null;

/**
 * 把浮层放进浏览器 top layer。
 * 普通 z-index 会输给角色卡片上的 view-transition-name / backdrop-filter 合成层。
 */
export function promoteToTopLayer(el: TopLayerHost): void {
  el.setAttribute("popover", "manual");
  if (typeof el.showPopover !== "function") return;
  try {
    if (!el.matches(":popover-open")) el.showPopover();
  } catch {
    // 已打开、尚未挂到 document，或运行时不支持 popover。
  }
}

export function registerTopLayerHost(el: TopLayerHost | null): void {
  registered = el;
  if (el) promoteToTopLayer(el);
}

/**
 * 保持 toast 在 top layer。禁止 hidePopover 再 show：
 * 关闭 popover 会让宿主 display:none，造成「上-下-上」闪挡。
 */
export function restackTopLayer(): void {
  if (!registered) return;
  promoteToTopLayer(registered);
}
