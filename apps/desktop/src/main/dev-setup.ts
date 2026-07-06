import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ulid } from "ulid";
import log from "electron-log/main";
import { STARTER_BUNDLES } from "../shared/starters.js";
import { sanitizeApiKey } from "../shared/sanitize-api-key.js";
import type { LocalVault } from "./store/local-vault.js";

/** 读开发环境变量：优先 BAILIN_*，兼容旧版 NUWA_PET_*。 */
function devEnv(name: string): string | undefined {
  return process.env[`BAILIN_${name}`] ?? process.env[`NUWA_PET_${name}`];
}

/**
 * 开发期辅助：从 .env.dev 读取一份 DeepSeek（或其它 OpenAI 兼容提供商）的凭据，
 * 直接写入 LocalVault，并标记 first-run 完成，省得每次开 dev 都填一遍 Wizard。
 *
 * 触发条件：
 *   1. process.env.BAILIN_DEV === "1"（dev.mjs 已默认设置）
 *   2. BAILIN_DEV_SKIP_SETUP !== "0"
 *   3. .env.dev 文件存在或环境变量里已经有 BAILIN_LLM_API_KEY
 *
 * 生产打包后这函数不会被调用（main 里只在 dev 模式里 import + run）。
 */
export function applyDevSetup(vault: LocalVault): void {
  if (devEnv("DEV") !== "1") return;

  // 先尝试从 .env.dev 加载（项目根 / 当前工作目录 / 上溯）
  loadDotEnvDev();

  if (devEnv("DEV_SKIP_SETUP") === "0") {
    log.info("[dev-setup] BAILIN_DEV_SKIP_SETUP=0, skipping dev credential injection");
    return;
  }

  const apiKey = devEnv("LLM_API_KEY")?.trim();
  if (!apiKey) {
    log.info("[dev-setup] BAILIN_LLM_API_KEY not set, using standard setup wizard");
    return;
  }

  const kind = (devEnv("LLM_KIND") ?? "openai-compatible").trim() as
    | "openai-compatible"
    | "anthropic-compatible";
  const baseUrl = (devEnv("LLM_BASE_URL") ?? "https://api.deepseek.com").trim();
  const model = (devEnv("LLM_MODEL") ?? "deepseek-v4-flash").trim();
  const visionModel = (
    devEnv("VISION_MODEL") ?? "bytedance/doubao-seed-2.0-lite-260428"
  ).trim();

  vault.setSetting(
    "llm_provider_json",
    JSON.stringify({ kind, baseUrl, model, visionModel })
  );
  vault.setEncryptedString("llm_api_key_enc", sanitizeApiKey(apiKey));
  vault.setSetting("first_run_done", "1");

  log.info(
    `[dev-setup] injected dev credentials: kind=${kind}, baseUrl=${baseUrl}, model=${model}, visionModel=${visionModel}, key=*****${apiKey.slice(-4)}`
  );

  seedStarterLibraryIfEmpty(vault);

  // 支持开发期通过环境变量指定激活哪个 starter（按 sourceName 部分匹配）
  const activeHint = devEnv("DEV_ACTIVE");
  if (activeHint) {
    const cleaned = activeHint.toLowerCase().trim();
    const all = vault.listCharacters();
    const match = all.find((c) =>
      (c.sourceName ?? "").toLowerCase().includes(cleaned) || c.name.toLowerCase().includes(cleaned)
    );
    if (match) {
      vault.setSetting("active_character_id", match.id);
      log.info(`[dev-setup] activated character: ${match.name} (BAILIN_DEV_ACTIVE=${activeHint})`);
    } else {
      log.warn(`[dev-setup] no character matched BAILIN_DEV_ACTIVE=${activeHint}`);
    }
  }
}

/** 开发期 starter 种子（当前无内置 starter，仅记录版本号以跳过旧逻辑）。 */
const STARTER_SEED_VERSION = "v6-no-starters";

function seedStarterLibraryIfEmpty(vault: LocalVault): void {
  if (STARTER_BUNDLES.length === 0) {
    vault.setSetting("starter_seed_version", STARTER_SEED_VERSION);
    log.info("[dev-setup] no bundled starters, skipping seed import");
    return;
  }

  const existing = vault.listCharacters();
  const prevVersion = vault.getSetting("starter_seed_version");
  const now = Date.now();

  if (existing.length === 0) {
    for (const starter of STARTER_BUNDLES) {
      const id = ulid();
      const bundle = {
        ...starter,
        card: { ...starter.card, id, createdAt: now, updatedAt: now }
      };
      vault.upsertCharacter({ id, bundle, isSkeleton: false, now });
    }
    vault.setSetting("starter_seed_version", STARTER_SEED_VERSION);
    log.info(`[dev-setup] empty vault, imported ${STARTER_BUNDLES.length} starters`);
    return;
  }

  if (prevVersion === STARTER_SEED_VERSION) {
    log.info(
      `[dev-setup] vault has ${existing.length} characters and starter seed is ${STARTER_SEED_VERSION}, skipping seed`
    );
    return;
  }

  let updated = 0;
  for (const starter of STARTER_BUNDLES) {
    const old = existing.find((c) => c.sourceName === starter.card.meta.sourceName);
    if (!old) continue;
    const oldBundle = vault.getCharacter(old.id);
    if (!oldBundle) continue;
    const merged = {
      ...starter,
      card: {
        ...starter.card,
        id: old.id,
        createdAt: oldBundle.card.createdAt,
        updatedAt: now
      }
    };
    vault.upsertCharacter({ id: old.id, bundle: merged, isSkeleton: false, now });
    updated += 1;
  }
  vault.setSetting("starter_seed_version", STARTER_SEED_VERSION);
  log.info(
    `[dev-setup] starter upgraded to ${STARTER_SEED_VERSION}: updated ${updated} bundled characters (user-created unchanged)`
  );
}

function loadDotEnvDev(): void {
  const candidates: string[] = [];
  // 1) 项目根（CAO/）
  candidates.push(resolve(process.cwd(), ".env.dev"));
  candidates.push(resolve(process.cwd(), "../../.env.dev"));
  // 2) __dirname 上溯（编译后 main 在 dist/main/main/，需要爬 5 层到仓库根）
  try {
    candidates.push(resolve(__dirname, "../../../../../.env.dev"));
    candidates.push(resolve(__dirname, "../../../../.env.dev"));
  } catch {
    // ignore
  }

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      log.info("[dev-setup] loaded .env.dev");
      return;
    } catch (e) {
      log.warn(`[dev-setup] failed to read .env.dev: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// 用于让 TypeScript 在 CommonJS 环境识别 __dirname
declare const __dirname: string;
