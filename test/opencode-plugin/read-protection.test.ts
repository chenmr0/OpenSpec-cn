import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createReadProtectionHandler } from "../../src/opencode-plugin/read-protection/index.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "codespec-read-protection-"));
  tempDirs.push(dir);
  return dir;
}

function makeInput(sessionID = "test-session") {
  return { tool: "read", sessionID, callID: "test-call" };
}

function makeOutput(filePath: string, extraArgs: Record<string, unknown> = {}) {
  return { args: { filePath, ...extraArgs } };
}

describe("read-protection", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not block large reads when the session is not protected", async () => {
    const filePath = path.join(makeTempDir(), "large.ts");
    writeFileSync(filePath, "a".repeat(21 * 1024));

    const handler = createReadProtectionHandler({
      isEnabledForSession: () => false,
    });

    await expect(handler(makeInput(), makeOutput(filePath))).resolves.toBeUndefined();
  });

  it("blocks large reads when the session is protected", async () => {
    const filePath = path.join(makeTempDir(), "large.ts");
    writeFileSync(filePath, "a".repeat(21 * 1024));

    const handler = createReadProtectionHandler({
      isEnabledForSession: () => true,
    });

    await expect(handler(makeInput(), makeOutput(filePath))).rejects.toThrow("[Read");
  });

  it("allows bounded reads when the session is protected", async () => {
    const filePath = path.join(makeTempDir(), "large.ts");
    writeFileSync(filePath, "a".repeat(21 * 1024));

    const handler = createReadProtectionHandler({
      isEnabledForSession: () => true,
    });

    await expect(handler(makeInput(), makeOutput(filePath, { offset: 1, limit: 500 }))).resolves.toBeUndefined();
  });
});
