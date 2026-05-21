/**
 * CodeSpec - OpenCode Plugin Entry Point
 *
 * This is the default export loaded by OpenCode when the "codespec" package
 * is listed in the plugin array of opencode.json.
 *
 * The CLI entry point is at bin/codespec.js -> dist/cli/index.js.
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin";

import { handleSessionIdle } from "./opencode-plugin/continuation/idle-event.js";
import { handleNonIdleEvent } from "./opencode-plugin/continuation/handler.js";
import { createSessionStateStore, type SessionStateStore } from "./opencode-plugin/continuation/session-state.js";
import { createCompressionStateStore, type CompressionStateStore } from "./opencode-plugin/context-compression/compression-state-store.js";
import { createMessagesTransformHandler } from "./opencode-plugin/context-compression/message-transform.js";
import { createSystemTransformHandler } from "./opencode-plugin/context-compression/system-transform.js";
import { createTaskCompressTool } from "./opencode-plugin/context-compression/task-compress-tool.js";
import { createReadProtectionHandler } from "./opencode-plugin/read-protection/index.js";
import { readProjectConfig } from "./core/project-config.js";

function createEventHandler(
  ctx: PluginInput,
  sessionStateStore: SessionStateStore,
) {
  return async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined;
    const part = props?.part as Record<string, unknown> | undefined;
    const sessionID = (props?.sessionID as string | undefined)
      ?? (part?.sessionID as string | undefined)
      ?? ((props?.info as Record<string, unknown>)?.sessionID as string | undefined);

    if (event.type === "session.idle") {
      if (!sessionID) return;

      await handleSessionIdle({
        ctx,
        sessionID,
        sessionStateStore,
      });
      return;
    }

    handleNonIdleEvent({
      eventType: event.type,
      properties: props,
      sessionStateStore,
    });
  };
}

const CodeSpecPlugin: Plugin = async (ctx) => {
  const projectConfig = readProjectConfig(ctx.directory);
  const keepRecentTasks = projectConfig?.compression?.keepRecentTasks;
  const sessionStateStore = createSessionStateStore();
  const compressionStateStore = createCompressionStateStore({ keepRecentTasks });

  return {
    event: createEventHandler(ctx, sessionStateStore),

    "tool.execute.before": createReadProtectionHandler(),

    "experimental.chat.messages.transform":
      createMessagesTransformHandler(compressionStateStore) as any,
    "experimental.chat.system.transform":
      createSystemTransformHandler(compressionStateStore) as any,

    tool: {
      "task-compress": createTaskCompressTool(compressionStateStore) as any,
    },
  };
};

export default CodeSpecPlugin;
export { CodeSpecPlugin };
