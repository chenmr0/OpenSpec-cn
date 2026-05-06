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

      if (state.compressionBlocks.size === 0 && state.completedOrder.length < 3) {
        debugLog(`system.transform: skipping (blocks=${state.compressionBlocks.size} completed=${state.completedOrder.length})`);
        return;
      }

      const prompt = `[CodeSpec 上下文管理]
部分已完成任务的上下文会被压缩为摘要以节省 token。
当看到 <codespec-system-reminder> 中的压缩提示时，使用 task-compress tool 为指定任务生成摘要。
摘要应包含：任务描述、修改文件、审查结论。保持简洁。`;

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