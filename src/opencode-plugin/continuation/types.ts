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
  lastIncompleteCount?: number;
  lastInjectedAt?: number;
  awaitingPostInjectionProgressCheck?: boolean;
  inFlight?: boolean;
  stagnationCount: number;
  consecutiveFailures: number;
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
