/**
 * Session idle event handler for the codespec continuation enforcer.
 * Simplified from oh-my-openagent: removed backgroundManager, compaction guard,
 * agent routing (skipAgents), pending question detection, and abort detection via messages.
 */

import type { PluginInput } from "@opencode-ai/plugin";

import {
  ABORT_WINDOW_MS,
  CONTINUATION_COOLDOWN_MS,
  FAILURE_RESET_WINDOW_MS,
  HOOK_NAME,
  MAX_CONSECUTIVE_FAILURES,
} from "./constants.js";
import { shouldStopForStagnation } from "./stagnation-detection.js";
import { getIncompleteCount } from "./todo.js";
import type { SessionState, Todo } from "./types.js";
import type { SessionStateStore } from "./session-state.js";
import { startCountdown } from "./countdown.js";
import {
  hasGenuineReengagement,
  isLastAssistantMessageAborted,
  normalizeSDKResponse,
} from "./messages-util.js";
import { APPLY_MARKER } from "../context-compression/session-detection.js";

/**
 * Check if messages contain the APPLY_MARKER, indicating a /codespec/apply session.
 * Caches result in state.isApplySession.
 */
function detectApplySessionFromMessages(
  state: SessionState,
  messages: Array<Record<string, unknown>>,
): boolean {
  if (state.isApplySession) return true;

  for (const msg of messages) {
    const info = msg.info as Record<string, unknown> | undefined;
    if (info?.role !== "user") continue;
    const parts = (msg as { parts?: Array<{ type?: string; text?: string }> }).parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.type === "text" && part.text?.includes(APPLY_MARKER)) {
        state.isApplySession = true;
        return true;
      }
    }
  }
  return false;
}

export async function handleSessionIdle(args: {
  ctx: PluginInput;
  sessionID: string;
  sessionStateStore: SessionStateStore;
}): Promise<void> {
  const {
    ctx,
    sessionID,
    sessionStateStore,
  } = args;

  const state = sessionStateStore.getState(sessionID);

  if (state.isRecovering) {
    return;
  }

  if (state.wasCancelled) {
    return;
  }

  if (state.tokenLimitDetected) {
    return;
  }

  if (state.abortDetectedAt) {
    const timeSinceAbort = Date.now() - state.abortDetectedAt;
    if (timeSinceAbort < ABORT_WINDOW_MS) {
      state.abortDetectedAt = undefined;
      return;
    }
    state.abortDetectedAt = undefined;
  }

  // 取消息：用于 apply 会话判定、abort 兜底探测、用户重入判定。
  // 保守策略（④）：取消息失败时无法验证 abort/重入，一律不续接。
  let messages: Record<string, unknown>[] = [];
  try {
    const messagesResp = await ctx.client.session.messages({
      path: { id: sessionID },
    });
    messages = normalizeSDKResponse<Record<string, unknown>[]>(messagesResp, []);
  } catch {
    return;
  }

  // 仅在 /codespec/apply 会话中生效
  if (!detectApplySessionFromMessages(state, messages)) {
    return;
  }

  // abort 是最近事件 → 保持叫停（同时补设 stoppedByUser，覆盖 session.error 被漏掉的情况）
  if (isLastAssistantMessageAborted(messages)) {
    state.stoppedByUser = true;
    state.stoppedAt = Date.now();
    return;
  }

  // 已叫停：只有"abort 之后真实重入"才解除，否则保持停止
  if (state.stoppedByUser) {
    if (hasGenuineReengagement(messages, state.stoppedAt)) {
      state.stoppedByUser = false;
    } else {
      return;
    }
  }

  // Fetch todos
  let todos: Todo[] = [];
  try {
    const response = await ctx.client.session.todo({ path: { id: sessionID } });
    const data = response as { data?: Todo[] } | Todo[];
    todos = Array.isArray(data) ? data : (data as { data?: Todo[] }).data ?? [];
  } catch (error) {
    return;
  }

  if (!todos || todos.length === 0) {
    sessionStateStore.resetContinuationProgress(sessionID);
    return;
  }

  const incompleteCount = getIncompleteCount(todos);
  if (incompleteCount === 0) {
    sessionStateStore.resetContinuationProgress(sessionID);
    return;
  }

  if (state.inFlight) {
    return;
  }

  // Failure recovery window
  if (
    state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
    && state.lastInjectedAt
    && Date.now() - state.lastInjectedAt >= FAILURE_RESET_WINDOW_MS
  ) {
    state.consecutiveFailures = 0;
  }

  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return;
  }

  // Exponential backoff cooldown
  const effectiveCooldown =
    CONTINUATION_COOLDOWN_MS * Math.pow(2, Math.min(state.consecutiveFailures, 5));
  if (state.lastInjectedAt && Date.now() - state.lastInjectedAt < effectiveCooldown) {
    return;
  }

  // Stagnation check
  const progressUpdate = sessionStateStore.trackContinuationProgress(
    sessionID,
    incompleteCount,
    todos,
  );
  if (shouldStopForStagnation({ sessionID, incompleteCount, progressUpdate })) {
    return;
  }

  startCountdown({
    ctx,
    sessionID,
    incompleteCount,
    sessionStateStore,
  });
}
