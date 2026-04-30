/**
 * Non-idle event handler for the codespec continuation enforcer.
 * Handles message updates, tool executions, and session lifecycle events.
 * Simplified from oh-my-openagent: removed compaction events.
 */

import { COUNTDOWN_GRACE_PERIOD_MS, HOOK_NAME } from "./constants.js";
import type { SessionStateStore } from "./session-state.js";

export function handleNonIdleEvent(args: {
  eventType: string;
  properties: Record<string, unknown> | undefined;
  sessionStateStore: SessionStateStore;
}): void {
  const { eventType, properties, sessionStateStore } = args;

  if (eventType === "session.error") {
    const sessionID = properties?.sessionID as string | undefined;
    if (!sessionID) return;

    const error = properties?.error as { name?: string; message?: string } | undefined;
    if (error?.name === "MessageAbortedError" || error?.name === "AbortError") {
      const state = sessionStateStore.getState(sessionID);
      state.wasCancelled = true;
      state.abortDetectedAt = Date.now();
      state.lastIncompleteCount = undefined;
      state.lastInjectedAt = undefined;
      state.awaitingPostInjectionProgressCheck = false;
      state.stagnationCount = 0;
      state.consecutiveFailures = 0;
    } else if (error?.message?.includes("context") || error?.message?.includes("token")) {
      const state = sessionStateStore.getState(sessionID);
      state.tokenLimitDetected = true;
    }

    sessionStateStore.cancelCountdown(sessionID);
    return;
  }

  if (eventType === "message.updated") {
    const info = properties?.info as Record<string, unknown> | undefined;
    const sessionID = info?.sessionID as string | undefined;
    const role = info?.role as string | undefined;
    if (!sessionID) return;

    if (role === "user") {
      const state = sessionStateStore.getExistingState(sessionID);
      if (state?.countdownStartedAt) {
        const elapsed = Date.now() - state.countdownStartedAt;
        if (elapsed < COUNTDOWN_GRACE_PERIOD_MS) {
          return;
        }
      }
      if (state) {
        state.abortDetectedAt = undefined;
        state.wasCancelled = false;
        state.tokenLimitDetected = false;
        sessionStateStore.recordActivity(sessionID);
      }
      sessionStateStore.cancelCountdown(sessionID);
      return;
    }

    if (role === "assistant") {
      const state = sessionStateStore.getExistingState(sessionID);
      if (state) {
        state.abortDetectedAt = undefined;
        state.wasCancelled = false;
        sessionStateStore.recordActivity(sessionID);
      }
      sessionStateStore.cancelCountdown(sessionID);
      return;
    }

    return;
  }

  if (eventType === "message.part.updated") {
    const sessionID = typeof properties?.sessionID === "string"
      ? properties.sessionID
      : undefined;
    const legacyInfo = properties?.info as Record<string, unknown> | undefined;
    const legacySessionID = legacyInfo?.sessionID as string | undefined;
    const targetSessionID = sessionID ?? legacySessionID;

    if (targetSessionID) {
      const state = sessionStateStore.getExistingState(targetSessionID);
      if (state) {
        state.abortDetectedAt = undefined;
        sessionStateStore.recordActivity(targetSessionID);
      }
      sessionStateStore.cancelCountdown(targetSessionID);
    }
    return;
  }

  if (eventType === "message.part.delta") {
    const sessionID = properties?.sessionID as string | undefined;
    if (sessionID) {
      const state = sessionStateStore.getExistingState(sessionID);
      if (state) {
        state.abortDetectedAt = undefined;
        state.wasCancelled = false;
        sessionStateStore.recordActivity(sessionID);
      }
      sessionStateStore.cancelCountdown(sessionID);
    }
    return;
  }

  if (eventType === "tool.execute.before" || eventType === "tool.execute.after") {
    const sessionID = properties?.sessionID as string | undefined;
    if (sessionID) {
      const state = sessionStateStore.getExistingState(sessionID);
      if (state) {
        state.abortDetectedAt = undefined;
        state.wasCancelled = false;
        sessionStateStore.recordActivity(sessionID);
      }
      sessionStateStore.cancelCountdown(sessionID);
    }
    return;
  }

  if (eventType === "session.deleted") {
    const sessionInfo = properties?.info as { id?: string } | undefined;
    if (sessionInfo?.id) {
      sessionStateStore.cleanup(sessionInfo.id);
    }
    return;
  }
}
