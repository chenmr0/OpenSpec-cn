import type { ApplyCommand, CompressionState, WithParts } from "./types.js";

export const APPLY_MARKER = "codespec-apply-change";
export const APPLY_QUICK_MARKER = "codespec-apply-quick";

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
