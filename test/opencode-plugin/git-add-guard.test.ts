import { describe, it, expect } from "vitest";
import { createGitAddGuardHandler } from "../../src/opencode-plugin/git-add-guard.js";

const executeBefore = createGitAddGuardHandler();

function makeInput(tool: string) {
  return { tool, sessionID: "test-session", callID: "test-call" };
}

function makeOutput(command: string) {
  return { args: { command } };
}

async function run(tool: string, command: string): Promise<"pass" | string> {
  try {
    await executeBefore(makeInput(tool), makeOutput(command));
    return "pass";
  } catch (e) {
    return (e as Error).message;
  }
}

describe("git-add-guard", () => {
  describe("blocks dangerous commands", () => {
    const blocked = [
      "git add .",
      "  git add .",
      "git add  .",
      "git add -A",
      "git add -A src/",
      "git add --all",
      "git add --all src/",
      "git add *",
    ];

    for (const cmd of blocked) {
      it(`blocks: "${cmd}"`, async () => {
        const result = await run("bash", cmd);
        expect(result).not.toBe("pass");
        expect(result).toContain("Blocked");
      });
    }
  });

  describe("allows safe commands", () => {
    const allowed = [
      "git add src/file.ts",
      "git add file1.ts file2.ts",
      "git add src/file1.ts test/file2.ts",
      "git status",
      "git commit -m 'test'",
      "git diff",
      "git log",
      "echo hello",
      "npm test",
    ];

    for (const cmd of allowed) {
      it(`allows: "${cmd}"`, async () => {
        const result = await run("bash", cmd);
        expect(result).toBe("pass");
      });
    }
  });

  it("does not trigger for non-bash tools", async () => {
    const result = await run("read", "git add .");
    expect(result).toBe("pass");
  });

  it("does not trigger when command is not a string", async () => {
    try {
      await executeBefore(makeInput("bash"), { args: {} });
    } catch {
      // should not throw
    }
  });
});
