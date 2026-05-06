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
});