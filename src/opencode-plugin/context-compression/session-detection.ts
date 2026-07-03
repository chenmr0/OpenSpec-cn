import type { ApplyCommand, CompressionState, WithParts } from "./types.js";
export { APPLY_MARKER, PLAN_MARKER } from "../workflow-session.js";
import { APPLY_MARKER, PLAN_MARKER } from "../workflow-session.js";

/** Marker used to detect when the compression system is running in main-agent mode. */
export const MAIN_AGENT_DEV_MARKER = "main-agent-driven";

const COMMAND_MARKERS: Array<{ command: ApplyCommand; marker: string }> = [
  { command: "apply", marker: APPLY_MARKER },
];

function setApplySessionCommand(
  state: CompressionState,
  command: ApplyCommand,
): void {
  state.isApplySession = true;
  state.applyCommand = command;
  if (state.isMainAgentMode) {
    // main mode: hardcoded 0 — compress after every task
    state.keepRecentTasks = 0;
  } else {
    // subagent mode: use user config, default 1
    state.keepRecentTasks =
      state.keepRecentTasksByCommand?.[command] ?? 1;
  }
}

/**
 * Detect whether the current session is a /codespec/apply session.
 * - Already detected (isApplySession=true): returns true immediately
 * - Not yet detected: scans user message text parts for the APPLY_MARKER
 *   - Found: sets state.isApplySession = true and returns true
 *   - Not found: returns false (no caching, will scan again next call)
 */
/**
 * Detect whether the current session is a /codespec/plan session.
 * - Already detected (isPlanSession=true): returns true immediately
 * - Not yet detected: scans user message text parts for the PLAN_MARKER
 *   - Found: sets state.isPlanSession = true and returns true
 *   - Not found: returns false
 */
export function detectPlanSession(
  state: CompressionState,
  messages: WithParts[],
): boolean {
  if (state.isPlanSession) return true;

  for (const msg of messages) {
    if (msg.info.role !== "user") continue;
    for (const part of msg.parts) {
      if (part.type !== "text" || !part.text) continue;
      if (part.text.includes(PLAN_MARKER)) {
        state.isPlanSession = true;
        return true;
      }
    }
  }
  return false;
}

export function detectApplySession(
  state: CompressionState,
  messages: WithParts[],
): boolean {
  if (state.isApplySession) return true;

  for (const msg of messages) {
    if (msg.info.role !== "user") continue;
    for (const part of msg.parts) {
      if (part.type !== "text" || !part.text) continue;
      // Detect main-agent mode (cached, only scans user text parts)
      if (!state.isMainAgentMode && part.text.includes(MAIN_AGENT_DEV_MARKER)) {
        state.isMainAgentMode = true;
      }
      for (const { command, marker } of COMMAND_MARKERS) {
        if (part.text.includes(marker)) {
          setApplySessionCommand(state, command);
          return true;
        }
      }
    }
  }
  return false;
}
