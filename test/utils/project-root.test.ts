import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import nodeFs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { resolveCodespecRoot } from '../../src/utils/project-root.js';

describe('resolveCodespecRoot', () => {
  let testDir: string;
  let previousMode: string | undefined;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `codespec-root-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // 恢复环境变量，避免用例间串扰
    if (previousMode === undefined) {
      delete process.env.CODESPEC_ROOT_MODE;
    } else {
      process.env.CODESPEC_ROOT_MODE = previousMode;
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('默认模式（CODESPEC_ROOT_MODE 未设置或非 git）—— 返回启动目录', () => {
    beforeEach(() => {
      previousMode = process.env.CODESPEC_ROOT_MODE;
      delete process.env.CODESPEC_ROOT_MODE;
    });

    it('未设置时即使上层存在 .git 也返回启动目录', () => {
      const root = path.join(testDir, 'repo');
      const deep = path.join(root, 'packages', 'core', 'src');
      nodeFs.mkdirSync(deep, { recursive: true });
      nodeFs.mkdirSync(path.join(root, '.git'));
      // 默认不再向上查找 .git，直接返回启动目录
      expect(resolveCodespecRoot(deep)).toBe(path.resolve(deep));
    });

    it('启动目录本身有 .git 时仍返回启动目录（不因其存在而改变）', () => {
      const root = path.join(testDir, 'repo');
      nodeFs.mkdirSync(root);
      nodeFs.mkdirSync(path.join(root, '.git'));
      expect(resolveCodespecRoot(root)).toBe(path.resolve(root));
    });

    it('显式 CODESPEC_ROOT_MODE=cwd 时返回启动目录', () => {
      process.env.CODESPEC_ROOT_MODE = 'cwd';
      const root = path.join(testDir, 'repo');
      const deep = path.join(root, 'sub');
      nodeFs.mkdirSync(deep, { recursive: true });
      nodeFs.mkdirSync(path.join(root, '.git'));
      expect(resolveCodespecRoot(deep)).toBe(path.resolve(deep));
    });

    it('CODESPEC_ROOT_MODE 为未知值时按 cwd 处理', () => {
      process.env.CODESPEC_ROOT_MODE = 'something-else';
      const root = path.join(testDir, 'repo');
      const deep = path.join(root, 'sub');
      nodeFs.mkdirSync(deep, { recursive: true });
      nodeFs.mkdirSync(path.join(root, '.git'));
      expect(resolveCodespecRoot(deep)).toBe(path.resolve(deep));
    });

    it('未传 startDir 时默认基于 process.cwd() 解析且不抛错', () => {
      const result = resolveCodespecRoot();
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('git 模式（CODESPEC_ROOT_MODE=git）—— 向上查找 .git', () => {
    beforeEach(() => {
      previousMode = process.env.CODESPEC_ROOT_MODE;
      process.env.CODESPEC_ROOT_MODE = 'git';
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

    it('git 取值大小写不敏感', () => {
      process.env.CODESPEC_ROOT_MODE = 'GIT';
      const root = path.join(testDir, 'repo');
      const deep = path.join(root, 'sub');
      nodeFs.mkdirSync(deep, { recursive: true });
      nodeFs.mkdirSync(path.join(root, '.git'));
      expect(resolveCodespecRoot(deep)).toBe(path.resolve(root));
    });
  });
});