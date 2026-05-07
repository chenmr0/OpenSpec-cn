import type { CompressionState, WithParts } from "./types.js";

export const APPLY_MARKER = "codespec-apply-change";

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
      if (part.type === "text" && part.text?.includes(APPLY_MARKER)) {
        state.isApplySession = true;
        return true;
      }
    }
  }
  return false;
}
