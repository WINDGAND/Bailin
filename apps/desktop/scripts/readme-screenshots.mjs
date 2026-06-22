#!/usr/bin/env node
/**
 * 为 README 生成 assets/*.png（及可选 demo.gif）。
 * 前置：pnpm dev 已启动，Vite 在 http://127.0.0.1:5173
 *
 * 用法：node apps/desktop/scripts/readme-screenshots.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const ASSETS_DIR = join(REPO_ROOT, "assets");
const DEV_URL = process.env.VITE_DEV_SERVER || "http://127.0.0.1:5173";

const VIEWPORTS = {
  settings: { width: 1280, height: 800, deviceScaleFactor: 2 },
  chat: { width: 400, height: 520, deviceScaleFactor: 2 },
  pet: { width: 280, height: 360, deviceScaleFactor: 2 }
};

function loadVaultSnapshot() {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  const candidates = [
    join(appData, "@bailin", "desktop", "Bailin", "vault.db"),
    join(appData, "@nuwa-pet", "desktop", "Bailin", "vault.db")
  ];
  let dbPath = candidates.find((p) => existsSync(p));
  if (!dbPath) return null;
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const characters = db
      .prepare(
        `SELECT id, name, source_name, source_type, track, is_skeleton, bundle_json
         FROM characters ORDER BY updated_at DESC LIMIT 12`
      )
      .all();
    const activeRow = db
      .prepare("SELECT value FROM settings WHERE key = 'active_character_id'")
      .get();
    const activeId = activeRow?.value ?? characters[0]?.id ?? null;
    let activeBundle = null;
    if (activeId) {
      const row = db.prepare("SELECT bundle_json FROM characters WHERE id = ?").get(activeId);
      if (row?.bundle_json) activeBundle = JSON.parse(row.bundle_json);
    }
    let chatTurns = [];
    if (activeId) {
      const session = db
        .prepare(
          `SELECT id FROM chat_sessions WHERE character_id = ? ORDER BY updated_at DESC LIMIT 1`
        )
        .get(activeId);
      if (session?.id) {
        chatTurns = db
          .prepare(
            `SELECT id, role, content, created_at FROM chat_turns
             WHERE session_id = ? ORDER BY created_at ASC LIMIT 8`
          )
          .all(session.id);
      }
    }
    db.close();
    const list = characters.map((c, i) => ({
      id: c.id,
      name: c.name,
      sourceName: c.source_name ?? c.name,
      track: c.track,
      isSkeleton: Boolean(c.is_skeleton),
      isActive: c.id === activeId || (i === 0 && !activeId)
    }));
    const bundles = {};
    for (const c of characters.slice(0, 6)) {
      try {
        bundles[c.id] = JSON.parse(c.bundle_json);
      } catch {
        /* skip */
      }
    }
    return { list, bundles, activeId, activeBundle, chatTurns };
  } catch (err) {
    console.warn("[readme-screenshots] vault read failed:", err.message);
    return null;
  }
}

function buildStubPayload(snapshot) {
  const demoMessages =
    snapshot?.chatTurns?.length >= 2
      ? snapshot.chatTurns
      : [
          { id: "u1", role: "user", content: "我现在思路有点乱，怎么把这份文档砍到核心？", createdAt: Date.now() - 60000 },
          {
            id: "a1",
            role: "assistant",
            content:
              "先把每段的第一句话单独抽出来，看能否独立成立。不能独立成立的，要么合并进上一段，要么删掉。",
            createdAt: Date.now() - 30000
          }
        ];
  return {
    list: snapshot?.list?.length
      ? snapshot.list
      : [
          {
            id: "demo-1",
            name: "示例顾问",
            sourceName: "示例顾问",
            track: "utility",
            isSkeleton: false,
            isActive: true
          }
        ],
    bundles: snapshot?.bundles ?? {},
    activeId: snapshot?.activeId ?? snapshot?.list?.[0]?.id ?? "demo-1",
    activeBundle: snapshot?.activeBundle ?? null,
    chatTurns: demoMessages
  };
}

function injectStubScript(payload) {
  return `
    window.__README_SNAPSHOT__ = ${JSON.stringify(payload)};
    window.bailin = {
      app: {
        isFirstRun: () => Promise.resolve(false),
        completeFirstRun: () => Promise.resolve(),
        quit: () => Promise.resolve(),
        getLocale: () => Promise.resolve("zh"),
        setLocale: () => Promise.resolve(),
        getTheme: () => Promise.resolve("light"),
        setTheme: () => Promise.resolve(),
        openExternal: () => Promise.resolve({ ok: true })
      },
      llm: {
        setProvider: () => Promise.resolve({ ok: true }),
        getProvider: () => Promise.resolve({ kind: "openai-compatible", baseUrl: "https://api.example.com", model: "demo", visionModel: "demo" }),
        testConnection: () => Promise.resolve({ ok: true, latencyMs: 120 }),
        clearKey: () => Promise.resolve()
      },
      imageGen: {
        getConfig: () => Promise.resolve(null),
        setConfig: () => Promise.resolve({ ok: true }),
        detectCapability: () => Promise.resolve({ ok: true, reason: "demo" }),
        test: () => Promise.resolve({ ok: true, latencyMs: 800 }),
        clearKey: () => Promise.resolve()
      },
      characters: {
        list: () => Promise.resolve(window.__README_SNAPSHOT__.list),
        get: (id) => Promise.resolve(window.__README_SNAPSHOT__.bundles[id] ?? window.__README_SNAPSHOT__.activeBundle),
        getActive: () => Promise.resolve(window.__README_SNAPSHOT__.activeBundle),
        importStarter: () => Promise.resolve({ ok: false }),
        create: () => Promise.resolve({ ok: false }),
        createDeep: () => Promise.resolve({ ok: false }),
        approveDistillation: () => Promise.resolve({ ok: false }),
        cancelDistillation: () => Promise.resolve({ ok: false }),
        getResearchDocs: () => Promise.resolve([]),
        getResearchByCharacter: () => Promise.resolve({ docs: [] }),
        regenerateSprite: () => Promise.resolve({ ok: false }),
        regenerateAppearance: () => Promise.resolve({ ok: false }),
        delete: () => Promise.resolve({ ok: true }),
        activate: () => Promise.resolve({ ok: true }),
        listStarters: () => Promise.resolve([]),
        detectCapabilities: () => Promise.resolve({ webSearch: true, reason: "demo" }),
        detectVisionCapability: () => Promise.resolve({ vision: true, reason: "demo", visionModel: "demo", mainModel: "demo" }),
        probeVision: () => Promise.resolve({ ok: true }),
        probeWebSearch: () => Promise.resolve({ ok: true, realWebSearch: true, citations: 1 })
      },
      chat: {
        send: () => Promise.resolve({ requestId: "demo", userTurnId: "u", assistantTurnId: "a" }),
        cancel: () => Promise.resolve(),
        newSession: () => Promise.resolve({ sessionId: "demo-session" }),
        getActiveSession: () => Promise.resolve({ sessionId: "demo-session" }),
        getRecent: () => Promise.resolve(window.__README_SNAPSHOT__.chatTurns),
        listSessions: () => Promise.resolve([{ id: "demo-session", title: "新的对话", messageCount: 2, createdAt: Date.now(), updatedAt: Date.now() }]),
        switchSession: () => Promise.resolve({ ok: true }),
        renameSession: () => Promise.resolve({ ok: true }),
        deleteSession: () => Promise.resolve({ ok: true }),
        hide: () => Promise.resolve(),
        isVisible: () => Promise.resolve(true),
        getSize: () => Promise.resolve({ width: 400, height: 520 }),
        resize: () => Promise.resolve({ width: 400, height: 520 }),
        deleteTurn: () => Promise.resolve({ ok: true }),
        deleteTurnsFrom: () => Promise.resolve({ ok: true })
      },
      memory: {
        getProfile: () => Promise.resolve({ facts: [], preferences: [], updatedAt: Date.now() }),
        updateProfile: () => Promise.resolve({ facts: [], preferences: [], updatedAt: Date.now() }),
        clearProfile: () => Promise.resolve(),
        getPerCharacter: () => Promise.resolve([]),
        clearPerCharacter: () => Promise.resolve(),
        clearAll: () => Promise.resolve(),
        getSettings: () => Promise.resolve({ autoLearnEnabled: true }),
        setSettings: () => Promise.resolve({ autoLearnEnabled: true }),
        getRecentChanges: () => Promise.resolve([]),
        undoLastChange: () => Promise.resolve({ ok: false, reason: "demo" })
      },
      pet: {
        summon: () => Promise.resolve(),
        hush: () => Promise.resolve(),
        setPosition: () => Promise.resolve(),
        setMouseIgnore: () => Promise.resolve(),
        openChat: () => Promise.resolve(),
        openSettings: () => Promise.resolve(),
        hide: () => Promise.resolve(),
        setContextMenuOpen: () => Promise.resolve("right"),
        dragStart: () => Promise.resolve(),
        dragMove: () => Promise.resolve(),
        dragEnd: () => Promise.resolve()
      },
      proactiveBubble: { dismiss: () => Promise.resolve(), resize: () => Promise.resolve() },
      proactive: {
        getSettings: () => Promise.resolve({ enabled: false, frequency: "low", scenarios: {}, quietHours: { enabled: false, start: "23:00", end: "08:00" }, hushUntil: 0, smartScreenshot: false }),
        setSettings: (s) => Promise.resolve(s),
        getStatus: () => Promise.resolve({ enabled: false, nextEligibleAt: null, hushUntil: 0 }),
        triggerNow: () => Promise.resolve({ ok: false }),
        triggerLlmScreenshot: () => Promise.resolve({ ok: false }),
        focusMode: () => Promise.resolve()
      },
      on: {
        chatStream: () => () => {},
        chatVisibility: () => () => {},
        activeCharacterChanged: (h) => {
          queueMicrotask(() => h(window.__README_SNAPSHOT__.activeBundle));
          return () => {};
        },
        petSummon: () => () => {},
        proactiveWhisper: () => () => {},
        proactiveBubblePlacement: () => () => {},
        ambientSignal: () => () => {},
        distillationProgress: () => () => {},
        localeChanged: () => () => {},
        themeChanged: () => () => {},
        profileUpdated: () => () => {},
        navigateSettings: () => () => {},
        proactiveSettingsChanged: () => () => {}
      }
    };
    try {
      localStorage.setItem("bailin.locale", "zh");
      localStorage.setItem("bailin.theme", "light");
      localStorage.setItem("bailin.settingsSidebarCollapsed", "0");
    } catch {}
  `;
}

async function clickNav(page, label) {
  await page.waitForSelector("nav, aside, .settings-sidebar", { timeout: 15000 }).catch(() => {});
  const clicked = await page.evaluate((text) => {
    const nodes = Array.from(document.querySelectorAll("button, a, [role='tab'], li"));
    const hit = nodes.find((n) => (n.textContent ?? "").includes(text));
    if (hit) {
      hit.click();
      return true;
    }
    return false;
  }, label);
  if (!clicked) throw new Error(`nav not found: ${label}`);
  await new Promise((r) => setTimeout(r, 900));
}

async function capturePage(browser, path, viewport, outfile, beforeReady) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(injectStubScript(buildStubPayload(loadVaultSnapshot())));
  await page.goto(`${DEV_URL}${path}`, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  if (beforeReady) await beforeReady(page);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: outfile, type: "png" });
  await page.close();
  console.log(`[readme-screenshots] wrote ${outfile}`);
}

async function compositeHero(paths) {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn("[readme-screenshots] sharp not installed, skipping hero composite");
    return false;
  }
  const { library, create, chat, pet } = paths;
  const W = 1600;
  const H = 900;
  const bg = sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 250, g: 247, b: 242 }
    }
  });
  const lib = await sharp(library).resize(980, 614, { fit: "cover", position: "left top" }).png().toBuffer();
  const chatBuf = await sharp(chat).resize(360, 468, { fit: "inside" }).png().toBuffer();
  const petBuf = await sharp(pet).resize(200, 257, { fit: "inside" }).png().toBuffer();
  const createBuf = await sharp(create).resize(320, 200, { fit: "cover", position: "top" }).png().toBuffer();
  await bg
    .composite([
      { input: lib, top: 72, left: 48 },
      { input: createBuf, top: 72, left: 1050, blend: "over" },
      { input: petBuf, top: 580, left: 1180, blend: "over" },
      { input: chatBuf, top: 340, left: 1180, blend: "over" }
    ])
    .png()
    .toFile(paths.hero);
  console.log(`[readme-screenshots] wrote ${paths.hero}`);
  return true;
}

function tryMakeDemoGif(framePaths, outGif) {
  return tryMakeDemoGifSharp(framePaths, outGif).then((ok) => {
    if (ok) return true;
    return tryMakeDemoGifFfmpeg(framePaths, outGif);
  });
}

async function tryMakeDemoGifSharp(framePaths, outGif) {
  try {
    const sharp = (await import("sharp")).default;
    const frames = await Promise.all(
      framePaths.map((p) => sharp(p).resize(640).png().toBuffer())
    );
    await sharp(frames, { animated: true, delay: 900 }).gif({ loop: 0 }).toFile(outGif);
    console.log(`[readme-screenshots] wrote ${outGif}`);
    return true;
  } catch (err) {
    console.warn("[readme-screenshots] sharp gif failed:", err.message);
    return false;
  }
}

function tryMakeDemoGifFfmpeg(framePaths, outGif) {
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (ffmpeg.status !== 0) {
    console.warn("[readme-screenshots] ffmpeg not found, demo.gif skipped");
    return false;
  }
  const listFile = join(ASSETS_DIR, "_demo_frames.txt");
  const content = framePaths
    .flatMap((p) => [`file '${p.replace(/\\/g, "/")}'`, "duration 2"])
    .concat([`file '${framePaths.at(-1).replace(/\\/g, "/")}'`])
    .join("\n");
  writeFileSync(listFile, content, "utf8");
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "fps=2,scale=640:-1:flags=lanczos", outGif],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.warn("[readme-screenshots] ffmpeg failed:", r.stderr?.slice(0, 400));
    return false;
  }
  console.log(`[readme-screenshots] wrote ${outGif}`);
  return true;
}

async function main() {
  mkdirSync(ASSETS_DIR, { recursive: true });
  try {
    const res = await fetch(`${DEV_URL}/settings.html`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    console.error("[readme-screenshots] Vite 未就绪。请先运行: pnpm dev");
    process.exit(1);
  }

  let puppeteer;
  try {
    puppeteer = await import("puppeteer");
  } catch {
    console.error("[readme-screenshots] 请先安装: cd apps/desktop && pnpm add -D puppeteer sharp");
    process.exit(1);
  }

  const out = {
    library: join(ASSETS_DIR, "library.png"),
    create: join(ASSETS_DIR, "create.png"),
    chat: join(ASSETS_DIR, "chat.png"),
    pet: join(ASSETS_DIR, "pet.png"),
    hero: join(ASSETS_DIR, "hero.png"),
    demo: join(ASSETS_DIR, "demo.gif")
  };

  const launchOpts = {
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"]
  };
  for (const channel of ["msedge", "chrome"]) {
    try {
      var browser = await puppeteer.default.launch({ ...launchOpts, channel });
      break;
    } catch {
      /* try next */
    }
  }
  if (!browser) {
    browser = await puppeteer.default.launch(launchOpts);
  }

  await capturePage(browser, "/settings.html", VIEWPORTS.settings, out.library, async (page) => {
    await clickNav(page, "角色仓库");
  });

  await capturePage(browser, "/settings.html", VIEWPORTS.settings, out.create, async (page) => {
    await clickNav(page, "创建角色");
  });

  await capturePage(browser, "/chat.html", VIEWPORTS.chat, out.chat);
  await capturePage(browser, "/pet.html", VIEWPORTS.pet, out.pet);

  await browser.close();

  await compositeHero(out);

  const demoFrames = [out.library, out.create, out.pet, out.chat].filter(existsSync);
  const gifOk = await tryMakeDemoGif(demoFrames, out.demo);
  if (!gifOk && existsSync(out.hero)) {
    const demoPng = join(ASSETS_DIR, "demo.png");
    writeFileSync(demoPng, readFileSync(out.hero));
    console.log(`[readme-screenshots] fallback demo.png from hero`);
  }
}

void main().catch((err) => {
  console.error("[readme-screenshots] fatal:", err);
  process.exit(1);
});
