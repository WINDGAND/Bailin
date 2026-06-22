#!/usr/bin/env node
/**
 * 从 resources/logo.png 生成 resources/icon.ico（多尺寸），供 Windows exe / 快捷方式使用。
 * 用法：node generate-win-icon.mjs [appRoot]
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(process.argv[2] ?? join(__dirname, ".."));
const logoPath = join(appRoot, "resources", "logo.png");
const icoPath = join(appRoot, "resources", "icon.ico");

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = await Promise.all(
  sizes.map((size) => sharp(logoPath).resize(size, size).png().toBuffer())
);
writeFileSync(icoPath, await toIco(pngBuffers));
console.log(`[generate-win-icon] ${icoPath} (${sizes.join(", ")}px)`);
