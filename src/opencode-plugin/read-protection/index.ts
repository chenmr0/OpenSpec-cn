import * as fs from "fs";
import * as path from "path";

const SIZE_THRESHOLD = 20 * 1024; // 20KB
const LINE_THRESHOLD = 1000;
const LINE_CHECK_BYTES = 64 * 1024; // read up to 64KB to count newlines

const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf",
  ".zip", ".tar", ".gz", ".exe", ".dll", ".so",
  ".wasm", ".mp4", ".mp3", ".wav", ".avi", ".mov",
]);

export function createReadProtectionHandler() {
  return async (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: Record<string, unknown> },
  ): Promise<void> => {
    if (input.tool !== "read") return;

    const filePath = output.args.filePath as string | undefined;
    if (!filePath) return;

    const offset = output.args.offset as number | undefined;
    const limit = output.args.limit as number | undefined;
    if (offset || limit) return;

    // Skip media/binary extensions that Read handles specially
    const ext = path.extname(filePath).toLowerCase();
    if (SKIP_EXTENSIONS.has(ext)) return;

    // Skip key project files that are expected to be read in full
    const basename = path.basename(filePath).toLowerCase();
    if (basename === "design.md" || basename === "spec.md" || basename === "task.md" || basename === "plan.md") return;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return; // let Read tool handle missing files
    }

    if (!stat.isFile()) return;

    // Size check
    if (stat.size > SIZE_THRESHOLD) {
      throw new Error(
        `[Read 保护] 文件大小 ${(stat.size / 1024).toFixed(1)} KB 超过 ${SIZE_THRESHOLD / 1024} KB 限制。` +
        `请使用 offset 和 limit 参数分段读取。` +
        `例如: read(filePath="${filePath}", offset=1, limit=500) 读取前 500 行。`,
      );
    }

    // Line count check — scan buffer for \n
    if (stat.size > 0) {
      const buf = Buffer.alloc(Math.min(stat.size, LINE_CHECK_BYTES));
      const fd = fs.openSync(filePath, "r");
      try {
        fs.readSync(fd, buf, 0, buf.length, 0);
      } finally {
        fs.closeSync(fd);
      }
      let newlineCount = 0;
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 0x0a) newlineCount++;
      }
      if (newlineCount > LINE_THRESHOLD) {
        throw new Error(
          `[Read 保护] 文件行数约 ${newlineCount} 行超过 ${LINE_THRESHOLD} 行限制。` +
          `请使用 offset 和 limit 参数分段读取。` +
          `例如: read(filePath="${filePath}", offset=1, limit=500) 读取前 500 行。`,
        );
      }
    }
  };
}
