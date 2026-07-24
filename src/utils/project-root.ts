import { existsSync } from 'fs';
import path from 'path';

/**
 * 解析 codespec 根目录。
 *
 * 解析模式由环境变量 `CODESPEC_ROOT_MODE` 控制（大小写不敏感）：
 * - `cwd`（默认，未设置或任意非 `git` 值）：直接以启动目录作为根目录。
 * - `git`：从启动目录逐级向上查找 `.git`（文件或目录均算，兼容 git
 *   worktree 的 `.git` 文件指针），将其所在目录作为根目录；走到文件系统
 *   根仍未找到时回退到启动目录。
 *
 * 不调用 git 子进程，仅做存在性判断，零外部依赖。
 *
 * @param startDir 起始目录，默认 process.cwd()
 * @returns 解析出的项目根目录绝对路径
 */
export function resolveCodespecRoot(startDir: string = process.cwd()): string {
  const start = path.resolve(startDir);
  // 默认 cwd；仅 CODESPEC_ROOT_MODE=git 时才向上查找 .git
  if ((process.env.CODESPEC_ROOT_MODE || 'cwd').toLowerCase() !== 'git') {
    return start;
  }
  let current = start;
  while (true) {
    if (existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}