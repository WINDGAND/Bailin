import { desktopCapturer } from "electron";
import type { ProactiveSettings } from "../../shared/ipc-contract.js";

export interface ScreenSnapshot {
  dataUrl: string;
  capturedAt: number;
  sourceName: string;
}

/**
 * 显式授权后的低频屏幕缩略图捕获。默认不被主动陪伴调用；
 * 只有 settings.screenAwareness === "screenshots" 时，上层才允许使用。
 */
export class ScreenCaptureService {
  canCapture(settings: ProactiveSettings): boolean {
    return settings.screenAwareness === "screenshots";
  }

  async capturePrimaryThumbnail(): Promise<ScreenSnapshot | null> {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 480, height: 270 }
    });
    const source = sources[0];
    if (!source || source.thumbnail.isEmpty()) return null;
    return {
      dataUrl: source.thumbnail.toDataURL(),
      capturedAt: Date.now(),
      sourceName: source.name
    };
  }
}
