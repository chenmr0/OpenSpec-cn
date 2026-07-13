import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  cleanupDeprecatedExternalSkillDirs,
  DEPRECATED_EXTERNAL_SKILL_DIRS,
} from '../../../src/core/shared/skill-generation.js';

const GENERATED_SKILL = (name: string, version = '1.0.0') =>
  [
    '---',
    `name: ${name}`,
    'metadata:',
    `  generatedBy: "${version}"`,
    '---',
    '',
    'Skill body',
    '',
  ].join('\n');

const UNMARKED_SKILL = (name: string) =>
  ['---', `name: ${name}`, '---', '', 'User-authored skill', ''].join('\n');

describe('cleanupDeprecatedExternalSkillDirs', () => {
  let skillsDir: string;

  beforeEach(async () => {
    skillsDir = path.join(os.tmpdir(), `codespec-cleanup-skills-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    await fs.mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(skillsDir, { recursive: true, force: true });
  });

  it('removes deprecated external skill dirs that carry the CodeSpec generatedBy marker', async () => {
    const oldDir = path.join(skillsDir, 'subagent-driven-development');
    await fs.mkdir(oldDir, { recursive: true });
    await fs.writeFile(path.join(oldDir, 'SKILL.md'), GENERATED_SKILL('subagent-driven-development'));

    const removed = await cleanupDeprecatedExternalSkillDirs(skillsDir);

    expect(removed).toContain(oldDir);
    expect(await fs.stat(oldDir).then(() => true).catch(() => false)).toBe(false);
  });

  it('preserves same-named skill dirs without the generatedBy marker (e.g. superpowers)', async () => {
    const oldDir = path.join(skillsDir, 'test-driven-development');
    await fs.mkdir(oldDir, { recursive: true });
    await fs.writeFile(path.join(oldDir, 'SKILL.md'), UNMARKED_SKILL('test-driven-development'));

    const removed = await cleanupDeprecatedExternalSkillDirs(skillsDir);

    expect(removed).not.toContain(oldDir);
    expect(await fs.stat(oldDir).then(() => true).catch(() => false)).toBe(true);
  });

  it('skips dirs that do not exist', async () => {
    const removed = await cleanupDeprecatedExternalSkillDirs(skillsDir);
    expect(removed).toEqual([]);
  });

  it('skips dirs without a SKILL.md (cannot verify provenance)', async () => {
    const oldDir = path.join(skillsDir, 'verification-before-completion');
    await fs.mkdir(oldDir, { recursive: true });
    await fs.writeFile(path.join(oldDir, 'README.md'), 'no skill file here');

    const removed = await cleanupDeprecatedExternalSkillDirs(skillsDir);

    expect(removed).not.toContain(oldDir);
    expect(await fs.stat(oldDir).then(() => true).catch(() => false)).toBe(true);
  });

  it('cleans every deprecated dir name listed in the registry', async () => {
    const oldDirNames = DEPRECATED_EXTERNAL_SKILL_DIRS.map((entry) => entry.oldDirName);
    expect(oldDirNames).toEqual([
      'subagent-driven-development',
      'test-driven-development',
      'verification-before-completion',
    ]);

    for (const oldDirName of oldDirNames) {
      const oldDir = path.join(skillsDir, oldDirName);
      await fs.mkdir(oldDir, { recursive: true });
      await fs.writeFile(path.join(oldDir, 'SKILL.md'), GENERATED_SKILL(oldDirName));
    }

    const removed = await cleanupDeprecatedExternalSkillDirs(skillsDir);
    expect(removed).toHaveLength(3);

    for (const oldDirName of oldDirNames) {
      const oldDir = path.join(skillsDir, oldDirName);
      expect(await fs.stat(oldDir).then(() => true).catch(() => false)).toBe(false);
    }
  });

  it('mixes marked and unmarked same-named dirs: only deletes marked ones', async () => {
    // superpowers-style unmarked TDD dir alongside a CodeSpec-generated SDD dir
    const unmarked = path.join(skillsDir, 'test-driven-development');
    await fs.mkdir(unmarked, { recursive: true });
    await fs.writeFile(path.join(unmarked, 'SKILL.md'), UNMARKED_SKILL('test-driven-development'));

    const marked = path.join(skillsDir, 'subagent-driven-development');
    await fs.mkdir(marked, { recursive: true });
    await fs.writeFile(path.join(marked, 'SKILL.md'), GENERATED_SKILL('subagent-driven-development'));

    const removed = await cleanupDeprecatedExternalSkillDirs(skillsDir);

    expect(removed).toContain(marked);
    expect(removed).not.toContain(unmarked);
    expect(await fs.stat(unmarked).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.stat(marked).then(() => true).catch(() => false)).toBe(false);
  });
});