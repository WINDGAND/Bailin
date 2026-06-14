import Database from "better-sqlite3";
import { app, safeStorage } from "electron";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CharacterBundle,
  DistillationJob,
  DistillationJobStatus,
  ResearchDoc
} from "@nuwa-pet/character-protocol";
import { RESEARCH_AGENT_LABELS } from "@nuwa-pet/character-protocol";

const USER_DATA_DIR = "Bailin";
const LEGACY_USER_DATA_DIR = "NuwaPet";

function resolveUserDataRoot(): string {
  const base = app.getPath("userData");
  const root = join(base, USER_DATA_DIR);
  const legacy = join(base, LEGACY_USER_DATA_DIR);
  if (!existsSync(root) && existsSync(legacy)) {
    try {
      renameSync(legacy, root);
    } catch {
      return legacy;
    }
  }
  return root;
}

/**
 * LocalVault：本地持久化。
 * - characters / settings / user_profile / per_character_notes / chat_turns
 * - research_docs / distillation_jobs（深度蒸馏新增）
 * - API Key 用 safeStorage (Windows DPAPI) 加密
 */
export class LocalVault {
  private db: Database.Database;
  private rootDir: string;

  constructor() {
    this.rootDir = resolveUserDataRoot();
    mkdirSync(this.rootDir, { recursive: true });
    this.db = new Database(join(this.rootDir, "vault.db"));
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  /** 给上层（orchestrator）拼调研存档目录用：%APPDATA%/Bailin/research/<charId>/。 */
  getResearchDir(characterId: string): string {
    const dir = join(this.rootDir, "research", characterId);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_name TEXT,
        source_type TEXT NOT NULL,
        track TEXT NOT NULL,
        is_skeleton INTEGER NOT NULL DEFAULT 0,
        bundle_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS per_character_notes (
        character_id TEXT PRIMARY KEY,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_turns (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_turns(character_id, session_id, created_at);

      CREATE TABLE IF NOT EXISTS distillation_jobs (
        id TEXT PRIMARY KEY,
        character_id TEXT,
        character_name TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        warnings_json TEXT NOT NULL DEFAULT '[]',
        config_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_updated ON distillation_jobs(updated_at DESC);

      CREATE TABLE IF NOT EXISTS research_docs (
        job_id TEXT NOT NULL,
        character_id TEXT,
        agent_id INTEGER NOT NULL,
        agent_name TEXT NOT NULL,
        markdown TEXT NOT NULL,
        sources_json TEXT NOT NULL DEFAULT '[]',
        confidence TEXT NOT NULL,
        web_search_used INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ok',
        error_message TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (job_id, agent_id)
      );
      CREATE INDEX IF NOT EXISTS idx_research_char ON research_docs(character_id, agent_id);
    `);
  }

  // ===== Settings =====

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }

  // ===== Encrypted Key =====

  setEncryptedString(key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      this.setSetting(key, value);
      return;
    }
    const buf = safeStorage.encryptString(value);
    this.setSetting(key, buf.toString("base64"));
  }

  getEncryptedString(key: string): string | null {
    const raw = this.getSetting(key);
    if (raw == null) return null;
    if (!safeStorage.isEncryptionAvailable()) return raw;
    try {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    } catch {
      return null;
    }
  }

  // ===== Characters =====

  upsertCharacter(input: {
    id: string;
    bundle: CharacterBundle;
    isSkeleton: boolean;
    now: number;
  }): void {
    const { id, bundle, isSkeleton, now } = input;
    this.db
      .prepare(
        `INSERT INTO characters (id, name, source_name, source_type, track, is_skeleton, bundle_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           source_name = excluded.source_name,
           source_type = excluded.source_type,
           track = excluded.track,
           is_skeleton = excluded.is_skeleton,
           bundle_json = excluded.bundle_json,
           updated_at = excluded.updated_at`
      )
      .run(
        id,
        bundle.card.meta.name,
        bundle.card.meta.sourceName ?? null,
        bundle.card.meta.sourceType,
        bundle.card.meta.track,
        isSkeleton ? 1 : 0,
        JSON.stringify(bundle),
        bundle.card.createdAt || now,
        now
      );
  }

  listCharacters(): Array<{
    id: string;
    name: string;
    sourceName?: string;
    track: "utility" | "companion";
    isSkeleton: boolean;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, name, source_name, track, is_skeleton FROM characters ORDER BY updated_at DESC`
      )
      .all() as Array<{
      id: string;
      name: string;
      source_name: string | null;
      track: "utility" | "companion";
      is_skeleton: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sourceName: r.source_name ?? undefined,
      track: r.track,
      isSkeleton: r.is_skeleton === 1
    }));
  }

  getCharacter(id: string): CharacterBundle | null {
    const row = this.db.prepare("SELECT bundle_json FROM characters WHERE id = ?").get(id) as
      | { bundle_json: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.bundle_json) as CharacterBundle;
    } catch {
      return null;
    }
  }

  deleteCharacter(id: string): void {
    const tx = this.db.transaction((cid: string) => {
      this.db.prepare("DELETE FROM characters WHERE id = ?").run(cid);
      this.db.prepare("DELETE FROM per_character_notes WHERE character_id = ?").run(cid);
      this.db.prepare("DELETE FROM chat_turns WHERE character_id = ?").run(cid);
    });
    tx(id);
  }

  // ===== Profile =====

  getProfile(): {
    preferredName?: string;
    currentGoals: string[];
    ongoingConcerns: string[];
    tabooTopics: string[];
  } {
    const row = this.db.prepare("SELECT json FROM user_profile WHERE id = 1").get() as
      | { json: string }
      | undefined;
    if (!row) {
      return { currentGoals: [], ongoingConcerns: [], tabooTopics: [] };
    }
    try {
      return JSON.parse(row.json);
    } catch {
      return { currentGoals: [], ongoingConcerns: [], tabooTopics: [] };
    }
  }

  setProfile(profile: {
    preferredName?: string;
    currentGoals: string[];
    ongoingConcerns: string[];
    tabooTopics: string[];
  }): void {
    this.db
      .prepare(
        `INSERT INTO user_profile (id, json) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json`
      )
      .run(JSON.stringify(profile));
  }

  clearProfile(): void {
    this.db.prepare("DELETE FROM user_profile WHERE id = 1").run();
  }

  getPerCharacterNotes(characterId: string): string[] {
    const row = this.db
      .prepare("SELECT json FROM per_character_notes WHERE character_id = ?")
      .get(characterId) as { json: string } | undefined;
    if (!row) return [];
    try {
      const parsed = JSON.parse(row.json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  setPerCharacterNotes(characterId: string, notes: string[]): void {
    this.db
      .prepare(
        `INSERT INTO per_character_notes (character_id, json) VALUES (?, ?)
         ON CONFLICT(character_id) DO UPDATE SET json = excluded.json`
      )
      .run(characterId, JSON.stringify(notes));
  }

  clearPerCharacterNotes(characterId: string): void {
    this.db.prepare("DELETE FROM per_character_notes WHERE character_id = ?").run(characterId);
  }

  // ===== Chat =====

  appendTurn(turn: {
    id: string;
    characterId: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO chat_turns (id, character_id, session_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(turn.id, turn.characterId, turn.sessionId, turn.role, turn.content, turn.createdAt);
  }

  getRecentTurns(characterId: string, sessionId: string, limit: number): Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: number;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, role, content, created_at FROM chat_turns
         WHERE character_id = ? AND session_id = ?
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(characterId, sessionId, limit) as Array<{
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
      created_at: number;
    }>;
    return rows
      .reverse()
      .map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.created_at }));
  }

  clearAll(): void {
    this.db.exec(`DELETE FROM characters;
                  DELETE FROM user_profile;
                  DELETE FROM per_character_notes;
                  DELETE FROM chat_turns;
                  DELETE FROM settings;
                  DELETE FROM distillation_jobs;
                  DELETE FROM research_docs;`);
  }

  // ===== Distillation Jobs =====

  upsertJob(job: DistillationJob): void {
    this.db
      .prepare(
        `INSERT INTO distillation_jobs
         (id, character_id, character_name, status, progress, message, warnings_json, config_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           character_id = excluded.character_id,
           status = excluded.status,
           progress = excluded.progress,
           message = excluded.message,
           warnings_json = excluded.warnings_json,
           updated_at = excluded.updated_at`
      )
      .run(
        job.id,
        job.characterId ?? null,
        job.config.characterName,
        job.status,
        job.progress,
        job.message,
        JSON.stringify(job.warnings),
        JSON.stringify(job.config),
        job.createdAt,
        job.updatedAt
      );
  }

  updateJobStatus(
    id: string,
    status: DistillationJobStatus,
    progress: number,
    message: string
  ): void {
    this.db
      .prepare(
        `UPDATE distillation_jobs
         SET status = ?, progress = ?, message = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(status, progress, message, Date.now(), id);
  }

  appendJobWarning(id: string, warning: string): void {
    const row = this.db
      .prepare("SELECT warnings_json FROM distillation_jobs WHERE id = ?")
      .get(id) as { warnings_json: string } | undefined;
    let arr: string[] = [];
    if (row) {
      try {
        arr = JSON.parse(row.warnings_json) as string[];
      } catch {
        arr = [];
      }
    }
    arr.push(warning);
    this.db
      .prepare(
        "UPDATE distillation_jobs SET warnings_json = ?, updated_at = ? WHERE id = ?"
      )
      .run(JSON.stringify(arr), Date.now(), id);
  }

  getJob(id: string): DistillationJob | null {
    const row = this.db
      .prepare(
        "SELECT id, character_id, character_name, status, progress, message, warnings_json, config_json, created_at, updated_at FROM distillation_jobs WHERE id = ?"
      )
      .get(id) as
      | {
          id: string;
          character_id: string | null;
          character_name: string;
          status: DistillationJobStatus;
          progress: number;
          message: string;
          warnings_json: string;
          config_json: string;
          created_at: number;
          updated_at: number;
        }
      | undefined;
    if (!row) return null;
    try {
      return {
        id: row.id,
        characterId: row.character_id ?? undefined,
        config: JSON.parse(row.config_json),
        status: row.status,
        progress: row.progress,
        message: row.message,
        warnings: JSON.parse(row.warnings_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch {
      return null;
    }
  }

  // ===== Research Docs =====

  /**
   * 写入一份调研文档（覆盖式：同 jobId+agentId 直接 replace），同时镜像到文件系统。
   */
  upsertResearchDoc(input: {
    jobId: string;
    characterId?: string;
    doc: ResearchDoc;
    createdAt: number;
  }): void {
    const { jobId, characterId, doc, createdAt } = input;
    this.db
      .prepare(
        `INSERT INTO research_docs
         (job_id, character_id, agent_id, agent_name, markdown, sources_json,
          confidence, web_search_used, duration_ms, status, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(job_id, agent_id) DO UPDATE SET
           character_id = excluded.character_id,
           agent_name = excluded.agent_name,
           markdown = excluded.markdown,
           sources_json = excluded.sources_json,
           confidence = excluded.confidence,
           web_search_used = excluded.web_search_used,
           duration_ms = excluded.duration_ms,
           status = excluded.status,
           error_message = excluded.error_message`
      )
      .run(
        jobId,
        characterId ?? null,
        doc.agentId,
        doc.agentName,
        doc.markdown,
        JSON.stringify(doc.sources),
        doc.confidence,
        doc.webSearchUsed ? 1 : 0,
        doc.durationMs,
        doc.status,
        doc.errorMessage ?? null,
        createdAt
      );

    // 文件系统镜像，方便用户直接看 / 备份
    if (characterId) {
      try {
        const dir = this.getResearchDir(characterId);
        const slug = RESEARCH_AGENT_LABELS[doc.agentId].slug;
        const fname = String(doc.agentId).padStart(2, "0") + "-" + slug + ".md";
        writeFileSync(join(dir, fname), doc.markdown, "utf-8");
      } catch {
        // 文件系统写入失败不影响主流程
      }
    }
  }

  getResearchDocs(jobId: string): ResearchDoc[] {
    const rows = this.db
      .prepare(
        `SELECT agent_id, agent_name, markdown, sources_json, confidence,
                web_search_used, duration_ms, status, error_message
         FROM research_docs WHERE job_id = ? ORDER BY agent_id`
      )
      .all(jobId) as Array<{
      agent_id: number;
      agent_name: string;
      markdown: string;
      sources_json: string;
      confidence: "high" | "medium" | "low";
      web_search_used: number;
      duration_ms: number;
      status: "ok" | "timeout" | "error" | "skipped";
      error_message: string | null;
    }>;
    return rows.map((r) => {
      let sources: string[] = [];
      try {
        sources = JSON.parse(r.sources_json);
      } catch {
        // ignore
      }
      return {
        agentId: r.agent_id as ResearchDoc["agentId"],
        agentName: r.agent_name,
        markdown: r.markdown,
        sources,
        confidence: r.confidence,
        webSearchUsed: r.web_search_used === 1,
        durationMs: r.duration_ms,
        status: r.status,
        errorMessage: r.error_message ?? undefined
      };
    });
  }

  /**
   * 字符已落盘后，把 job 对应的 docs 关联回 characterId，便于角色仓库列表查询。
   */
  bindResearchDocsToCharacter(jobId: string, characterId: string): void {
    this.db
      .prepare("UPDATE research_docs SET character_id = ? WHERE job_id = ?")
      .run(characterId, jobId);
    this.db
      .prepare("UPDATE distillation_jobs SET character_id = ? WHERE id = ?")
      .run(characterId, jobId);
  }

  getResearchDocsByCharacter(characterId: string): ResearchDoc[] {
    const rows = this.db
      .prepare(
        `SELECT agent_id, agent_name, markdown, sources_json, confidence,
                web_search_used, duration_ms, status, error_message
         FROM research_docs WHERE character_id = ? ORDER BY agent_id`
      )
      .all(characterId) as Array<{
      agent_id: number;
      agent_name: string;
      markdown: string;
      sources_json: string;
      confidence: "high" | "medium" | "low";
      web_search_used: number;
      duration_ms: number;
      status: "ok" | "timeout" | "error" | "skipped";
      error_message: string | null;
    }>;
    return rows.map((r) => {
      let sources: string[] = [];
      try {
        sources = JSON.parse(r.sources_json);
      } catch {
        // ignore
      }
      return {
        agentId: r.agent_id as ResearchDoc["agentId"],
        agentName: r.agent_name,
        markdown: r.markdown,
        sources,
        confidence: r.confidence,
        webSearchUsed: r.web_search_used === 1,
        durationMs: r.duration_ms,
        status: r.status,
        errorMessage: r.error_message ?? undefined
      };
    });
  }
}
