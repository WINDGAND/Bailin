/**
 * 一次性修复：对已有角色重跑 Phase 2（框架提炼），把心智模型写回 vault.db。
 *
 * 用法（在 apps/desktop 下）：
 *   pnpm exec electron ./scripts/repair-phase2-personality.mjs <characterId>
 *
 * 需先：pnpm run build:main（以及依赖包已 build）
 */
import { app } from "electron";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const characterId = process.argv[2];
if (!characterId) {
  console.error("用法: electron ./scripts/repair-phase2-personality.mjs <characterId>");
  process.exit(2);
}

// 与正在运行的桌面端对齐：强制指向已知 vault 根目录
const defaultVaultParent = join(homedir(), "AppData", "Roaming", "@bailin", "desktop");
if (process.env.BAILIN_USER_DATA) {
  app.setPath("userData", process.env.BAILIN_USER_DATA);
} else {
  app.setPath("userData", defaultVaultParent);
}

async function loadDist(rel) {
  const full = join(__dirname, "..", "dist", "main", "main", rel);
  return import(pathToFileURL(full).href);
}

app.whenReady().then(async () => {
  try {
    console.log("[repair] userData=", app.getPath("userData"));
    const { LocalVault } = await loadDist("store/local-vault.js");
    const { LLMAdapter } = await loadDist("adapters/llm-adapter.js");
    const { runPhase2SynthesisWithResearchGuard } = await loadDist(
      "orchestration/synthesis-pipeline.js"
    );

    const vault = new LocalVault();
    const listed = vault.listCharacters();
    console.log(
      "[repair] characters in vault:",
      listed.map((c) => `${c.id} ${c.name}`).join(" | ")
    );
    const bundle = vault.getCharacter(characterId);
    if (!bundle) {
      throw new Error(`找不到角色 ${characterId}`);
    }

    const docs = bundle.researchDocs ?? [];
    const okDocs = docs.filter((d) => d.status === "ok");
    console.log(
      `[repair] character=${bundle.card.meta.name} docs=${docs.length} ok=${okDocs.length}`
    );
    console.log(
      `[repair] current mentalModels:`,
      bundle.card.mentalModels.map((m) => m.name).join(" / ")
    );

    if (okDocs.length < 3) {
      throw new Error(`调研成功不足 3 路（${okDocs.length}），拒绝重跑 Phase 2`);
    }

    const llm = new LLMAdapter(() => {
      const json = vault.getSetting("llm_provider_json");
      const key = vault.getEncryptedString("llm_api_key_enc");
      if (!json || !key) return null;
      const rest = JSON.parse(json);
      return { ...rest, apiKey: key };
    });

    const config = {
      characterName: bundle.card.meta.name,
      sourceType: bundle.card.meta.sourceType,
      track: bundle.card.meta.track,
      enableWebSearch: false,
      concurrency: 6,
      agentTimeoutMs: 300000,
      researchModel: llm.getWebSearchModel()
    };

    const warnings = [];
    const result = await runPhase2SynthesisWithResearchGuard(
      llm,
      config,
      docs,
      warnings,
      {
        onAttempt: (attempt, max) => {
          console.log(`[repair] Phase2 attempt ${attempt}/${max}…`);
        }
      }
    );

    console.log("[repair] warnings:");
    for (const w of warnings) console.log(" -", w);

    if (!result.card) {
      throw new Error("Phase 2 仍失败，未写入数据库");
    }

    const now = Date.now();
    const old = bundle.card;
    const synth = result.card;

    // 保留外貌 / 座右铭 / 显示名等，只替换人格框架字段
    const merged = {
      ...synth,
      id: old.id,
      schemaVersion: old.schemaVersion,
      createdAt: old.createdAt,
      updatedAt: now,
      meta: {
        ...synth.meta,
        name: old.meta.name,
        chineseName: old.meta.chineseName ?? synth.meta.chineseName,
        englishName: old.meta.englishName ?? synth.meta.englishName,
        sourceName: old.meta.sourceName ?? synth.meta.sourceName,
        sourceType: old.meta.sourceType,
        track: old.meta.track,
        quoteOneLiner: old.meta.quoteOneLiner,
        quoteStatus: old.meta.quoteStatus,
        quoteStatusReason: old.meta.quoteStatusReason,
        avatarHint: old.meta.avatarHint,
        appearance: old.meta.appearance,
        disclaimer: (synth.meta.disclaimer || old.meta.disclaimer || "").replace(
          /当前为骨架版本。?/g,
          ""
        ).trim() || old.meta.disclaimer
      }
    };

    // 清掉骨架诚实边界噪音，保留新卡 notes
    if (merged.honestyBoundary?.notes) {
      merged.honestyBoundary = {
        ...merged.honestyBoundary,
        notes: merged.honestyBoundary.notes.filter(
          (n) => !n.includes("骨架角色") && !n.includes("深度蒸馏尚未完成")
        ),
        isHighInformationRichness:
          merged.honestyBoundary.isHighInformationRichness ?? true
      };
    }

    const newBundle = {
      ...bundle,
      card: merged,
      researchDocs: docs,
      qualityReport: bundle.qualityReport
    };

    vault.upsertCharacter({
      id: characterId,
      bundle: newBundle,
      isSkeleton: false,
      now
    });

    console.log("[repair] saved mentalModels:");
    for (const m of merged.mentalModels) {
      console.log(` - ${m.name}: ${m.oneLiner}`);
    }
    console.log("[repair] heuristics:", merged.heuristics.length);
    console.log("[repair] DONE");
    app.exit(0);
  } catch (e) {
    console.error("[repair] FAILED:", e);
    app.exit(1);
  }
});
