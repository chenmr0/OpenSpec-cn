import type { CompressionState } from './types.js';

export interface CompressionStateStore {
  getState: (sessionID: string) => CompressionState;
  getExistingState: (sessionID: string) => CompressionState | undefined;
  cleanup: (sessionID: string) => void;
}

const DEFAULT_KEEP_RECENT_TASKS = 1;

export function createCompressionStateStore(options?: { keepRecentTasks?: number }): CompressionStateStore {
  const keepRecentTasks = options?.keepRecentTasks ?? DEFAULT_KEEP_RECENT_TASKS;
  const sessions = new Map<string, CompressionState>();

  return {
    getState(sessionID: string): CompressionState {
      let state = sessions.get(sessionID);
      if (!state) {
        state = {
          taskBoundaries: new Map(),
          compressionBlocks: new Map(),
          completedOrder: [],
          lastTodoSnapshot: new Map(),
          inProgressStart: new Map(),
          nudgeInjectedForTask: null,
          isApplySession: false,
          keepRecentTasks,
        };
        sessions.set(sessionID, state);
      }
      return state;
    },

    getExistingState(sessionID: string): CompressionState | undefined {
      return sessions.get(sessionID);
    },

    cleanup(sessionID: string): void {
      sessions.delete(sessionID);
    },
  };
}