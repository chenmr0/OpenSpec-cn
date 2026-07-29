import { describe, it, expect } from 'vitest';
import {
  resolveSubagentFlow,
  DEFAULT_SUBAGENT_FLOW_DOT,
} from '../../../src/commands/workflow/apply-subagent-flow.js';

describe('apply-subagent-flow', () => {
  describe('resolveSubagentFlow', () => {
    it('returns the built-in default dot when flowDot is undefined', () => {
      const result = resolveSubagentFlow(undefined);
      expect(result.source).toBe('default');
      expect(result.flowDot).toBe(DEFAULT_SUBAGENT_FLOW_DOT);
    });

    it('returns the built-in default dot when flowDot is empty string', () => {
      const result = resolveSubagentFlow('');
      expect(result.source).toBe('default');
      expect(result.flowDot).toBe(DEFAULT_SUBAGENT_FLOW_DOT);
    });

    it('passes user-authored flowDot through verbatim', () => {
      const custom = `digraph process {
  rankdir=TB;
  "dt-code-generator" [shape=box];
}`;
      const result = resolveSubagentFlow(custom);
      expect(result.source).toBe('config');
      expect(result.flowDot).toBe(custom);
    });

    it('default dot is a valid closed digraph with change-verifier', () => {
      expect(DEFAULT_SUBAGENT_FLOW_DOT).toContain('digraph process');
      expect(DEFAULT_SUBAGENT_FLOW_DOT).toContain('change-verifier');
      expect(DEFAULT_SUBAGENT_FLOW_DOT.trim().endsWith('}')).toBe(true);
    });
  });
});