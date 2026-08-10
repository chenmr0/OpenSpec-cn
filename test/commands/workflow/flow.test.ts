import { describe, it, expect } from 'vitest';
import { computeFlowKey, resolveFlow } from '../../../src/commands/workflow/flow.js';

describe('flow', () => {
  describe('computeFlowKey', () => {
    it('returns SCV when nothing is skipped', () => {
      expect(computeFlowKey([])).toBe('SCV');
    });

    it('returns SCV when skipReviewers is undefined-like (empty)', () => {
      expect(computeFlowKey([])).toBe('SCV');
    });

    it('returns CV when only spec-reviewer is skipped', () => {
      expect(computeFlowKey(['spec-reviewer'])).toBe('CV');
    });

    it('returns SV when only code-quality-reviewer is skipped', () => {
      expect(computeFlowKey(['code-quality-reviewer'])).toBe('SV');
    });

    it('returns SC when only change-verifier is skipped', () => {
      expect(computeFlowKey(['change-verifier'])).toBe('SC');
    });

    it('returns V when spec + code-quality are skipped', () => {
      expect(computeFlowKey(['spec-reviewer', 'code-quality-reviewer'])).toBe('V');
    });

    it('returns C when spec + verifier are skipped', () => {
      expect(computeFlowKey(['spec-reviewer', 'change-verifier'])).toBe('C');
    });

    it('returns S when code-quality + verifier are skipped', () => {
      expect(computeFlowKey(['code-quality-reviewer', 'change-verifier'])).toBe('S');
    });

    it('returns NONE when all three are skipped', () => {
      expect(computeFlowKey(['spec-reviewer', 'code-quality-reviewer', 'change-verifier'])).toBe('NONE');
    });

    it('is order-independent', () => {
      expect(computeFlowKey(['change-verifier', 'spec-reviewer'])).toBe('C');
      expect(computeFlowKey(['code-quality-reviewer', 'spec-reviewer'])).toBe('V');
    });
  });

  describe('resolveFlow', () => {
    // Every key must resolve to a defined variant.
    const ALL_KEYS = ['SCV', 'CV', 'SV', 'SC', 'V', 'C', 'S', 'NONE'];

    for (const key of ALL_KEYS) {
      it(`resolves variant for key ${key}`, () => {
        const variant = resolveFlow(keyToSkip(key));
        expect(variant).toBeDefined();
        expect(variant.steps.length).toBeGreaterThan(0);
        // Every suffix attaches at "还有剩余任务?否" and closes the digraph.
        expect(variant.suffix).toContain('还有剩余任务');
        expect(variant.suffix.trim().endsWith('}')).toBe(true);
      });
    }

    it('suffix closes the digraph with a brace', () => {
      const variant = resolveFlow([]);
      expect(variant.suffix.trim().endsWith('}')).toBe(true);
    });

    it('includes spec-reviewer node only when spec-reviewer is active', () => {
      const withSpec = resolveFlow([]);
      expect(withSpec.suffix).toContain('spec-reviewer');

      const withoutSpec = resolveFlow(['spec-reviewer']);
      expect(withoutSpec.suffix).not.toContain('spec-reviewer');
    });

    it('includes change-verifier node only when change-verifier is active', () => {
      const withCv = resolveFlow([]);
      expect(withCv.suffix).toContain('change-verifier');

      const withoutCv = resolveFlow(['change-verifier']);
      expect(withoutCv.suffix).not.toContain('change-verifier');
    });

    it('steps list always starts with implement and ends with report', () => {
      for (const key of ALL_KEYS) {
        const variant = resolveFlow(keyToSkip(key));
        expect(variant.steps[0]).toContain('逐任务执行');
        expect(variant.steps[0]).toContain('按 task.md 编号逐条执行');
        expect(variant.steps[variant.steps.length - 1]).toBe('报告完成');
      }
    });

    it('steps list contains exactly the active reviewers', () => {
      expect(resolveFlow([]).steps).toEqual([
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行并记录证据→全部通过后标记完成）',
        'spec-reviewer 审查规格合规性（失败→修复→重审）',
        'code-quality-reviewer 审查代码质量（失败→修复→重审）',
        'change-verifier 变更级验证（失败→修复循环，最多3次）',
        '报告完成',
      ]);

      expect(resolveFlow(['spec-reviewer', 'code-quality-reviewer']).steps).toEqual([
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行并记录证据→全部通过后标记完成）',
        'change-verifier 变更级验证（失败→修复循环，最多3次）',
        '报告完成',
      ]);

      expect(resolveFlow(['change-verifier']).steps).toEqual([
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行并记录证据→全部通过后标记完成）',
        'spec-reviewer 审查规格合规性（失败→修复→重审）',
        'code-quality-reviewer 审查代码质量（失败→修复→重审）',
        '报告完成',
      ]);

      expect(
        resolveFlow(['spec-reviewer', 'code-quality-reviewer', 'change-verifier']).steps
      ).toEqual([
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行并记录证据→全部通过后标记完成）',
        '报告完成',
      ]);
    });
  });
});

// Helper: convert a variant key back into the skipReviewers list that produces it.
function keyToSkip(key: string): string[] {
  const skip: string[] = [];
  if (!key.includes('S')) skip.push('spec-reviewer');
  if (!key.includes('C')) skip.push('code-quality-reviewer');
  if (!key.includes('V')) skip.push('change-verifier');
  return skip;
}
