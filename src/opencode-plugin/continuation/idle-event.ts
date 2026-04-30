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
