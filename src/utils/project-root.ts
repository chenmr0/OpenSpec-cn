import { existsSync } from 'fs';
import path from 'path';

/**
 * 从给定目录逐级向上查找 `.git`（文件或目录均算，兼容 git worktree
 * 的 `.git` 文件指针），将其所在目录作为 codespec 根目录。
 * 走到文件系统根仍未找到时，回退到 startDir（等价于按启动目录解析的原行为）。
 *
 * 不调用 git 子进程，仅做存在性判断，零外部依赖。
 *
 * @param startDir 起始目录，默认 process.cwd()
 * @returns 解析出的项目根目录绝对路径
 */
export function resolveCodespecRoot(startDir: string = process.cwd()): string {
  let current = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}