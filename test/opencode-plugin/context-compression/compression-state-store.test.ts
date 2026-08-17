import { describe, it, expect } from 'vitest';
import { createCompressionStateStore } from '../../../src/opencode-plugin/context-compression/compression-state-store.js';

describe('CompressionStateStore', () => {
  it('getState creates new state for unknown session', () => {
    const store = createCompressionStateStore();
    const state = store.getState('session-1');
    expect(state.taskBoundaries.size).toBe(0);
    expect(state.compressionBlocks.size).toBe(0);
    expect(state.completedOrder).toEqual([]);
    expect(state.nudgeInjectedForTask).toBeNull();
    expect(state.applyCommand).toBeNull();
    expect(state.keepRecentTasks).toBe(0);
    expect(state.keepRecentTasksByCommand).toEqual({ apply: 0 });
  });

  it('getState returns same state for same session', () => {
    const store = createCompressionStateStore();
    const state1 = store.getState('session-1');
    state1.completedOrder.push('task-1');
    const state2 = store.getState('session-1');
    expect(state2.completedOrder).toEqual(['task-1']);
  });

  it('getExistingState returns undefined for unknown session', () => {
    const store = createCompressionStateStore();
    expect(store.getExistingState('unknown')).toBeUndefined();
  });

  it('getExistingState returns state for known session', () => {
    const store = createCompressionStateStore();
    store.getState('session-1');
    expect(store.getExistingState('session-1')).toBeDefined();
  });

  it('cleanup removes session state', () => {
    const store = createCompressionStateStore();
    store.getState('session-1').completedOrder.push('task-1');
    store.cleanup('session-1');
    expect(store.getExistingState('session-1')).toBeUndefined();
    const newState = store.getState('session-1');
    expect(newState.completedOrder).toEqual([]);
  });

  it('uses legacy keepRecentTasks for apply only', () => {
    const store = createCompressionStateStore({ keepRecentTasks: 2 });
    const state = store.getState('session-1');
    expect(state.keepRecentTasks).toBe(2);
    expect(state.keepRecentTasksByCommand).toEqual({ apply: 2 });
  });

  it('uses per-command keepRecentTasks when configured', () => {
    const store = createCompressionStateStore({
      apply: { keepRecentTasks: 4 },
    });
    const state = store.getState('session-1');
    expect(state.keepRecentTasks).toBe(4);
    expect(state.keepRecentTasksByCommand).toEqual({ apply: 4 });
  });
});
