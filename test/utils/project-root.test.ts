import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import nodeFs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { resolveCodespecRoot } from '../../src/utils/project-root.js';

describe('resolveCodespecRoot', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `codespec-root-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('在启动目录本身有 .git 目录时返回该目录', () => {
    const root = path.join(testDir, 'repo');
    nodeFs.mkdirSync(root);
    nodeFs.mkdirSync(path.join(root, '.git'));
    expect(resolveCodespecRoot(root)).toBe(path.resolve(root));
  });

  it('从深层子目录向上找到 .git 目录时返回仓库根', () => {
    const root = path.join(testDir, 'repo');
    const deep = path.join(root, 'packages', 'core', 'src');
    nodeFs.mkdirSync(deep, { recursive: true });
    nodeFs.mkdirSync(path.join(root, '.git'));
    expect(resolveCodespecRoot(deep)).toBe(path.resolve(root));
  });

  it('.git 为文件（git worktree 指针）时也识别为根', () => {
    const root = path.join(testDir, 'wt');
    const deep = path.join(root, 'sub');
    nodeFs.mkdirSync(deep, { recursive: true });
    nodeFs.writeFileSync(path.join(root, '.git'), 'gitdir: /somewhere/main.git');
    expect(resolveCodespecRoot(deep)).toBe(path.resolve(root));
  });

  it('沿途多个 .git 时返回最靠近启动目录的那一个', () => {
    const outer = path.join(testDir, 'outer');
    const inner = path.join(outer, 'inner');
    const deep = path.join(inner, 'pkg');
    nodeFs.mkdirSync(deep, { recursive: true });
    nodeFs.mkdirSync(path.join(outer, '.git'));
    nodeFs.mkdirSync(path.join(inner, '.git'));
    expect(resolveCodespecRoot(deep)).toBe(path.resolve(inner));
  });

  it('向上一直找不到 .git 时回退到启动目录', () => {
    const isolated = path.join(testDir, 'no-git', 'sub');
    nodeFs.mkdirSync(isolated, { recursive: true });
    expect(resolveCodespecRoot(isolated)).toBe(path.resolve(isolated));
  });

  it('未传 startDir 时默认基于 process.cwd() 解析（无 .git 则回退 cwd 绝对路径）', () => {
    // process.cwd() 在测试进程中通常不在 git 仓库内（视运行环境而定），
    // 这里仅断言返回值为绝对路径且不抛错。
    const result = resolveCodespecRoot();
    expect(path.isAbsolute(result)).toBe(true);
  });
});