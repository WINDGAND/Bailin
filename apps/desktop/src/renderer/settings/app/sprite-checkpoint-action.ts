import type { HatchPetRowState } from "@bailin/character-protocol";

export type SpriteCheckpointAction = "retry" | "continue";

interface ApprovalInput {
  jobId: string;
  phase: "sprite";
  spriteAction: SpriteCheckpointAction;
  spriteRetryRows?: HatchPetRowState[];
}

type Approve = (input: ApprovalInput) => Promise<{ ok: boolean }>;

export async function submitSpriteCheckpointAction(
  action: SpriteCheckpointAction,
  failedRows: HatchPetRowState[],
  jobId: string,
  approve: Approve
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await approve({
      jobId,
      phase: "sprite",
      spriteAction: action,
      spriteRetryRows: action === "retry" ? failedRows : undefined
    });
    return response.ok
      ? { ok: true }
      : { ok: false, error: "未能继续创建：任务已结束或确认请求未被主进程接收。" };
  } catch (error) {
    return {
      ok: false,
      error: `未能继续创建：${error instanceof Error ? error.message : String(error)}`
    };
  }
}
