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
import type { Todo } from "./types.js";
import type { SessionStateStore } from "./session-state.js";
import { startCountdown } from "./countdown.js";

/**
 * Check if the last assistant message in a list has an abort error.
 * This is a fallback detection mechanism: even if session.error events are
 * missed or wasCancelled is reset by trailing events, we can still detect
 * the abort by inspecting the actual message content via the API.
 */
function isLastAssistantMessageAborted(
  messages: Array<Record<string, unknown>>,
): boolean {
  if (!messages || messages.length === 0) return false;

  const assistantMessages = messages.filter(
    (msg) => {
      const info = msg.info as Record<string, unknown> | undefined;
      return info?.role === "assistant";
    },
  );
  if (assistantMessages.length === 0) return false;

  const lastAssistant = assistantMessages[assistantMessages.length - 1];
  const info = lastAssistant.info as Record<string, unknown> | undefined;
  const error = info?.error as { name?: string } | undefined;
  if (!error?.name) return false;

  return error.name === "MessageAbortedError" || error.name === "AbortError";
}

function normalizeSDKResponse<T>(response: unknown, fallback: T): T {
  if (response && typeof response === "object" && "data" in response) {
    const data = (response as { data?: unknown }).data;
    return Array.isArray(data) ? (data as T) : fallback;
  }
  if (Array.isArray(response)) return response as T;
  return fallback;
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

  // API fallback: check if the last assistant message was aborted.
  // This catches aborts that were missed by session.error events or
  // had their wasCancelled state reset by trailing cleanup events.
  try {
    const messagesResp = await ctx.client.session.messages({
      path: { id: sessionID },
    });
    const messages = normalizeSDKResponse<Record<string, unknown>[]>(
      messagesResp,
      [],
    );
    if (isLastAssistantMessageAborted(messages)) {
      return;
    }
  } catch {
    // If messages fetch fails, continue with other checks
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
