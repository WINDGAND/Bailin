/**
 * SegmentBuffer：把流式 LLM 输出 / whisper 长文本切成"一口气说完的小段"，
 * 按节奏一段一段呈现到桌宠气泡上，让交互回到"有个人在你耳边说话"的体感。
 *
 * 设计要点：
 * 1. **边流边刈句**：不等响应结束。流式 chunk 持续追加，每次 push 都尝试在
 *    句末标点（。？！；…）/ 换行 / 软上限处切出一个 segment。
 * 2. **segment 长度上限 30**：远超就硬切（找最近的逗号/空格再切）。
 * 3. **节奏**：一段说完后停 1.2-2.0s（按字数线性），然后切到下一段。
 *    停顿期间用户看完上一段，刚好有节奏感。
 * 4. **追上提示**：所有段播完后，buffer 还有未读 → emit `tail` 事件让 UI
 *    显示"还有 N 段，点 ↗ 看全文"。
 * 5. **可中断**：`reset()` 清空所有状态；`flushAll()` 立刻把 buffer 内剩余
 *    内容合并为最后一段（chat.streaming 收尾时用）。
 *
 * 状态：纯逻辑层，不依赖 React。BubbleApp 用一个 useRef 持有实例，
 * 用 useEffect 串入 chat.pending / chat.turns。
 */

export interface Segment {
  /** 段唯一 id，用作 React key。 */
  id: string;
  /** 段文本（已 trim、已截到 ≤30 字）。 */
  text: string;
  /** whisper 来源会带上 reason；对话流是 "chat"。 */
  source: "whisper" | "chat";
}

export interface SegmentBufferOptions {
  /** 单段最大字数；超出强制切。默认 30。 */
  maxChars?: number;
  /** 段播放完到下一段开始的最短停顿（ms）。默认 800。 */
  minDwellMs?: number;
  /** 段播放完到下一段开始的最长停顿（ms）。默认 1800。 */
  maxDwellMs?: number;
  /** UI 应当渲染的当前段变化时回调（包括首次/切换/追加）。 */
  onCurrent: (current: Segment | null) => void;
  /** 队列里还有多少未播段落数变化时回调（含正在播的下一段）。 */
  onPending: (count: number) => void;
}

const SENT_BREAK = /[。？！；!?;…]/;
const SOFT_BREAK = /[，、,：:—\n\t]/;

export class SegmentBuffer {
  private readonly maxChars: number;
  private readonly minDwellMs: number;
  private readonly maxDwellMs: number;

  /** 还没切出来的"未来 segment 候选"原始文本。 */
  private rawTail = "";
  /** 已切好但还没轮到的 segment 队列。 */
  private queue: Segment[] = [];
  /** 当前正在显示的段。 */
  private current: Segment | null = null;
  /** dwell 计时句柄。 */
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** 自增 id，避免 React 复用 DOM。 */
  private seq = 0;
  /** 当前批次的 source（一次 setStream/pushFinal 完整对应一个 source）。 */
  private currentSource: Segment["source"] = "chat";

  constructor(private readonly opts: SegmentBufferOptions) {
    this.maxChars = opts.maxChars ?? 30;
    this.minDwellMs = opts.minDwellMs ?? 800;
    this.maxDwellMs = opts.maxDwellMs ?? 1800;
  }

  /**
   * 流式追加文本（idempotent friendly）。
   * 调用方维护"全文"作为一个累积 string，每次有新增就调本方法把全文传进来；
   * 内部计算 delta，只追加到 rawTail。
   * 这样 BubbleApp 不用维护 cursor，就交给 chat.pending 是不是真的累积。
   */
  setStreamingText(fullText: string, source: Segment["source"] = "chat"): void {
    if (this.currentSource !== source) {
      // source 切换：清空当前批次，重新开始（whisper 打断 chat、或反过来）。
      this.reset();
      this.currentSource = source;
    }
    // 计算"已消化的部分"= 当前 segment + 队列里所有 segment + rawTail 之前消化过的。
    // 简单算：用 fullText 去掉已经切出去的总长度。
    const consumed = this.consumedLength();
    if (fullText.length < consumed) {
      // 流式被外部 reset 或重置（很少见）：清空重来。
      this.reset();
      this.rawTail = fullText;
    } else {
      this.rawTail = fullText.slice(consumed);
    }
    this.tryEmit();
  }

  /**
   * 一次性给一段最终文本（如 whisper 推送、chat.turns 最后一条 done）。
   * 行为：把它视作"流式一次性收尾"——切段后正常入队播放。
   */
  pushFinal(text: string, source: Segment["source"] = "chat"): void {
    if (this.currentSource !== source) {
      this.reset();
      this.currentSource = source;
    }
    this.rawTail += text;
    this.tryEmit({ flushAll: true });
  }

  /**
   * 把当前 buffer 内所有未切的字直接收尾切成最后一段，一并入队。
   * 流式 done 时调一次，避免最后一段因为没遇到句末标点而漂在 rawTail 里。
   */
  finalize(): void {
    this.tryEmit({ flushAll: true });
  }

  /** 清空所有状态；UI 会立刻收到 onCurrent(null)。 */
  reset(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
    this.rawTail = "";
    if (this.current !== null) {
      this.current = null;
      this.opts.onCurrent(null);
    }
    this.opts.onPending(0);
  }

  /** UI 想强制跳到下一段（点击气泡正文等）。如果队列已空则保持当前段不动。 */
  advance(): void {
    if (this.queue.length === 0) return;
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.shiftToNext();
  }

  // ---------- 内部 ----------

  /** 已经切出去 / 正在显示的总字符数（用于从全量 fullText 算 delta）。 */
  private consumedLength(): number {
    let n = 0;
    if (this.current) n += this.current.text.length;
    for (const s of this.queue) n += s.text.length;
    return n;
  }

  private tryEmit(options: { flushAll?: boolean } = {}): void {
    while (true) {
      const piece = this.takeNextPiece(options.flushAll === true);
      if (!piece) break;
      const seg: Segment = {
        id: `${this.currentSource}-${this.seq++}`,
        text: piece.trim(),
        source: this.currentSource
      };
      if (seg.text.length === 0) continue;
      if (this.current === null && this.queue.length === 0 && this.timer === null) {
        this.current = seg;
        this.opts.onCurrent(seg);
        this.scheduleNext();
      } else {
        this.queue.push(seg);
        this.opts.onPending(this.queue.length);
      }
    }
  }

  /**
   * 从 rawTail 切出一段：
   *
   * 1. 在 [0, maxChars] 内找句末标点 → 在它之后切（标点保留在段内）；
   * 2. 没句末标点但已经 ≥ maxChars：在 maxChars 范围内"从右往左"找最近的软标点切；
   *    都没软标点就硬切到 maxChars；
   * 3. 不足 maxChars 且无句末：等更多文本（除非 flushAll）；
   * 4. flushAll=true：rawTail 整体作为最后一段返回。
   *
   * 关键约束：单段 **永远 ≤ maxChars + 1**（句末标点占 1 个）。
   */
  private takeNextPiece(flushAll: boolean): string | null {
    if (this.rawTail.length === 0) return null;

    const scanLen = Math.min(this.rawTail.length, this.maxChars);
    // 句末标点：在 maxChars 范围内
    for (let i = 0; i < scanLen; i++) {
      const ch = this.rawTail[i]!;
      if (SENT_BREAK.test(ch)) {
        const piece = this.rawTail.slice(0, i + 1);
        this.rawTail = this.rawTail.slice(i + 1);
        return piece;
      }
    }

    // 软切：到了 maxChars 还没遇到句末标点
    if (this.rawTail.length >= this.maxChars) {
      const window = this.rawTail.slice(0, this.maxChars);
      let cut = -1;
      for (let i = window.length - 1; i >= Math.floor(this.maxChars / 2); i--) {
        if (SOFT_BREAK.test(window[i]!)) {
          cut = i + 1;
          break;
        }
      }
      if (cut < 0) cut = this.maxChars;
      const piece = this.rawTail.slice(0, cut);
      this.rawTail = this.rawTail.slice(cut);
      return piece;
    }

    if (flushAll) {
      const piece = this.rawTail;
      this.rawTail = "";
      return piece;
    }

    return null;
  }

  private dwellFor(text: string): number {
    // 每字 ~70ms，clamp 到 [minDwell, maxDwell]
    const t = text.length * 70 + 400;
    return Math.max(this.minDwellMs, Math.min(this.maxDwellMs, t));
  }

  private scheduleNext(): void {
    if (this.timer != null) clearTimeout(this.timer);
    if (this.current === null) return;
    if (this.queue.length === 0) {
      // 队列空：不调度切换。等下一次 setStreamingText 再触发 tryEmit。
      this.timer = null;
      return;
    }
    const dwell = this.dwellFor(this.current.text);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.shiftToNext();
    }, dwell);
  }

  private shiftToNext(): void {
    const next = this.queue.shift() ?? null;
    this.current = next;
    this.opts.onCurrent(next);
    this.opts.onPending(this.queue.length);
    if (next !== null) this.scheduleNext();
  }
}
