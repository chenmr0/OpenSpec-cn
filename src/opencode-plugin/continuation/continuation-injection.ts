/**
 * Continuation prompt injection for the codespec continuation enforcer.
 * Simplified from oh-my-openagent: removed agent routing, compaction guard,
 * backgroundManager, and permission checks.
 */

import type { PluginInput } from "@opencode-ai/plugin";

import {
  CONTINUATION_PROMPT,
  HOOK_NAME,
} from "./constants.js";
import { getIncompleteCount } from "./todo.js";
import type { Todo } from "./types.js";
import type { SessionStateStore } from "./session-state.js";
import { isLastAssistantMessageAborted, normalizeSDKResponse } from "./messages-util.js";

export async function injectContinuation(args: {
  ctx: PluginInput;
  sessionID: string;
  sessionStateStore: SessionStateStore;
}): Promise<void> {
  const {
    ctx,
    sessionID,
    sessionStateStore,
  } = args;

  const state = sessionStateStore.getExistingState(sessionID);
  if (state?.isRecovering) {
    return;
  }

  if (state?.wasCancelled) {
    return;
  }

  if (state?.stoppedByUser) {
    return;
  }

  // Fetch fresh todos to verify we still need to continue
  let todos: Todo[] = [];
  try {
    const response = await ctx.client.session.todo({ path: { id: sessionID } });
    const data = response as { data?: Todo[] } | Todo[];
    todos = Array.isArray(data) ? data : (data as { data?: Todo[] }).data ?? [];
  } catch (error) {
    return;
  }

  const freshIncompleteCount = getIncompleteCount(todos);
  if (freshIncompleteCount === 0) {
    return;
  }

  const incompleteTodos = todos.filter((todo) => todo.status !== "completed" && todo.status !== "cancelled");
  const todoList = incompleteTodos.map((todo) => `- [${todo.status}] ${todo.content}`).join("\n");
  const prompt = `${CONTINUATION_PROMPT}

[Status: ${todos.length - freshIncompleteCount}/${todos.length} completed, ${freshIncompleteCount} remaining]

Remaining tasks:
${todoList}`;

  const injectionState = sessionStateStore.getExistingState(sessionID);
  if (injectionState?.wasCancelled) {
    return;
  }

  if (injectionState?.stoppedByUser) {
    return;
  }

  // 注入前复查 API 兜底：覆盖 session.error 被漏掉 + idle 瞬间 abort 错误未落库、
  // 倒计时 2 秒后才落库的竞态。复查失败同样保守不注入。
  try {
    const resp = await ctx.client.session.messages({ path: { id: sessionID } });
    const messages = normalizeSDKResponse<Record<string, unknown>[]>(resp, []);
    if (isLastAssistantMessageAborted(messages)) {
      if (injectionState) {
        injectionState.stoppedByUser = true;
        injectionState.stoppedAt = Date.now();
      }
      return;
    }
  } catch {
    return;
  }

  if (injectionState) {
    injectionState.inFlight = true;
  }

  try {

    await ctx.client.session.promptAsync({
      path: { id: sessionID },
      body: {
        parts: [{ type: "text", text: prompt }],
      },
      query: { directory: ctx.directory },
    });

    if (injectionState) {
      injectionState.inFlight = false;
      injectionState.lastInjectedAt = Date.now();
      injectionState.awaitingPostInjectionProgressCheck = true;
      injectionState.consecutiveFailures = 0;
    }
  } catch (error) {
    if (injectionState) {
      injectionState.inFlight = false;
      injectionState.lastInjectedAt = Date.now();
      injectionState.consecutiveFailures = (injectionState.consecutiveFailures ?? 0) + 1;

      const errorObj = error instanceof Error
        ? { name: error.name, message: error.message }
        : { message: String(error) };
      // Check for token limit errors
      if (errorObj.message?.includes("context") || errorObj.message?.includes("token")) {
        injectionState.tokenLimitDetected = true;
      }
    }
  }
}
