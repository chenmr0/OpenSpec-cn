import { z } from "zod";
import type { CompressionState } from "./types.js";
import type { CompressionStateStore } from "./compression-state-store.js";

export function handleTaskCompress(
  state: CompressionState,
  taskId: string,
  summary: string,
  modifiedFiles: string[],
): string {
  const boundary = state.taskBoundaries.get(taskId);
  if (!boundary) {
    const availableIds = state.completedOrder
      .filter(id => {
        const b = state.taskBoundaries.get(id);
        return b && !b.compressed;
      })
      .join(", ");
    return `错误：任务 ${taskId} 不存在或未记录边界。当前可用的任务 ID：[${availableIds}]。请使用以上 ID 重试。`;
  }
  if (boundary.compressed) {
    return `错误：任务 ${taskId} 已被压缩，无需重复操作。`;
  }

  boundary.compressed = true;

  state.compressionBlocks.set(taskId, {
    taskId,
    summary,
    modifiedFiles,
    startMessageId: boundary.startMessageId,
    endMessageId: boundary.endMessageId,
    compressedAt: Date.now(),
    messageIds: [],
  });

  // Reset nudge so it can be injected again for remaining compressible tasks
  state.nudgeInjectedForTask = null;

  return `已压缩任务 ${taskId}。摘要：${summary}`;
}

export function createTaskCompressTool(compressionStateStore: CompressionStateStore) {
  return {
    description:
      "为已完成的任务生成压缩摘要以节省上下文空间。" +
      "当看到 <codespec-system-reminder> 中的压缩提示时，必须立即调用此工具。" +
      "taskId 参数必须原样使用提示中 task_id=\"...\" 的值，不要使用其他 ID（如 session ID）。",
    args: {
      taskId: z.string().describe("要压缩的任务 ID，必须与 <codespec-system-reminder> 提示中的 task_id 值完全一致"),
      summary: z.string().describe("任务的简洁摘要，包含：做了什么、修改了哪些文件、审查结论"),
      modifiedFiles: z.array(z.string()).describe("该任务修改或创建的文件路径列表"),
    },
    async execute(args: { taskId: string; summary: string; modifiedFiles: string[] }, context: { sessionID: string }) {
      const state = compressionStateStore.getState(context.sessionID);
      return handleTaskCompress(state, args.taskId, args.summary, args.modifiedFiles);
    },
  };
}
