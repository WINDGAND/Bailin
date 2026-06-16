import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

/**
 * 桌宠窗口的"内容尺寸"常量，clamp / setContentBounds 全程都以它为准。
 *
 * 为什么固定下来：Electron 在 Windows 非整数 DPI（125% / 150% / 175% 等）上
 * 存在已知 bug —— 反复 setPosition / setBounds 会让 getBounds() 返回的
 * width/height 微量增大（DIP↔物理像素舍入累积，electron #27651）。
 * 拖动桌宠每帧都用 getBounds() 实时读尺寸去 clamp，结果 maxX/maxY 越缩越小，
 * 表现就是用户看到的"活动范围越用越小，最后只能在一条线上拖"。
 *
 * 固化成常量后，clamp 永远用同一组宽高，不再被运行时的尺寸漂移污染；
 * 同时所有调用都改用 setContentBounds（不受同 bug 影响），双重保险。
 */
export const PET_WINDOW_SIZE = { width: 240, height: 260 } as const;

export function createPetWindow(devUrl: string | undefined): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  // 气泡已经搬去独立的 BrowserWindow，桌宠窗口只需要装 sprite + 阴影 +
  // 拖动手柄。维持紧凑尺寸，让用户能把桌宠拖到屏幕真正的边角。
  const { width, height } = PET_WINDOW_SIZE;

  const win = new BrowserWindow({
    width,
    height,
    x: work.x + work.width - width - 24,
    y: work.y + work.height - height - 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../../../preload/preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  // 默认接收鼠标事件；渲染层在 mount 后会按区域切换 setIgnoreMouseEvents。
  win.setIgnoreMouseEvents(false);

  if (devUrl) {
    void win.loadURL(`${devUrl}/pet.html`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/pet.html"));
  }

  return win;
}
