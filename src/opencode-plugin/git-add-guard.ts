const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^\s*git\s+add\s+\.\s*$/, name: "git add ." },
  { pattern: /^\s*git\s+add\s+-A\b/, name: "git add -A" },
  { pattern: /^\s*git\s+add\s+--all\b/, name: "git add --all" },
  { pattern: /^\s*git\s+add\s+\*\s*$/, name: "git add *" },
];

const ERROR_MESSAGE = `Blocked: dangerous git add command detected.

Use git add <specific files> instead. Only stage files you have modified or created for the current task.

For example:
  git add src/file1.ts test/file1.test.ts`;

function isDangerousGitAdd(command: string): string | null {
  for (const { pattern } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return command;
  }
  return null;
}

export function createGitAddGuardHandler() {
  return async (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: Record<string, unknown> },
  ): Promise<void> => {
    if (input.tool.toLowerCase() !== "bash") return;

    const command = output.args?.command;
    if (typeof command !== "string") return;

    if (isDangerousGitAdd(command)) {
      throw new Error(ERROR_MESSAGE);
    }
  };
}
