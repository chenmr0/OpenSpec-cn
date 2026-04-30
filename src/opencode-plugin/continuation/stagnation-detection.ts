/**
 * Stagnation detection for the codespec continuation enforcer.
 * Determines when the agent is no longer making progress and should stop injecting.
 */

import { HOOK_NAME, MAX_STAGNATION_COUNT } from "./constants.js";
import type { ContinuationProgressUpdate } from "./types.js";

export function shouldStopForStagnation(args: {
  sessionID: string;
  incompleteCount: number;
  progressUpdate: ContinuationProgressUpdate;
}): boolean {
  const { sessionID, incompleteCount, progressUpdate } = args;

  if (progressUpdate.stagnationCount < MAX_STAGNATION_COUNT) {
    return false;
  }

  return true;
}
