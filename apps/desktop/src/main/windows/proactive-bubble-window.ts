import { BrowserWindow } from "electron";
import { join } from "node:path";
import { PROACTIVE_BUBBLE_WINDOW_SIZE } from "../../shared/proactive-bubble-layout.js";

/**
 * 创建「主动陪伴」气泡窗口（无边框透明小窗）。
 *
 * 该窗口挂在桌宠旁边，用来展示耳语/主动搭话文案。它不抢任务栏、不抢焦点，
 * 始终置顶但不盖住全屏应用；尺寸来自共享布局常量，避免主进程与渲染层各写一套。
 *
 * @param devUrl 开发态 Vite 地址；有值时走 `loadURL`，打包后则加载本地 html。
 * @returns 尚未 `show` 的 BrowserWindow，由气泡宿主在需要展示时再定位并显示。
 */
export function createProactiveBubbleWindow(devUrl: string | undefined): BrowserWindow {
  const { width, height } = PROACTIVE_BUBBLE_WINDOW_SIZE;

  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../../../preload/preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  // screen-saver 层级保证盖过普通窗口；visibleOnFullScreen: false 避免挡住全屏游戏/演示。
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  // 气泡内有关闭/操作按钮，因此不忽略鼠标事件。
  win.setIgnoreMouseEvents(false);

  if (devUrl) {
    void win.loadURL(`${devUrl}/proactive-bubble.html`);
  } else {
    void win.loadFile(join(__dirname, "../../../renderer/proactive-bubble.html"));
  }

  return win;
}
