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
import type { WithParts } from "./opencode-plugin/context-compression/types.js";
import { createMessagesTransformHandler } from "./opencode-plugin/context-compression/message-transform.js";
import { createSystemTransformHandler } from "./opencode-plugin/context-compression/system-transform.js";
import { createTaskCompressTool } from "./opencode-plugin/context-compression/task-compress-tool.js";
import { createReadProtectionHandler } from "./opencode-plugin/read-protection/index.js";
import { createGitAddGuardHandler } from "./opencode-plugin/git-add-guard.js";
import {
  createWorkflowSessionStore,
  recordProtectedWorkflowSessionFromMessages,
  type WorkflowSessionStore,
} from "./opencode-plugin/workflow-session.js";
import { readProjectConfig } from "./core/project-config.js";
import { autoCleanupStaleWorkflows } from "./opencode-plugin/auto-cleanup.js";

function createEventHandler(
  ctx: PluginInput,
  sessionStateStore: SessionStateStore,
  workflowSessionStore: WorkflowSessionStore,
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

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      if (sessionInfo?.id) {
        workflowSessionStore.cleanup(sessionInfo.id);
      }
    }

    handleNonIdleEvent({
      eventType: event.type,
      properties: props,
      sessionStateStore,
    });
  };
}

const CodeSpecPlugin: Plugin = async (ctx) => {
  // Auto-cleanup stale artifacts from older versions (/apply-quick, quick-driven-development)
  const cleanupResult = autoCleanupStaleWorkflows();
  if (cleanupResult.removedCommands.length > 0 || cleanupResult.removedSkills.length > 0) {
    const parts: string[] = [];
    if (cleanupResult.removedCommands.length > 0) {
      parts.push(`commands: ${cleanupResult.removedCommands.join(', ')}`);
    }
    if (cleanupResult.removedSkills.length > 0) {
      parts.push(`skills: ${cleanupResult.removedSkills.join(', ')}`);
    }
    console.log(`[codespec] Cleaned up stale artifacts (${parts.join('; ')})`);
  }

  const projectConfig = readProjectConfig(ctx.directory);
  const sessionStateStore = createSessionStateStore();
  const compressionStateStore = createCompressionStateStore(projectConfig?.compression);
  const workflowSessionStore = createWorkflowSessionStore();

  const readProtection = createReadProtectionHandler({
    isEnabledForSession: (sessionID) => workflowSessionStore.isProtectedSession(sessionID),
  });
  const gitAddGuard = createGitAddGuardHandler();
  const messagesTransform = createMessagesTransformHandler(compressionStateStore);

  return {
    event: createEventHandler(ctx, sessionStateStore, workflowSessionStore),

    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> },
    ) => {
      await readProtection(input, output);
      await gitAddGuard(input, output);
    },

    "experimental.chat.messages.transform": (async (
      input: unknown,
      output: { messages: WithParts[] },
    ) => {
      if (Array.isArray(output.messages)) {
        recordProtectedWorkflowSessionFromMessages(workflowSessionStore, output.messages);
      }
      await messagesTransform(input, output);
    }) as any,
    "experimental.chat.system.transform":
      createSystemTransformHandler(compressionStateStore) as any,

    tool: {
      "task-compress": createTaskCompressTool(compressionStateStore) as any,
    },
  };
};

export default CodeSpecPlugin;
export { CodeSpecPlugin };
