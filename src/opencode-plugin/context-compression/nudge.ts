import type { CompressionState, TaskBoundary, WithParts } from "./types.js";
import { createSyntheticUserMessage } from "./message-utils.js";

/** Prefix used to identify nudge messages by their info.id */
export const NUDGE_MSG_ID_PREFIX = "msg_codespec_nudge_";

const TASK_COMPRESS_NUDGE = `<codespec-system-reminder>
[上下文压缩] 以下已完成任务的上下文需要压缩。请立即调用 task-compress 工具，为每个任务分别调用一次。

需要压缩的任务 ID：{taskList}

重要：
- 以上 task_id 是系统自动生成的，直接使用即可，无需验证
- 每个 task_id 必须单独调用一次 task-compress
- 调用 task-compress 之前不要继续执行下一个任务
</codespec-system-reminder>`;

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
    .map(t => `task_id="${t.taskId}"（${t.description}）`)
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
  const compressibleIndex = completedOrder.length - 2;
  if (compressibleIndex < 0) return null;

  const candidateId = completedOrder[compressibleIndex];
  const boundary = taskBoundaries.get(candidateId);
  if (!boundary || boundary.compressed) return null;

  return boundary;
}

function getAllCompressibleTasks(state: CompressionState): TaskBoundary[] {
  const { completedOrder, taskBoundaries } = state;
  const threshold = completedOrder.length - 1;
  return completedOrder
    .slice(0, threshold)
    .map(id => taskBoundaries.get(id)!)
    .filter(b => b && !b.compressed);
}
