import { describe, expect, it } from "vitest";

import {
  getOpsxDesignCommandTemplate,
  getOpsxDesignSkillTemplate,
  getOpsxProposeCommandTemplate,
  getOpsxProposeSkillTemplate,
} from "../../../src/core/templates/skill-templates.js";

const PLAN_MARKER = "<!-- command: codespec-propose -->";
const DESIGN_MARKER = "<!-- command: codespec-design -->";

describe("propose workflow marker", () => {
  it("includes the plan marker in generated propose skill and command templates", () => {
    expect(getOpsxProposeSkillTemplate().instructions).toContain(PLAN_MARKER);
    expect(getOpsxProposeCommandTemplate().content).toContain(PLAN_MARKER);
  });
});

describe("design workflow marker", () => {
  it("includes the design marker in generated design skill and command templates", () => {
    expect(getOpsxDesignSkillTemplate().instructions).toContain(DESIGN_MARKER);
    expect(getOpsxDesignCommandTemplate().content).toContain(DESIGN_MARKER);
  });
});
