import type { ApplyCommand, CompressionState, WithParts } from "./types.js";
export { APPLY_MARKER, DESIGN_MARKER, PLAN_MARKER } from "../workflow-session.js";
import { APPLY_MARKER, DESIGN_MARKER, PLAN_MARKER } from "../workflow-session.js";

/**
 * Skill name loaded by the agent in subagent (quality-first) mode.
 * When this skill tool call is seen, the user's config.yaml keepRecentTasks
 * applies; otherwise (main mode or unknown) keepRecentTasks is forced to 0.
 *
 * The skill name also appears verbatim in the /codespec/apply command text,
 * so it MUST be detected from the `skill` tool call (part.state.input.name),
 * not from user text parts — user text contains it in both modes.
 */
export const SUBAGENT_DEV_SKILL_NAME = "codespec-subagent-driven-development";

const COMMAND_MARKERS: Array<{ command: ApplyCommand; marker: string }> = [
  { command: "apply", marker: APPLY_MARKER },
];

function setApplySessionCommand(
  state: CompressionState,
  command: ApplyCommand,
): void {
  state.isApplySession = true;
  state.applyCommand = command;
  if (state.isSubagentMode) {
    // subagent (quality-first): honor user config, default 0
    state.keepRecentTasks = state.keepRecentTasksByCommand?.[command] ?? 0;
  } else {
    // main (speed-first) or unknown: always 0, ignore config
    state.keepRecentTasks = 0;
  }
}

/**
 * Detect subagent mode by scanning for a `skill` tool call whose input.name
 * matches the subagent-driven-development skill. opencode delivers skill
 * content as a tool part (part.state.output), never as a user text part, so
 * this is the only reliable runtime signal of which mode the agent chose.
 */
function detectSubagentModeFromTools(messages: WithParts[]): boolean {
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type !== "tool" || part.tool !== "skill") continue;
      const input = part.state?.input as { name?: string } | undefined;
      if (input?.name === SUBAGENT_DEV_SKILL_NAME) return true;
    }
  }
  return false;
}

/**
 * Detect whether the current session is a /codespec/apply session.
 * - Already detected (isApplySession=true): returns true immediately
 * - Not yet detected: scans user message text parts for the APPLY_MARKER
 *   - Found: sets state.isApplySession = true and returns true
 *   - Not found: returns false (no caching, will scan again next call)
 */
/**
 * Detect whether the current session is a /codespec/plan or /codespec/design session.
 * - Already detected (isPlanSession=true): returns true immediately
 * - Not yet detected: scans user message text parts for the passive pruning markers
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
      if (
        part.text.includes(PLAN_MARKER) ||
        part.text.includes(DESIGN_MARKER)
      ) {
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
  // Detect subagent mode from skill tool calls. Runs every turn until detected,
  // independent of the apply-session cache below, because the skill loads AFTER
  // the /codespec/apply command (which carries APPLY_MARKER) is detected.
  if (!state.isSubagentMode && detectSubagentModeFromTools(messages)) {
    state.isSubagentMode = true;
    // Mode became known after apply session was already cached: recompute
    // keepRecentTasks so the subagent config value takes effect.
    if (state.isApplySession && state.applyCommand) {
      setApplySessionCommand(state, state.applyCommand);
    }
  }

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
