import type { RecommendedBundle, BundleFeature } from "./presets.js";

export type ReadinessKey = BundleFeature;

export type ReadinessState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; latencyMs?: number; detail?: string }
  | { status: "fail"; reason: string }
  | { status: "unavailable"; reason: string };

export type ReadinessMap = Record<ReadinessKey, ReadinessState>;

export const IDLE_READINESS: ReadinessMap = {
  chat: { status: "idle" },
  vision: { status: "idle" },
  webSearch: { status: "idle" },
  imageGen: { status: "idle" }
};

interface NuwaBundleApis {
  llm: {
    setProvider(input: {
      kind: string;
      baseUrl: string;
      model: string;
      visionModel: string;
      apiKey: string;
    }): Promise<{ ok: boolean; error?: string }>;
    testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
  };
  imageGen: {
    setConfig(input: unknown): Promise<{ ok: boolean; error?: string }>;
    test(tier?: string): Promise<{
      ok: boolean;
      latencyMs?: number;
      model?: string;
      error?: string;
    }>;
  };
  characters: {
    probeVision(): Promise<{ ok: boolean; latencyMs?: number; reason?: string }>;
    probeWebSearch(): Promise<{
      ok: boolean;
      realWebSearch: boolean;
      citations: number;
      latencyMs?: number;
      reason?: string;
    }>;
  };
}

export interface ApplyBundleResult {
  saveOk: boolean;
  saveError?: string;
  readiness: ReadinessMap;
  allRequiredPassed: boolean;
}

export async function applyRecommendedBundle(
  nuwa: NuwaBundleApis,
  bundle: RecommendedBundle,
  apiKey: string,
  onProgress: (key: ReadinessKey, state: ReadinessState) => void,
  unavailableReason: (feature: ReadinessKey) => string
): Promise<ApplyBundleResult> {
  const readiness: ReadinessMap = { ...IDLE_READINESS };

  const llmSave = await nuwa.llm.setProvider({
    kind: bundle.llm.kind,
    baseUrl: bundle.llm.baseUrl,
    model: bundle.llm.model,
    visionModel: bundle.llm.visionModel,
    apiKey
  });
  if (!llmSave.ok) {
    return {
      saveOk: false,
      saveError: llmSave.error,
      readiness,
      allRequiredPassed: false
    };
  }

  const imgSave = await nuwa.imageGen.setConfig(bundle.image);
  if (!imgSave.ok) {
    return {
      saveOk: false,
      saveError: imgSave.error,
      readiness,
      allRequiredPassed: false
    };
  }

  // --- chat ---
  onProgress("chat", { status: "running" });
  readiness.chat = { status: "running" };
  const chatTest = await nuwa.llm.testConnection();
  if (chatTest.ok) {
    readiness.chat = { status: "ok", latencyMs: chatTest.latencyMs };
  } else {
    readiness.chat = { status: "fail", reason: chatTest.error ?? "connection failed" };
  }
  onProgress("chat", readiness.chat);

  // --- vision ---
  if (!bundle.capabilities.vision) {
    readiness.vision = { status: "unavailable", reason: unavailableReason("vision") };
    onProgress("vision", readiness.vision);
  } else {
    onProgress("vision", { status: "running" });
    readiness.vision = { status: "running" };
    try {
      const v = await nuwa.characters.probeVision();
      readiness.vision = v.ok
        ? { status: "ok", latencyMs: v.latencyMs }
        : { status: "fail", reason: v.reason ?? "vision probe failed" };
    } catch (e) {
      readiness.vision = {
        status: "fail",
        reason: e instanceof Error ? e.message : String(e)
      };
    }
    onProgress("vision", readiness.vision);
  }

  // --- web search ---
  if (!bundle.capabilities.webSearch) {
    readiness.webSearch = { status: "unavailable", reason: unavailableReason("webSearch") };
    onProgress("webSearch", readiness.webSearch);
  } else {
    onProgress("webSearch", { status: "running" });
    readiness.webSearch = { status: "running" };
    try {
      const w = await nuwa.characters.probeWebSearch();
      const ok = w.ok && w.realWebSearch;
      readiness.webSearch = ok
        ? {
            status: "ok",
            latencyMs: w.latencyMs,
            detail: String(w.citations)
          }
        : {
            status: "fail",
            reason: w.reason ?? (w.ok ? "no citations" : "web probe failed")
          };
    } catch (e) {
      readiness.webSearch = {
        status: "fail",
        reason: e instanceof Error ? e.message : String(e)
      };
    }
    onProgress("webSearch", readiness.webSearch);
  }

  // --- image gen ---
  if (!bundle.capabilities.imageGen) {
    readiness.imageGen = { status: "unavailable", reason: unavailableReason("imageGen") };
    onProgress("imageGen", readiness.imageGen);
  } else {
    onProgress("imageGen", { status: "running" });
    readiness.imageGen = { status: "running" };
    try {
      const img = await nuwa.imageGen.test("standard");
      readiness.imageGen = img.ok
        ? { status: "ok", latencyMs: img.latencyMs, detail: img.model }
        : { status: "fail", reason: img.error ?? "image test failed" };
    } catch (e) {
      readiness.imageGen = {
        status: "fail",
        reason: e instanceof Error ? e.message : String(e)
      };
    }
    onProgress("imageGen", readiness.imageGen);
  }

  const required = (Object.keys(bundle.capabilities) as ReadinessKey[]).filter(
    (k) => bundle.capabilities[k]
  );
  const allRequiredPassed = required.every((k) => readiness[k].status === "ok");

  return { saveOk: true, readiness, allRequiredPassed };
}
