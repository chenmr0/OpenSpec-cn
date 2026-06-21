import type { ApplyCommand, CompressionState } from './types.js';

export interface CompressionStateStore {
  getState: (sessionID: string) => CompressionState;
  getExistingState: (sessionID: string) => CompressionState | undefined;
  cleanup: (sessionID: string) => void;
}

export interface CompressionCommandSettings {
  keepRecentTasks?: number;
}

export interface CompressionStateStoreOptions {
  /** Legacy setting used by existing projects; applies to /apply only. */
  keepRecentTasks?: number;
  apply?: CompressionCommandSettings;
}

const DEFAULT_KEEP_RECENT_TASKS_BY_COMMAND: Record<ApplyCommand, number> = {
  apply: 1,
};

function getKeepRecentTasksByCommand(
  options?: CompressionStateStoreOptions,
): Record<ApplyCommand, number> {
  return {
    apply:
      options?.apply?.keepRecentTasks
      ?? options?.keepRecentTasks
      ?? DEFAULT_KEEP_RECENT_TASKS_BY_COMMAND.apply,
  };
}

export function createCompressionStateStore(options?: CompressionStateStoreOptions): CompressionStateStore {
  const keepRecentTasksByCommand = getKeepRecentTasksByCommand(options);
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
          isMainAgentMode: false,
          applyCommand: null,
          keepRecentTasks: keepRecentTasksByCommand.apply,
          keepRecentTasksByCommand: { ...keepRecentTasksByCommand },
          // plan pruning fields
          isPlanSession: false,
          toolCache: new Map(),
          prunedToolCallIds: new Set(),
          messageTurnIndex: 0,
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
