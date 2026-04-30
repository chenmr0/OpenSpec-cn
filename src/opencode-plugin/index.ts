/**
 * CodeSpec Continuation Enforcer - OpenCode Plugin
 *
 * Automatically injects continuation prompts when an agent goes idle
 * while there are still incomplete tasks in the todo list.
 *
 * Simplified from oh-my-openagent's todo-continuation-enforcer:
 * - Removed: backgroundManager, compaction guard, agent routing (skipAgents),
 *   pending question detection, abort detection via messages, toast notifications
 * - Kept: session.idle monitoring, todo checking, continuation prompt injection,
 *   stagnation detection, exponential backoff, cancel handling
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin";

import { HOOK_NAME } from "./continuation/constants.js";
import { handleSessionIdle } from "./continuation/idle-event.js";
import { handleNonIdleEvent } from "./continuation/handler.js";
import { createSessionStateStore, type SessionStateStore } from "./continuation/session-state.js";

function createEventHandler(
  ctx: PluginInput,
  sessionStateStore: SessionStateStore,
): (input: { event: { type: string; properties?: unknown } }) => Promise<void> {
  return async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined;
      if (!sessionID) return;

      await handleSessionIdle({
        ctx,
        sessionID,
        sessionStateStore,
      });
      return;
    }

    // Handle all non-idle events (message updates, tool executions, errors, etc.)
    handleNonIdleEvent({
      eventType: event.type,
      properties: props,
      sessionStateStore,
    });
  };
}

const CodeSpecPlugin: Plugin = async (ctx) => {
  const sessionStateStore = createSessionStateStore();

  return {
    name: HOOK_NAME,
    event: createEventHandler(ctx, sessionStateStore),
  };
};

export default CodeSpecPlugin;
export { CodeSpecPlugin };
