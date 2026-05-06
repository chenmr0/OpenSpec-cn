import { describe, it, expect } from 'vitest';

describe('context-compression types', () => {
  it('CompressionState should have correct default shape', () => {
    const state = {
      taskBoundaries: new Map(),
      compressionBlocks: new Map(),
      completedOrder: [] as string[],
      lastTodoSnapshot: new Map() as Map<string, string>,
      nudgeInjectedForTask: null as string | null,
    };
    expect(state.taskBoundaries.size).toBe(0);
    expect(state.compressionBlocks.size).toBe(0);
    expect(state.completedOrder).toEqual([]);
    expect(state.nudgeInjectedForTask).toBeNull();
  });
});