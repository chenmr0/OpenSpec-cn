/**
 * Type definitions for the codespec continuation enforcer plugin.
 */

export interface Todo {
  content: string;
  status: string;
  priority: string;
  id?: string;
}

export interface SessionState {
  countdownTimer?: ReturnType<typeof setTimeout>;
  countdownInterval?: ReturnType<typeof setInterval>;
  isRecovering?: boolean;
  wasCancelled?: boolean;
  tokenLimitDetected?: boolean;
  countdownStartedAt?: number;
  abortDetectedAt?: number;
  /**
   * 用户已中止（opencode 双击 ESC = 一次 abort）。设置后续接器停止注入，
   * 直到用户在 abort 之后重新输入一条非注入的真实 user 消息才解除。
   * 尾随清理事件（message.updated / part.delta / tool.execute）无权清除。
   */
  stoppedByUser?: boolean;
  /** 设置 stoppedByUser 的时间戳（同进程 Date.now()），用于判定"abort 之后"的重入。 */
  stoppedAt?: number;
  lastIncompleteCount?: number;
  lastInjectedAt?: number;
  awaitingPostInjectionProgressCheck?: boolean;
  inFlight?: boolean;
  stagnationCount: number;
  consecutiveFailures: number;
  /** Whether this session is a /codespec/apply session (detected via APPLY_MARKER) */
  isApplySession?: boolean;
}

export interface ContinuationProgressUpdate {
  previousIncompleteCount?: number;
  previousStagnationCount: number;
  stagnationCount: number;
  hasProgressed: boolean;
  progressSource: "none" | "todo" | "activity";
}

export interface ContinuationProgressOptions {
  allowActivityProgress?: boolean;
}
