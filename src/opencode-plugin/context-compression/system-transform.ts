import type { CompressionStateStore } from "./compression-state-store.js";
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

export function createSystemTransformHandler(
  compressionStateStore: CompressionStateStore,
) {
  return async (
    input: { sessionID?: string; model?: unknown },
    output: { system: string[] },
  ) => {
    try {
      debugLog(`=== system.transform called === sessionID=${input.sessionID}`);
      const state = compressionStateStore.getState(input.sessionID || 'default');

      // Only inject compression prompt in /codespec/apply sessions
      if (!state.isApplySession) {
        debugLog(`system.transform: not an apply session — skipping`);
        return;
      }

      if (state.compressionBlocks.size === 0 && state.completedOrder.length < 2) {
        debugLog(`system.transform: skipping (blocks=${state.compressionBlocks.size} completed=${state.completedOrder.length})`);
        return;
      }

      const prompt = `[CodeSpec 上下文管理]
部分已完成任务的对话上下文会被压缩为摘要以节省 token 空间。
当看到 <codespec-system-reminder> 标签中的压缩提示时，必须立即调用 task-compress 工具。
摘要要求：一句话描述任务、列出修改的文件、包含审查结论。保持简洁。
task-compress 的 taskId 参数必须原样使用提示中给出的 task_id 值，不要修改或猜测。`;

      if (output.system.length > 0) {
        output.system[output.system.length - 1] += "\n\n" + prompt;
      } else {
        output.system.push(prompt);
      }
      debugLog(`system.transform: injected prompt`);
    } catch (err) {
      debugLog(`ERROR in system.transform: ${err}`);
    }
  };
}