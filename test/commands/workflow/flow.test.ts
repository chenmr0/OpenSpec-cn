import { describe, it, expect } from 'vitest';
import { computeFlowKey, resolveFlow, buildFlowPrefix } from '../../../src/commands/workflow/flow.js';

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
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行：编写失败测试并运行确认失败→最小实现→运行确认通过→编译检查→标记完成）',
        'spec-reviewer 审查规格合规性（失败→修复→重审）',
        'code-quality-reviewer 审查代码质量（失败→修复→重审）',
        'change-verifier 变更级验证（失败→修复循环，最多3次）',
        '报告完成',
      ]);

      expect(resolveFlow(['spec-reviewer', 'code-quality-reviewer']).steps).toEqual([
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行：编写失败测试并运行确认失败→最小实现→运行确认通过→编译检查→标记完成）',
        'change-verifier 变更级验证（失败→修复循环，最多3次）',
        '报告完成',
      ]);

      expect(resolveFlow(['change-verifier']).steps).toEqual([
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行：编写失败测试并运行确认失败→最小实现→运行确认通过→编译检查→标记完成）',
        'spec-reviewer 审查规格合规性（失败→修复→重审）',
        'code-quality-reviewer 审查代码质量（失败→修复→重审）',
        '报告完成',
      ]);

      expect(
        resolveFlow(['spec-reviewer', 'code-quality-reviewer', 'change-verifier']).steps
      ).toEqual([
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行：编写失败测试并运行确认失败→最小实现→运行确认通过→编译检查→标记完成）',
        '报告完成',
      ]);
    });

    it('steps list reflects the requested test mode', () => {
      expect(resolveFlow([]).steps[0]).toBe(
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行：编写失败测试并运行确认失败→最小实现→运行确认通过→编译检查→标记完成）'
      );
      expect(resolveFlow([], 'test-after').steps[0]).toBe(
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行：实现功能→编译检查→编写单元测试→运行确认通过→标记完成）'
      );
      expect(resolveFlow([], 'no-test').steps[0]).toBe(
        '逐任务执行（读取完整步骤→按 task.md 编号逐条执行：实现功能→编译检查→标记完成）'
      );
      // non-implement steps are identical across modes
      expect(resolveFlow([], 'test-after').steps.slice(1)).toEqual(resolveFlow([]).steps.slice(1));
      expect(resolveFlow([], 'no-test').steps.slice(1)).toEqual(resolveFlow([]).steps.slice(1));
    });
  });

  describe('buildFlowPrefix', () => {
    it('tdd expands the per-task subgraph into a red-green cycle', () => {
      const dot = buildFlowPrefix('tdd');
      expect(dot).toContain('编写失败的测试（红灯）');
      expect(dot).toContain('运行测试验证失败（确认红灯）');
      expect(dot).toContain('按实现约束完成最小实现（绿灯）');
      expect(dot).toContain('运行测试验证通过（确认绿灯）');
      expect(dot).toContain('编译检查');
      // red before green: failing test before implementation
      expect(dot.indexOf('编写失败的测试（红灯）')).toBeLessThan(dot.indexOf('按实现约束完成最小实现（绿灯）'));
      expect(dot.indexOf('运行测试验证失败（确认红灯）')).toBeLessThan(dot.indexOf('运行测试验证通过（确认绿灯）'));
    });

    it('test-after places tests after implementation, no red-light step', () => {
      const dot = buildFlowPrefix('test-after');
      expect(dot).toContain('实现功能代码');
      expect(dot).toContain('编写单元测试覆盖验收场景');
      expect(dot).toContain('运行测试验证通过');
      expect(dot).not.toContain('编写失败的测试');
      expect(dot).not.toContain('运行测试验证失败');
      expect(dot.indexOf('实现功能代码')).toBeLessThan(dot.indexOf('编写单元测试覆盖验收场景'));
    });

    it('no-test has no test nodes at all', () => {
      const dot = buildFlowPrefix('no-test');
      expect(dot).toContain('实现功能代码');
      expect(dot).toContain('编译检查');
      expect(dot).not.toContain('编写失败的测试');
      expect(dot).not.toContain('运行测试验证失败');
      expect(dot).not.toContain('运行测试验证通过');
      expect(dot).not.toContain('编写单元测试');
    });

    it('every mode shares the entry, branch and terminal nodes', () => {
      for (const mode of ['tdd', 'test-after', 'no-test'] as const) {
        const dot = buildFlowPrefix(mode);
        expect(dot).toContain('读取 spec.md, design.md, task.md；提取任务，创建 TodoWrite');
        expect(dot).toContain('还有剩余任务?');
        expect(dot).toContain('报告完成，验证测试通过');
        expect(dot).toContain('报告暂停——需要人工介入');
        expect(dot).toContain('标记完成（TodoWrite + task.md 复选框）');
        // every prefix ends at the "是" back-edge so suffixes splice in unchanged
        expect(dot.trim().endsWith('[label="是"];')).toBe(true);
      }
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
