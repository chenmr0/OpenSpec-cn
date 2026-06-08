import type { ApplyCommand, CompressionState, WithParts } from "./types.js";
export { APPLY_MARKER, APPLY_QUICK_MARKER, PLAN_MARKER } from "../workflow-session.js";
import { APPLY_MARKER, APPLY_QUICK_MARKER, PLAN_MARKER } from "../workflow-session.js";

const COMMAND_MARKERS: Array<{ command: ApplyCommand; marker: string }> = [
  { command: "apply", marker: APPLY_MARKER },
  { command: "apply-quick", marker: APPLY_QUICK_MARKER },
];

function setApplySessionCommand(
  state: CompressionState,
  command: ApplyCommand,
): void {
  state.isApplySession = true;
  state.applyCommand = command;
  state.keepRecentTasks =
    state.keepRecentTasksByCommand?.[command]
    ?? (command === "apply-quick" ? 3 : state.keepRecentTasks);
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
