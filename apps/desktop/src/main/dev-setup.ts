import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ulid } from "ulid";
import log from "electron-log/main";
import { STARTER_BUNDLES } from "@nuwa-pet/starter-library";
import type { LocalVault } from "./store/local-vault.js";

/**
 * 开发期辅助：从 .env.dev 读取一份 DeepSeek（或其它 OpenAI 兼容提供商）的凭据，
 * 直接写入 LocalVault，并标记 first-run 完成，省得每次开 dev 都填一遍 Wizard。
 *
 * 触发条件：
 *   1. process.env.NUWA_PET_DEV === "1"（dev.mjs 已默认设置）
 *   2. NUWA_PET_DEV_SKIP_SETUP !== "0"
 *   3. .env.dev 文件存在或环境变量里已经有 NUWA_PET_LLM_API_KEY
 *
 * 生产打包后这函数不会被调用（main 里只在 dev 模式里 import + run）。
 */
export function applyDevSetup(vault: LocalVault): void {
  if (process.env.NUWA_PET_DEV !== "1") return;

  // 先尝试从 .env.dev 加载（项目根 / 当前工作目录 / 上溯）
  loadDotEnvDev();

  if (process.env.NUWA_PET_DEV_SKIP_SETUP === "0") {
    log.info("[dev-setup] NUWA_PET_DEV_SKIP_SETUP=0，跳过开发期凭据注入");
    return;
  }

  const apiKey = process.env.NUWA_PET_LLM_API_KEY?.trim();
  if (!apiKey) {
    log.info("[dev-setup] 未提供 NUWA_PET_LLM_API_KEY，保持标准 Wizard 流程");
    return;
  }

  const kind = (process.env.NUWA_PET_LLM_KIND ?? "openai-compatible").trim() as
    | "openai-compatible"
    | "anthropic-compatible";
  const baseUrl = (process.env.NUWA_PET_LLM_BASE_URL ?? "https://api.deepseek.com").trim();
  const model = (process.env.NUWA_PET_LLM_MODEL ?? "deepseek-v4-flash").trim();
  const visionModel = (
    process.env.NUWA_PET_VISION_MODEL ?? "bytedance/doubao-seed-2.0-lite-260428"
  ).trim();

  vault.setSetting(
    "llm_provider_json",
    JSON.stringify({ kind, baseUrl, model, visionModel })
  );
  vault.setEncryptedString("llm_api_key_enc", apiKey);
  vault.setSetting("first_run_done", "1");

  log.info(
    `[dev-setup] 已注入开发期凭据：kind=${kind}, baseUrl=${baseUrl}, model=${model}, visionModel=${visionModel}, key=*****${apiKey.slice(-4)}`
  );

  seedStarterLibraryIfEmpty(vault);

  // 支持开发期通过环境变量指定激活哪个 starter（按 sourceName 部分匹配）
  const activeHint = process.env.NUWA_PET_DEV_ACTIVE;
  if (activeHint) {
    const cleaned = activeHint.toLowerCase().trim();
    const all = vault.listCharacters();
    const match = all.find((c) =>
      (c.sourceName ?? "").toLowerCase().includes(cleaned) || c.name.toLowerCase().includes(cleaned)
    );
    if (match) {
      vault.setSetting("active_character_id", match.id);
      log.info(`[dev-setup] 已激活角色：${match.name}（匹配 NUWA_PET_DEV_ACTIVE=${activeHint}）`);
    } else {
      log.warn(`[dev-setup] 未找到匹配 NUWA_PET_DEV_ACTIVE=${activeHint} 的角色`);
    }
  }
}

/** 提升此值 → 下次启动 dev 会强制刷新所有 starter（保留用户自造的角色）。 */
const STARTER_SEED_VERSION = "v5-bilingual-quotes";

/**
 * 开发期 starter 种子：
 *   - 仓库为空 → 全量导入 6 个 starter
 *   - 已经有 starter 但 seed 版本旧了 → 按 sourceName 找到旧 starter，原地更新 bundle（保留 id 与时间戳）
 *   - 用户自造的角色（不是 starter）一律不动
 */
function seedStarterLibraryIfEmpty(vault: LocalVault): void {
  const existing = vault.listCharacters();
  const prevVersion = vault.getSetting("starter_seed_version");
  const now = Date.now();

  if (existing.length === 0) {
    let firstId: string | null = null;
    for (const starter of STARTER_BUNDLES) {
      const id = ulid();
      if (firstId == null) firstId = id;
      const bundle = {
        ...starter,
        card: { ...starter.card, id, createdAt: now, updatedAt: now }
      };
      vault.upsertCharacter({ id, bundle, isSkeleton: false, now });
    }
    if (firstId) vault.setSetting("active_character_id", firstId);
    vault.setSetting("starter_seed_version", STARTER_SEED_VERSION);
    log.info(`[dev-setup] 仓库为空，已导入 ${STARTER_BUNDLES.length} 个 starter；默认激活 ${firstId}`);
    return;
  }

  if (prevVersion === STARTER_SEED_VERSION) {
    log.info(`[dev-setup] 仓库已有 ${existing.length} 个角色，且 starter 已是 ${STARTER_SEED_VERSION}，跳过 seed`);
    return;
  }

  // 升级：按 sourceName 匹配旧 starter 并原地更新 bundle
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
    `[dev-setup] starter 升级到 ${STARTER_SEED_VERSION}：覆盖 ${updated} 个 starter（用户自造角色未动）`
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
      log.info(`[dev-setup] 已加载 ${path}`);
      return;
    } catch (e) {
      log.warn(`[dev-setup] 读取 ${path} 失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// 用于让 TypeScript 在 CommonJS 环境识别 __dirname
declare const __dirname: string;
