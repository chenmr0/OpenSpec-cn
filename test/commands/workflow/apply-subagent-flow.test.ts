import { describe, it, expect } from 'vitest';
import {
  resolveSubagentFlow,
  resolveTestMode,
  DEFAULT_SUBAGENT_FLOW_DOT,
  DEFAULT_SUBAGENT_FLOW_EXAMPLE,
  type FlowOptions,
  type ModeFlowConfig,
} from '../../../src/commands/workflow/apply-subagent-flow.js';

describe('apply-subagent-flow', () => {
  describe('resolveSubagentFlow', () => {
    it('returns built-in defaults when modeConfig is undefined', () => {
      const result = resolveSubagentFlow(undefined);
      expect(result.flowDotSource).toBe('default');
      expect(result.flowDot).toBe(DEFAULT_SUBAGENT_FLOW_DOT);
      expect(result.exampleSource).toBe('default');
      expect(result.example).toBe(DEFAULT_SUBAGENT_FLOW_EXAMPLE);
    });

    it('returns built-in defaults when both fields are empty strings', () => {
      const result = resolveSubagentFlow({ flowDot: '', example: '' });
      expect(result.flowDotSource).toBe('default');
      expect(result.flowDot).toBe(DEFAULT_SUBAGENT_FLOW_DOT);
      expect(result.exampleSource).toBe('default');
      expect(result.example).toBe(DEFAULT_SUBAGENT_FLOW_EXAMPLE);
    });

    it('passes user-authored flowDot through verbatim', () => {
      const custom = `digraph process {
  rankdir=TB;
  "dt-code-generator" [shape=box];
}`;
      const result = resolveSubagentFlow({ flowDot: custom });
      expect(result.flowDotSource).toBe('config');
      expect(result.flowDot).toBe(custom);
      // example still defaults
      expect(result.exampleSource).toBe('default');
      expect(result.example).toBe(DEFAULT_SUBAGENT_FLOW_EXAMPLE);
    });

    it('passes user-authored example through verbatim', () => {
      const customExample = '你：自定义示例工作流\n完成！';
      const result = resolveSubagentFlow({ example: customExample });
      expect(result.exampleSource).toBe('config');
      expect(result.example).toBe(customExample);
      // flowDot still defaults
      expect(result.flowDotSource).toBe('default');
      expect(result.flowDot).toBe(DEFAULT_SUBAGENT_FLOW_DOT);
    });

    it('resolves flowDot and example independently', () => {
      const result = resolveSubagentFlow({
        flowDot: 'digraph g { a -> b; }',
        example: '示例 X',
      });
      expect(result.flowDotSource).toBe('config');
      expect(result.flowDot).toBe('digraph g { a -> b; }');
      expect(result.exampleSource).toBe('config');
      expect(result.example).toBe('示例 X');
    });

    it('non-string fields are ignored (treated as absent)', () => {
      const result = resolveSubagentFlow({
        flowDot: 123 as unknown as string,
        example: undefined,
      });
      // Non-string flowDot falls back to default (config parsing warns earlier;
      // resolveSubagentFlow is defensive against non-strings too).
      expect(result.flowDotSource).toBe('default');
      expect(result.flowDot).toBe(DEFAULT_SUBAGENT_FLOW_DOT);
    });

    it('default dot is a valid closed digraph with change-verifier', () => {
      expect(DEFAULT_SUBAGENT_FLOW_DOT).toContain('digraph process');
      expect(DEFAULT_SUBAGENT_FLOW_DOT).toContain('change-verifier');
      expect(DEFAULT_SUBAGENT_FLOW_DOT.trim().endsWith('}')).toBe(true);
    });

    it('default example is non-empty and references apply-subagent flow', () => {
      expect(DEFAULT_SUBAGENT_FLOW_EXAMPLE.length).toBeGreaterThan(0);
      expect(DEFAULT_SUBAGENT_FLOW_EXAMPLE).toContain('codespec apply-subagent flow');
    });
  });

  describe('resolveTestMode', () => {
    it('defaults to tdd when no flag is given', () => {
      expect(resolveTestMode({})).toBe('tdd');
    });

    it('defaults to tdd when only unrelated options are present', () => {
      expect(resolveTestMode({ change: 'add-dark-mode', json: true })).toBe('tdd');
    });

    it('selects tdd when --tdd is given', () => {
      expect(resolveTestMode({ tdd: true })).toBe('tdd');
    });

    it('selects test-after when --test-after is given', () => {
      expect(resolveTestMode({ testAfter: true })).toBe('test-after');
    });

    it('selects no-test when --no-test is given (test === false)', () => {
      expect(resolveTestMode({ test: false })).toBe('no-test');
    });

    it('treats test === true (flag absent) as no selection', () => {
      // commander sets test=true by default for --no-test; that is "absent".
      expect(resolveTestMode({ test: true })).toBe('tdd');
    });

    it('throws on mutually exclusive flags (tdd + test-after)', () => {
      expect(() => resolveTestMode({ tdd: true, testAfter: true })).toThrow(
        /互斥/
      );
    });

    it('throws on mutually exclusive flags (tdd + no-test)', () => {
      expect(() => resolveTestMode({ tdd: true, test: false })).toThrow(/互斥/);
    });

    it('throws on mutually exclusive flags (test-after + no-test)', () => {
      expect(() => resolveTestMode({ testAfter: true, test: false })).toThrow(
        /互斥/
      );
    });

    it('throws on all three flags', () => {
      expect(() =>
        resolveTestMode({ tdd: true, testAfter: true, test: false })
      ).toThrow(/互斥/);
    });
  });

  describe('ModeFlowConfig type usage', () => {
    // Compile-time check that ModeFlowConfig accepts optional flowDot/example.
    const config: ModeFlowConfig = { flowDot: 'digraph {}', example: 'ex' };
    it('carries both fields', () => {
      expect(config.flowDot).toBe('digraph {}');
      expect(config.example).toBe('ex');
    });
  });
});