import { app, nativeImage, type NativeImage } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** 解析 logo.png：开发态在 apps/desktop/resources，打包后在 app 根目录 resources/。 */
export function resolveAppLogoPath(): string | null {
  const candidates = [
    join(app.getAppPath(), "resources", "logo.png"),
    join(__dirname, "../../../resources/logo.png")
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function loadAppIcon(size?: number): NativeImage {
  const path = resolveAppLogoPath();
  if (!path) return nativeImage.createEmpty();
  let img = nativeImage.createFromPath(path);
  if (size && !img.isEmpty()) {
    img = img.resize({ width: size, height: size, quality: "best" });
  }
  return img;
}
