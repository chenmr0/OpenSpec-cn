import { describe, expect, it } from "vitest";

import {
  getOpsxProposeCommandTemplate,
  getOpsxProposeSkillTemplate,
} from "../../../src/core/templates/skill-templates.js";

const PLAN_MARKER = "<!-- command: codespec-propose -->";

describe("propose workflow marker", () => {
  it("includes the plan marker in generated propose skill and command templates", () => {
    expect(getOpsxProposeSkillTemplate().instructions).toContain(PLAN_MARKER);
    expect(getOpsxProposeCommandTemplate().content).toContain(PLAN_MARKER);
  });
});
