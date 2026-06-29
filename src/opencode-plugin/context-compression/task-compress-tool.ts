import { z } from "zod";
import type { CompressionState } from "./types.js";
import type { CompressionStateStore } from "./compression-state-store.js";

export function handleTaskCompress(
  state: CompressionState,
  taskId: string,
  summary: string,
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
      summary: z.string().describe(
        "任务的摘要，为后续任务保留充必要上下文。必须包含：" +
        "1) 修改内容：所有修改的文件路径及具体变更，关键代码逻辑" +
        "2) 测试/审查：测试结果或审查结论" +
        "3) 架构定位：该任务在整体需求中的角色、为后续任务暴露的接口或契约" +
        "4) 设计决策：实现中做出的关键选择及其原因（如为什么选择某种模式/结构）" +
        "5) 遗留问题（如果有）：未完成部分、已知限制" +
        "6) 后续注意事项（如果有）：下游任务实现时需要关注的关键信息"
      ),
    },
    async execute(args: { taskId: string; summary: string }, context: { sessionID: string }) {
      const state = compressionStateStore.getState(context.sessionID);
      return handleTaskCompress(state, args.taskId, args.summary);
    },
  };
}
