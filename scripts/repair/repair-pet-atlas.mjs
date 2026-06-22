#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 批量修复已有角色的 atlas 透明洞问题。
 *
 * 优先使用 raw-row-*.png 重跑连通 chroma + 裁帧 + 拼 atlas；
 * 若无 raw-row，则对现有 spritesheet 逐帧做内部洞修复。
 *
 * 用法：
 *   pnpm --filter=@bailin/character-protocol run build
 *   pnpm --filter=@bailin/pet-atlas-tools run build
 *   node scripts/repair/repair-pet-atlas.mjs --character-id <id>
 *   node scripts/repair/repair-pet-atlas.mjs --all
 *   node scripts/repair/repair-pet-atlas.mjs --all --dry-run
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const protocolPath = resolve(repoRoot, "packages/character-protocol/dist/index.cjs");
const toolsPath = resolve(repoRoot, "packages/pet-atlas-tools/dist/index.cjs");

if (!existsSync(protocolPath) || !existsSync(toolsPath)) {
  console.error(
    "[repair-pet-atlas] 缺少 dist 产物；请先 build character-protocol 与 pet-atlas-tools"
  );
  process.exit(2);
}

const {
  DEFAULT_ATLAS_CELL,
  DEFAULT_ATLAS_GRID,
  DEFAULT_ROW_FRAME_COUNTS,
  HATCH_PET_ROW_STATES
} = require(protocolPath);
const {
  composeAtlas,
  decodePng,
  encodePng,
  extract,
  extractStripFrames,
  normalizeTransparentRgb,
  paste,
  repairInteriorAlphaHoles,
  blankImage,
  validateAtlas
} = require(toolsPath);

const CHROMA_GREEN = { r: 0, g: 255, b: 0 };
const CHROMA_WHITE = { r: 255, g: 255, b: 255 };

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const allChars = args.includes("--all");
const idIdx = args.indexOf("--character-id");
const characterIdArg = idIdx >= 0 ? args[idIdx + 1] : null;

if (!allChars && !characterIdArg) {
  console.error("用法: node scripts/repair/repair-pet-atlas.mjs --character-id <id> | --all [--dry-run]");
  process.exit(1);
}

function openVaultDb(dbPath, readonly) {
  try {
    let BetterSqlite3;
    try {
      BetterSqlite3 = require(resolve(repoRoot, "apps/desktop/node_modules/better-sqlite3"));
    } catch {
      BetterSqlite3 = require("better-sqlite3");
    }
    const db = new BetterSqlite3(dbPath, { readonly });
    return {
      getBundle(characterId) {
        return db.prepare("SELECT bundle_json FROM characters WHERE id = ?").get(characterId);
      },
      updateBundle(characterId, bundleJson) {
        db
          .prepare("UPDATE characters SET bundle_json = ?, updated_at = ? WHERE id = ?")
          .run(bundleJson, Date.now(), characterId);
      },
      close() {
        db.close();
      }
    };
  } catch {
    const db = new DatabaseSync(dbPath, readonly ? { readOnly: true } : {});
    return {
      getBundle(characterId) {
        return db.prepare("SELECT bundle_json FROM characters WHERE id = ?").get(characterId);
      },
      updateBundle(characterId, bundleJson) {
        db
          .prepare("UPDATE characters SET bundle_json = ?, updated_at = ? WHERE id = ?")
          .run(bundleJson, Date.now(), characterId);
      },
      close() {
        db.close();
      }
    };
  }
}

const vaultRoot = resolveVaultRoot();
const dbPath = join(vaultRoot, "vault.db");
if (!existsSync(dbPath)) {
  console.error(`[repair-pet-atlas] 未找到 vault.db：${dbPath}`);
  process.exit(1);
}

const db = openVaultDb(dbPath, dryRun);
const charactersDir = join(vaultRoot, "characters");
const targetIds = allChars ? listCharacterIds(charactersDir) : [characterIdArg];

console.log(`[repair-pet-atlas] vault=${vaultRoot} dryRun=${dryRun} targets=${targetIds.length}`);

let repaired = 0;
let skipped = 0;
let failed = 0;

for (const characterId of targetIds) {
  const petDir = join(charactersDir, characterId, "pet");
  if (!existsSync(petDir)) {
    console.log(`  skip ${characterId}: 无 pet 目录`);
    skipped += 1;
    continue;
  }

  try {
    const result = repairCharacter(characterId, petDir);
    if (result.kind === "skipped") {
      console.log(`  skip ${characterId}: ${result.reason}`);
      skipped += 1;
    } else {
      console.log(`  ok   ${characterId}: ${result.mode} (${result.detail})`);
      repaired += 1;
    }
  } catch (e) {
    console.log(`  FAIL ${characterId}: ${e instanceof Error ? e.message : String(e)}`);
    failed += 1;
  }
}

if (!dryRun) db.close();
console.log(
  `\n[repair-pet-atlas] done repaired=${repaired} skipped=${skipped} failed=${failed}`
);
process.exit(failed > 0 ? 1 : 0);

function repairCharacter(characterId, petDir) {
  const atlasPath = join(petDir, "spritesheet.png");
  const rawRows = HATCH_PET_ROW_STATES.filter((state) =>
    existsSync(join(petDir, `raw-row-${state}.png`))
  );

  let atlasPng;
  let mode;
  if (rawRows.length > 0) {
    const chroma = loadChromaConfig(petDir);
    const rowFramesPng = {};
    for (const rowState of HATCH_PET_ROW_STATES) {
      const rawPath = join(petDir, `raw-row-${rowState}.png`);
      if (!existsSync(rawPath)) continue;
      const stripPng = readFileSync(rawPath);
      const slot = {
        rowIndex: HATCH_PET_ROW_STATES.indexOf(rowState),
        frameCount: DEFAULT_ROW_FRAME_COUNTS[rowState],
        stripPng,
        rowState,
        ...chroma
      };
      if (chroma.skipChroma) {
        delete slot.chromaKey;
      }
      const frames = extractStripFrames(slot, DEFAULT_ATLAS_CELL);
      rowFramesPng[rowState] = frames.map((f) => f.png);
    }
    const composeRows = HATCH_PET_ROW_STATES.map((state, idx) => ({
      rowIndex: idx,
      framesPng: rowFramesPng[state] ?? []
    }));
    atlasPng = composeAtlas({
      cell: DEFAULT_ATLAS_CELL,
      grid: DEFAULT_ATLAS_GRID,
      rows: composeRows
    });
    mode = "reextract";
  } else if (existsSync(atlasPath)) {
    atlasPng = repairAtlasInPlace(readFileSync(atlasPath));
    mode = "in-place";
  } else {
    return { kind: "skipped", reason: "无 raw-row 且无 spritesheet.png" };
  }

  const rowFrameCounts = {};
  const rowStates = {};
  HATCH_PET_ROW_STATES.forEach((state, idx) => {
    rowFrameCounts[idx] = DEFAULT_ROW_FRAME_COUNTS[state];
    rowStates[idx] = state;
  });
  const validation = validateAtlas({
    atlasPng,
    cell: DEFAULT_ATLAS_CELL,
    grid: DEFAULT_ATLAS_GRID,
    rowFrameCounts,
    rowStates,
    minOpaquePerFrame: Math.floor(
      DEFAULT_ATLAS_CELL.width * DEFAULT_ATLAS_CELL.height * 0.015
    )
  });

  const holeIssues = validation.issues.filter((i) => i.includes("内部透明洞"));
  const detail = `holes=${holeIssues.length} validationOk=${validation.ok}`;

  if (dryRun) return { kind: "ok", mode, detail: `dry-run ${detail}` };

  writeFileSync(atlasPath, atlasPng);
  updateBundleSpritesheet(db, characterId, atlasPng);
  patchHatchRun(petDir, mode);
  return { kind: "ok", mode, detail };
}

function repairAtlasInPlace(atlasBuffer) {
  const cell = DEFAULT_ATLAS_CELL;
  const grid = DEFAULT_ATLAS_GRID;
  const src = decodePng(atlasBuffer);
  const out = blankImage(src.width, src.height);
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.columns; col += 1) {
      let frame = extract(
        src,
        col * cell.width,
        row * cell.height,
        cell.width,
        cell.height
      );
      frame = repairInteriorAlphaHoles(frame);
      frame = normalizeTransparentRgb(frame);
      paste(out, frame, col * cell.width, row * cell.height);
    }
  }
  return encodePng(out);
}

function loadChromaConfig(petDir) {
  const manifestPath = join(petDir, "hatch-run.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.chromaKey) {
      const isGreen =
        manifest.chromaStrategy === "green" ||
        (manifest.chromaKey.g > 200 &&
          manifest.chromaKey.r < 40 &&
          manifest.chromaKey.b < 40);
      return {
        chromaKey: manifest.chromaKey,
        chromaSeedThreshold: manifest.chromaSeedThreshold ?? (isGreen ? 60 : 30),
        chromaSpillThreshold: manifest.chromaSpillThreshold ?? (isGreen ? 75 : 40),
        chromaGreenSpill: isGreen
      };
    }
    if (manifest.chromaStrategy === "white") {
      return buildChromaSlot(CHROMA_WHITE);
    }
    if (manifest.chromaStrategy === "green") {
      return buildChromaSlot(CHROMA_GREEN);
    }
    if (manifest.chromaStrategy === "native-alpha") {
      return { skipChroma: true };
    }
  }
  return inferChromaFromRawRows(petDir);
}

/** 从 raw-row 边缘像素推断孵化时实际使用的背景（旧 hatch-run 无 chromaKey 时）。 */
function inferChromaFromRawRows(petDir) {
  const probeNames = HATCH_PET_ROW_STATES.map((s) => `raw-row-${s}.png`);
  for (const name of probeNames) {
    const rawPath = join(petDir, name);
    if (!existsSync(rawPath)) continue;
    const img = decodePng(readFileSync(rawPath));
    const border = sampleBorderStats(img);
    if (border.transparentRatio >= 0.6) {
      return { skipChroma: true };
    }
    if (border.avgR > 200 && border.avgG > 200 && border.avgB > 200) {
      console.log(`    (chroma 推断: 白底 ← ${name})`);
      return buildChromaSlot(CHROMA_WHITE);
    }
    if (border.avgG > border.avgR + 40 && border.avgG > border.avgB + 40) {
      console.log(`    (chroma 推断: 绿幕 ← ${name})`);
      return buildChromaSlot(CHROMA_GREEN);
    }
  }
  console.log("    (chroma 推断: 无法判定，兜底绿幕)");
  return buildChromaSlot(CHROMA_GREEN);
}

function sampleBorderStats(img) {
  const { width, height, data } = img;
  let total = 0;
  let transparent = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  const sample = (x, y) => {
    total += 1;
    const i = (y * width + x) * 4;
    const a = data[i + 3] ?? 0;
    if (a < 16) {
      transparent += 1;
      return;
    }
    sr += data[i] ?? 0;
    sg += data[i + 1] ?? 0;
    sb += data[i + 2] ?? 0;
  };
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 64))) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 64))) {
    sample(0, y);
    sample(width - 1, y);
  }
  const opaque = total - transparent;
  return {
    transparentRatio: total === 0 ? 0 : transparent / total,
    avgR: opaque ? sr / opaque : 0,
    avgG: opaque ? sg / opaque : 0,
    avgB: opaque ? sb / opaque : 0
  };
}

function buildChromaSlot(chromaKey) {
  const isWhite = chromaKey.r > 200 && chromaKey.g > 200 && chromaKey.b > 200;
  return {
    chromaKey,
    chromaSeedThreshold: isWhite ? 30 : 60,
    chromaSpillThreshold: isWhite ? 40 : 75,
    chromaGreenSpill: !isWhite
  };
}

function updateBundleSpritesheet(dbConn, characterId, atlasPng) {
  const row = dbConn.getBundle(characterId);
  if (!row?.bundle_json) {
    throw new Error("characters 表无 bundle_json");
  }
  const bundle = JSON.parse(row.bundle_json);
  if (bundle.sprite?.mode !== "atlas" || !bundle.sprite.atlas) {
    throw new Error("角色不是 atlas 模式，跳过 bundle 回写");
  }
  bundle.sprite.atlas.spritesheetUrl = bufferToDataUrl(atlasPng, "image/png");
  dbConn.updateBundle(characterId, JSON.stringify(bundle));
}

function patchHatchRun(petDir, mode) {
  const manifestPath = join(petDir, "hatch-run.json");
  let manifest = {};
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  }
  manifest.chromaPipelineVersion = 2;
  manifest.repairedAt = Date.now();
  manifest.repairMode = mode;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function bufferToDataUrl(buffer, mime) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function resolveVaultRoot() {
  if (process.env.BAILIN_DATA_DIR) return process.env.BAILIN_DATA_DIR;
  const appData = process.env.APPDATA;
  if (!appData) throw new Error("APPDATA 未设置");
  const candidates = [
    join(appData, "Bailin"),
    join(appData, "@bailin", "desktop", "Bailin"),
    join(appData, "Electron", "Bailin"),
    join(appData, "NuwaPet")
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "vault.db"))) return c;
  }
  return join(appData, "@bailin", "desktop", "Bailin");
}

function listCharacterIds(charactersDir) {
  if (!existsSync(charactersDir)) return [];
  return readdirSync(charactersDir).filter((name) => {
    const p = join(charactersDir, name);
    return statSync(p).isDirectory();
  });
}
