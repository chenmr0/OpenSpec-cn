import type { WithParts, CompressionState } from "./types.js";
import type { CompressionStateStore } from "./compression-state-store.js";
import { injectNudge, removePreviousNudgeMessages, NUDGE_MSG_ID_PREFIX } from "./nudge.js";
import { createSyntheticUserMessage } from "./message-utils.js";
import { detectApplySession } from "./session-detection.js";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEBUG_LOG = join(tmpdir(), "codespec-debug.log");
function debugLog(msg: string): void {
  try {
    const ts = new Date().toISOString();
    writeFileSync(DEBUG_LOG, `[${ts}] ${msg}\n`, { flag: "a" });
  } catch {
    // file logging failed, silently ignore
  }
}

/**
 * Create the messages.transform handler.
 *
 * On every LLM turn this scans the full message list for `todowrite` tool
 * parts, extracts the latest todo snapshot, detects newly-completed tasks,
 * records task boundaries, and then:
 *   1. injects a nudge prompting the LLM to use `task-compress`
 *   2. replaces compressed message ranges with summaries
 */
export function createMessagesTransformHandler(
  compressionStateStore: CompressionStateStore,
) {
  return async (input: {}, output: { messages: WithParts[] }) => {
    try {
      debugLog(`=== messages.transform called ===`);
      const messages = output.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        debugLog(`messages is empty or not array: ${typeof messages}`);
        return;
      }

      debugLog(`messages count: ${messages.length}`);

      const sessionID = messages[0]?.info?.sessionID || "default-session";
      debugLog(`sessionID: ${sessionID}`);
      const state = compressionStateStore.getState(sessionID);

      // Log all tool parts found
      for (const msg of messages) {
        for (const part of msg.parts) {
          if (part.type === "tool") {
            debugLog(`TOOL part: tool=${part.tool} state.status=${part.state?.status} hasInput=${!!part.state?.input}`);
            if (part.tool === "todowrite" && part.state?.input) {
              debugLog(`todowrite input JSON: ${JSON.stringify(part.state.input).slice(0, 500)}`);
            }
            if (part.tool === "task-compress") {
              debugLog(`task-compress status=${part.state?.status} input=${JSON.stringify(part.state?.input)} output=${part.state?.output ?? "(none)"}`);
            }
          }
        }
      }

      // Only run compression logic in /codespec/apply sessions
      if (!detectApplySession(state, messages)) {
        debugLog(`not an apply session — skipping compression`);
        return;
      }

      detectCompletedTasks(state, messages);
      debugLog(`after detect: completedOrder=${state.completedOrder.length} boundaries=${state.taskBoundaries.size} nudgeInjectedForTask=${state.nudgeInjectedForTask}`);

      removePreviousNudgeMessages(messages);
      injectNudge(state, messages);
      replaceCompressedMessages(state, messages);
      debugLog(`after replace: messages count: ${messages.length} compressionBlocks=${state.compressionBlocks.size}`);
    } catch (err) {
      debugLog(`ERROR in messages.transform: ${err}`);
    }
  };
}

// ---------------------------------------------------------------------------
// Inline task detection — scans messages for todowrite parts directly
// ---------------------------------------------------------------------------

/**
 * Stable hash for a todo item derived from its content text.
 * OpenCode todos have `{ content, status, priority }` but no `id` field.
 */
function todoId(content: string): string {
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  }
  return String(Math.abs(h));
}

interface RawTodo {
  content: string;
  status: string;
}

function detectCompletedTasks(state: CompressionState, messages: WithParts[]): void {
  // Walk all messages and collect the latest status of every todo seen in
  // any todowrite tool part. We process from oldest to newest so the final
  // snapshot reflects the most-recent write.
  const currentSnapshot = new Map<string, { status: string; desc: string }>();
  let firstTodowriteMsgId: string | undefined;

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type !== "tool" || part.tool !== "todowrite") continue;
      if (!part.state?.input) continue;

      const todos = extractTodos(part.state.input);
      for (const todo of todos) {
        const id = todoId(todo.content);
        currentSnapshot.set(id, { status: todo.status, desc: todo.content });
      }

      // Use this message as the boundary marker — it contains the todowrite call.
      const messageId = (part as any).messageID as string | undefined
        ?? msg.info.id;

      if (firstTodowriteMsgId === undefined) {
        firstTodowriteMsgId = messageId;
      }

      for (const todo of todos) {
        const id = todoId(todo.content);
        const previousStatus = state.lastTodoSnapshot.get(id);

        if (todo.status === "completed" && previousStatus !== "completed") {
          const prevCompleted = state.completedOrder;
          let startMessageId: string;
          if (prevCompleted.length > 0) {
            const prevEndId = state.taskBoundaries.get(
              prevCompleted[prevCompleted.length - 1],
            )!.endMessageId;
            const prevEndIdx = messages.findIndex(m => m.info.id === prevEndId);
            if (prevEndIdx >= 0) {
              // Skip synthetic messages (nudge / compression summaries)
              let nextIdx = prevEndIdx + 1;
              while (nextIdx < messages.length) {
                const nid = messages[nextIdx].info.id;
                if (
                  !nid.startsWith(NUDGE_MSG_ID_PREFIX) &&
                  !nid.startsWith("codespec_compress_")
                ) break;
                nextIdx++;
              }
              startMessageId = nextIdx < messages.length
                ? messages[nextIdx].info.id
                : messageId;
            } else {
              startMessageId = messageId;
            }
          } else {
            startMessageId = firstTodowriteMsgId!;
          }

          if (!state.taskBoundaries.has(id)) {
            state.taskBoundaries.set(id, {
              taskId: id,
              description: todo.content,
              startMessageId,
              endMessageId: messageId,
              completedAt: Date.now(),
              compressed: false,
            });
            state.completedOrder.push(id);
          } else {
            // Update boundary position
            const boundary = state.taskBoundaries.get(id)!;
            boundary.endMessageId = messageId;
          }
        }
      }
    }
  }

  // Persist the latest snapshot
  state.lastTodoSnapshot.clear();
  for (const [id, val] of currentSnapshot) {
    state.lastTodoSnapshot.set(id, val.status);
  }
}

function extractTodos(input: unknown): RawTodo[] {
  if (!input || typeof input !== "object") return [];

  const obj = input as Record<string, unknown>;

  // todowrite wraps todos in { todos: [...] }
  const arr = Array.isArray(obj) ? obj : obj.todos;
  if (!Array.isArray(arr)) return [];

  return arr
    .filter((t: any) => t && typeof t.status === "string" && typeof (t.content ?? t.subject) === "string")
    .map((t: any) => ({
      content: (t.content ?? t.subject ?? "") as string,
      status: t.status as string,
    }));
}

// ---------------------------------------------------------------------------
// Replace compressed message ranges with summaries
// ---------------------------------------------------------------------------

function replaceCompressedMessages(
  state: { compressionBlocks: Map<string, any> },
  messages: WithParts[],
): void {
  const allBlocks = Array.from(state.compressionBlocks.values());
  debugLog(`replaceCompressedMessages: ${allBlocks.length} blocks, ${messages.length} messages`);

  const blocks = allBlocks
    .map(block => {
      const startIndex = messages.findIndex(m => m.info.id === block.startMessageId);
      const endIndex = messages.findIndex(m => m.info.id === block.endMessageId);
      debugLog(`  block taskId=${block.taskId} start=${block.startMessageId}(${startIndex}) end=${block.endMessageId}(${endIndex})`);
      return { block, startIndex, endIndex };
    })
    .filter(({ startIndex, endIndex }) => startIndex !== -1 && endIndex !== -1)
    .sort((a, b) => b.startIndex - a.startIndex);

  if (blocks.length === 0) {
    debugLog(`  no blocks matched — skipping replace`);
    return;
  }

  for (const { block, startIndex, endIndex } of blocks) {
    block.messageIds = messages
      .slice(startIndex, endIndex + 1)
      .map(m => m.info.id);

    const summaryText = `[已完成任务摘要 - 上下文已压缩]\n${block.summary}\n修改文件：${block.modifiedFiles.length > 0 ? block.modifiedFiles.join(", ") : "无"}`;
    const summaryMessage = createSyntheticUserMessage(
      messages[Math.max(0, startIndex - 1)],
      summaryText,
      `codespec_compress_${block.taskId}`,
    );

    debugLog(`  splicing [${startIndex}..${endIndex}] (${endIndex - startIndex + 1} msgs) for task ${block.taskId}`);
    messages.splice(startIndex, endIndex - startIndex + 1, summaryMessage);
  }
}
