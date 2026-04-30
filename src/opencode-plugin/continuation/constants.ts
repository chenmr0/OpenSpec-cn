/**
 * Configuration constants for the codespec continuation enforcer.
 * Simplified from oh-my-openagent's todo-continuation-enforcer.
 */

export const HOOK_NAME = "CodeSpec";

export const CONTINUATION_PROMPT = `[CodeSpec]

你的任务列表中仍有未完成的任务。继续处理下一个待处理任务。

- 不要请求许可，直接继续执行
- 每完成一个任务就标记完成
- 所有任务完成前不要停止
- 如果你认为所有工作已经完成，系统正在质疑你的完成声明。
  请以怀疑的视角重新审视每个任务项，验证工作确实已完成，并相应更新任务列表。`;

export const COUNTDOWN_SECONDS = 2;
export const COUNTDOWN_GRACE_PERIOD_MS = 500;

export const ABORT_WINDOW_MS = 3000;
export const CONTINUATION_COOLDOWN_MS = 5_000;
export const MAX_STAGNATION_COUNT = 3;
export const MAX_CONSECUTIVE_FAILURES = 5;
export const FAILURE_RESET_WINDOW_MS = 5 * 60 * 1000;
