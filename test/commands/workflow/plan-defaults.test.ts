import { describe, it, expect } from 'vitest';
import { resolvePlanDefaults } from '../../../src/commands/workflow/plan-defaults.js';
import type { ProjectConfig } from '../../../src/core/project-config.js';

describe('plan-defaults', () => {
  describe('resolvePlanDefaults', () => {
    it('returns both null when config is null', () => {
      expect(resolvePlanDefaults(null)).toEqual({
        testStrategy: null,
        executionMode: null,
      });
    });

    it('returns both null when config has no plan section', () => {
      const config = { schema: 'spec-driven' } as ProjectConfig;
      expect(resolvePlanDefaults(config)).toEqual({
        testStrategy: null,
        executionMode: null,
      });
    });

    it('returns testStrategy when only testStrategy is configured', () => {
      const config = {
        schema: 'spec-driven',
        plan: { testStrategy: 'test-after' },
      } as ProjectConfig;
      expect(resolvePlanDefaults(config)).toEqual({
        testStrategy: 'test-after',
        executionMode: null,
      });
    });

    it('returns executionMode when only executionMode is configured', () => {
      const config = {
        schema: 'spec-driven',
        plan: { executionMode: 'main' },
      } as ProjectConfig;
      expect(resolvePlanDefaults(config)).toEqual({
        testStrategy: null,
        executionMode: 'main',
      });
    });

    it('returns both when both are configured', () => {
      const config = {
        schema: 'spec-driven',
        plan: { testStrategy: 'no-test', executionMode: 'subagent' },
      } as ProjectConfig;
      expect(resolvePlanDefaults(config)).toEqual({
        testStrategy: 'no-test',
        executionMode: 'subagent',
      });
    });

    it('handles tdd execution mode (all three test strategies)', () => {
      for (const testStrategy of ['tdd', 'test-after', 'no-test'] as const) {
        const config = {
          schema: 'spec-driven',
          plan: { testStrategy },
        } as ProjectConfig;
        expect(resolvePlanDefaults(config).testStrategy).toBe(testStrategy);
      }
    });
  });
});