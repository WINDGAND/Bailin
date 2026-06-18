/**
 * 独立验证 Electron desktopCapturer 能否抓到主屏缩略图（480×270）。
 * 用法：pnpm exec electron ./scripts/test-screen-capture.mjs
 */
import { app, desktopCapturer } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

app.whenReady().then(async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 480, height: 270 }
    });
    if (!sources.length) {
      console.error("FAIL: no screen sources");
      app.exit(1);
      return;
    }
    const source = sources[0];
    if (!source || source.thumbnail.isEmpty()) {
      console.error("FAIL: empty thumbnail", source?.name);
      app.exit(1);
      return;
    }
    const out = join(tmpdir(), "bailin-screen-capture-test.png");
    writeFileSync(out, source.thumbnail.toPNG());
    console.log("OK:", out);
    console.log("source:", source.name, "size:", source.thumbnail.getSize());
    app.exit(0);
  } catch (e) {
    console.error("FAIL:", e);
    app.exit(1);
  }
});
