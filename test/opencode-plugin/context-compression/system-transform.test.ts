import { describe, it, expect } from 'vitest';
import { createSystemTransformHandler } from '../../../dist/opencode-plugin/context-compression/system-transform.js';
import type { CompressionState } from '../../../dist/opencode-plugin/context-compression/types.js';

function makeState(): CompressionState {
  return {
    taskBoundaries: new Map(),
    compressionBlocks: new Map(),
    completedOrder: [],
    lastTodoSnapshot: new Map(),
    nudgeInjectedForTask: null,
    isApplySession: false,
    keepRecentTasks: 1,
  };
}

describe('createSystemTransformHandler', () => {
  it('does not inject when no blocks and < 2 completed', async () => {
    const state = makeState();
    const store = {
  getState: (sessionID: string) => state,
  getExistingState: (sessionID: string) => state,
  cleanup: (sessionID: string) => {}
};
    const handler = createSystemTransformHandler(store);
    const output = { system: ['existing system prompt'] };
    await handler({ sessionID: 's1' }, output);
    expect(output.system[0]).toBe('existing system prompt');
  });

  it('injects when completedOrder >= 2', async () => {
    const state = makeState();
    state.isApplySession = true;
    state.completedOrder = ['1', '2'];
    const store = {
  getState: (sessionID: string) => state,
  getExistingState: (sessionID: string) => state,
  cleanup: (sessionID: string) => {}
};
    const handler = createSystemTransformHandler(store);
    const output = { system: ['existing'] };
    await handler({ sessionID: 's1' }, output);
    expect(output.system[0]).toContain('CodeSpec');
    expect(output.system[0]).toContain('task-compress');
  });

  it('injects when compressionBlocks exist', async () => {
    const state = makeState();
    state.isApplySession = true;
    state.compressionBlocks.set('1', {
      taskId: '1', summary: 's', modifiedFiles: [], startMessageId: 'm1', endMessageId: 'm2', compressedAt: 1, messageIds: [],
    });
    const store = {
  getState: (sessionID: string) => state,
  getExistingState: (sessionID: string) => state,
  cleanup: (sessionID: string) => {}
};
    const handler = createSystemTransformHandler(store);
    const output = { system: ['existing'] };
    await handler({ sessionID: 's1' }, output);
    expect(output.system[0]).toContain('CodeSpec');
  });

  it('pushes to empty system array', async () => {
    const state = makeState();
    state.isApplySession = true;
    state.completedOrder = ['1', '2'];
    const store = {
  getState: (sessionID: string) => state,
  getExistingState: (sessionID: string) => state,
  cleanup: (sessionID: string) => {}
};
    const handler = createSystemTransformHandler(store);
    const output = { system: [] as string[] };
    await handler({ sessionID: 's1' }, output);
    expect(output.system.length).toBe(1);
    expect(output.system[0]).toContain('CodeSpec');
  });
});