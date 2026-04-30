/**
 * Countdown timer before injecting continuation prompt.
 * Simplified from oh-my-openagent: removed toast notifications.
 */

import type { PluginInput } from "@opencode-ai/plugin";

import { COUNTDOWN_SECONDS, HOOK_NAME } from "./constants.js";
import type { SessionStateStore } from "./session-state.js";
import { injectContinuation } from "./continuation-injection.js";

export function startCountdown(args: {
  ctx: PluginInput;
  sessionID: string;
  incompleteCount: number;
  sessionStateStore: SessionStateStore;
}): void {
  const {
    ctx,
    sessionID,
    incompleteCount,
    sessionStateStore,
  } = args;

  const state = sessionStateStore.getState(sessionID);
  sessionStateStore.cancelCountdown(sessionID);

  let secondsRemaining = COUNTDOWN_SECONDS;
  state.countdownStartedAt = Date.now();

  state.countdownInterval = setInterval(() => {
    secondsRemaining--;
    // No toast - simplified version just counts down silently
  }, 1000);

  state.countdownTimer = setTimeout(() => {
    sessionStateStore.cancelCountdown(sessionID);
    injectContinuation({
      ctx,
      sessionID,
      sessionStateStore,
    });
  }, COUNTDOWN_SECONDS * 1000);
}
