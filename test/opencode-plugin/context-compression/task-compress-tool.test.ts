import { describe, it, expect } from 'vitest';
import { handleTaskCompress } from '../../../dist/opencode-plugin/context-compression/task-compress-tool.js';
import type { CompressionState } from '../../../dist/opencode-plugin/context-compression/types.js';

function makeState(): CompressionState {
  return {
    taskBoundaries: new Map(),
    compressionBlocks: new Map(),
    completedOrder: [],
    lastTodoSnapshot: new Map(),
    nudgeInjectedForTask: null,
    isApplySession: false,
    applyCommand: null,
    keepRecentTasks: 1,
    keepRecentTasksByCommand: { apply: 1, 'apply-quick': 3 },
  };
}

describe('handleTaskCompress', () => {
  it('returns an error when task boundary is not found', () => {
    const state = makeState();
    const result = handleTaskCompress(state, 'unknown', 'summary', []);
    expect(result).toContain('不存在');
    expect(result).toContain('当前可用的任务 ID');
  });

  it('returns an error when task is already compressed', () => {
    const state = makeState();
    state.taskBoundaries.set('1', {
      taskId: '1', description: 'T1', startMessageId: 'm1', endMessageId: 'm2',
      completedAt: 1, compressed: true,
    });
    const result = handleTaskCompress(state, '1', 'summary', []);
    expect(result).toContain('已被压缩');
  });

  it('stores compression block and marks boundary as compressed', () => {
    const state = makeState();
    state.taskBoundaries.set('1', {
      taskId: '1', description: 'T1', startMessageId: 'm1', endMessageId: 'm2',
      completedAt: 1, compressed: false,
    });
    state.nudgeInjectedForTask = '1';

    const result = handleTaskCompress(state, '1', '实现了X功能', ['src/foo.ts']);

    expect(state.taskBoundaries.get('1')!.compressed).toBe(true);
    expect(state.compressionBlocks.get('1')!.summary).toBe('实现了X功能');
    expect(state.compressionBlocks.get('1')!.modifiedFiles).toEqual(['src/foo.ts']);
    expect(state.compressionBlocks.get('1')!.startMessageId).toBe('m1');
    expect(state.compressionBlocks.get('1')!.endMessageId).toBe('m2');
    expect(state.nudgeInjectedForTask).toBeNull();
    expect(result).toContain('已压缩任务 1');
  });
});
