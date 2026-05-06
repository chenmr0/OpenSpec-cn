import type { CompressionState, TaskBoundary, WithParts } from "./types.js";
import { createSyntheticUserMessage } from "./message-utils.js";

/** Prefix used to identify nudge messages by their info.id */
export const NUDGE_MSG_ID_PREFIX = "msg_codespec_nudge_";

const TASK_COMPRESS_NUDGE = `上下文管理：已完成任务的对话历史可以压缩以节省上下文空间。

请使用 \`task-compress\` tool 为以下已完成的任务生成摘要：
{taskList}

摘要要求：
- 一句话描述任务做了什么
- 列出修改的文件
- 包含审查结论

在继续下一个任务之前完成压缩。`;

/**
 * Remove previously injected nudge messages from the array.
 * Nudge messages are identified by their info.id prefix.
 */
export function removePreviousNudgeMessages(messages: WithParts[]): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.id.startsWith(NUDGE_MSG_ID_PREFIX)) {
      messages.splice(i, 1);
    }
  }
}

export function injectNudge(
  compressionState: CompressionState,
  messages: WithParts[],
): void {
  if (compressionState.nudgeInjectedForTask) return;

  const candidate = getCompressibleTask(compressionState);
  if (!candidate) return;

  const compressibleTasks = getAllCompressibleTasks(compressionState);
  if (compressibleTasks.length === 0) return;
  if (messages.length === 0) return;

  const taskList = compressibleTasks
    .map(t => `- 任务 ${t.taskId}: ${t.description}`)
    .join("\n");
  const nudgeText = TASK_COMPRESS_NUDGE.replace("{taskList}", taskList);

  const lastMessage = messages[messages.length - 1];
  const nudgeMsg = createSyntheticUserMessage(
    lastMessage,
    nudgeText,
    `nudge_${candidate.taskId}`,
  );
  // Ensure the ID uses our recognizable prefix
  nudgeMsg.info.id = `${NUDGE_MSG_ID_PREFIX}${candidate.taskId}`;

  messages.push(nudgeMsg);
  compressionState.nudgeInjectedForTask = candidate.taskId;
}

function getCompressibleTask(state: CompressionState): TaskBoundary | null {
  const { completedOrder, taskBoundaries } = state;
  const compressibleIndex = completedOrder.length - 3;
  if (compressibleIndex < 0) return null;

  const candidateId = completedOrder[compressibleIndex];
  const boundary = taskBoundaries.get(candidateId);
  if (!boundary || boundary.compressed) return null;

  return boundary;
}

function getAllCompressibleTasks(state: CompressionState): TaskBoundary[] {
  const { completedOrder, taskBoundaries } = state;
  const threshold = completedOrder.length - 2;
  return completedOrder
    .slice(0, threshold)
    .map(id => taskBoundaries.get(id)!)
    .filter(b => b && !b.compressed);
}
