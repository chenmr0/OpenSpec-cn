import { describe, it, expect } from 'vitest';
import {
  getSkillTemplates,
  getCommandTemplates,
  getCommandContents,
  generateSkillContent,
  getExternalAgentTemplates,
  OPENCODE_SUBAGENT_FILES,
  OPENCODE_AGENT_PERMISSIONS,
  injectFrontmatterMode,
  injectFrontmatterPermission,
} from '../../../src/core/shared/skill-generation.js';

describe('skill-generation', () => {
  describe('getSkillTemplates', () => {
    it('should return all 12 skill templates', () => {
      const templates = getSkillTemplates();
      expect(templates).toHaveLength(12);
    });

    it('should have unique directory names', () => {
      const templates = getSkillTemplates();
      const dirNames = templates.map(t => t.dirName);
      const uniqueDirNames = new Set(dirNames);
      expect(uniqueDirNames.size).toBe(templates.length);
    });

    it('should include all expected skills', () => {
      const templates = getSkillTemplates();
      const dirNames = templates.map(t => t.dirName);

  expect(dirNames).toContain('codespec-explore');
      expect(dirNames).toContain('codespec-new-change');
      expect(dirNames).toContain('codespec-continue-change');
      expect(dirNames).toContain('codespec-apply-change');
      expect(dirNames).toContain('codespec-design');
      expect(dirNames).toContain('codespec-ff-change');
      expect(dirNames).toContain('codespec-sync-specs');
      expect(dirNames).toContain('codespec-archive-change');
      expect(dirNames).toContain('codespec-bulk-archive-change');
      expect(dirNames).toContain('codespec-verify-change');
      expect(dirNames).toContain('codespec-onboard');
      expect(dirNames).toContain('codespec-propose');
    });

    it('should have valid template structure', () => {
      const templates = getSkillTemplates();

      for (const { template, dirName, workflowId } of templates) {
        expect(template.name).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(template.instructions).toBeTruthy();
        expect(dirName).toBeTruthy();
        expect(workflowId).toBeTruthy();
      }
    });

    it('should have unique workflow IDs', () => {
      const templates = getSkillTemplates();
      const ids = templates.map(t => t.workflowId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(templates.length);
    });

    it('should filter by workflow IDs when provided', () => {
      const filtered = getSkillTemplates(['propose', 'explore', 'apply', 'archive']);
      expect(filtered).toHaveLength(4);
      const ids = filtered.map(t => t.workflowId);
      expect(ids).toContain('propose');
      expect(ids).toContain('explore');
      expect(ids).toContain('apply');
      expect(ids).toContain('archive');
      expect(ids).not.toContain('new');
      expect(ids).not.toContain('ff');
    });

    it('should return all templates when filter is undefined', () => {
      const all = getSkillTemplates();
      const noFilter = getSkillTemplates(undefined);
      expect(noFilter).toHaveLength(all.length);
    });

    it('should return empty array when filter matches nothing', () => {
      const filtered = getSkillTemplates(['nonexistent']);
      expect(filtered).toHaveLength(0);
    });

    it('should return single template when filter has one workflow', () => {
      const filtered = getSkillTemplates(['propose']);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].workflowId).toBe('propose');
      expect(filtered[0].dirName).toBe('codespec-propose');
    });
  });

  describe('getCommandTemplates', () => {
    it('should return all 12 command templates', () => {
      const templates = getCommandTemplates();
      expect(templates).toHaveLength(12);
    });

    it('should have unique IDs', () => {
      const templates = getCommandTemplates();
      const ids = templates.map(t => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(templates.length);
    });

    it('should include all expected commands', () => {
      const templates = getCommandTemplates();
      const ids = templates.map(t => t.id);

      expect(ids).toContain('explore');
      expect(ids).toContain('new');
      expect(ids).toContain('continue');
      expect(ids).toContain('apply');
      expect(ids).toContain('design');
      expect(ids).toContain('ff');
      expect(ids).toContain('sync');
      expect(ids).toContain('archive');
      expect(ids).toContain('bulk-archive');
      expect(ids).toContain('verify');
      expect(ids).toContain('onboard');
      expect(ids).toContain('propose');
    });

    it('should filter by workflow IDs when provided', () => {
      const filtered = getCommandTemplates(['propose', 'explore', 'apply', 'archive']);
      expect(filtered).toHaveLength(4);
      const ids = filtered.map(t => t.id);
      expect(ids).toContain('propose');
      expect(ids).toContain('explore');
      expect(ids).toContain('apply');
      expect(ids).toContain('archive');
      expect(ids).not.toContain('new');
      expect(ids).not.toContain('ff');
    });

    it('should return all templates when filter is undefined', () => {
      const all = getCommandTemplates();
      const noFilter = getCommandTemplates(undefined);
      expect(noFilter).toHaveLength(all.length);
    });

    it('should return empty array when filter matches nothing', () => {
      const filtered = getCommandTemplates(['nonexistent']);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('getCommandContents', () => {
    it('should return all 12 command contents', () => {
      const contents = getCommandContents();
      expect(contents).toHaveLength(12);
    });

    it('should have valid content structure', () => {
      const contents = getCommandContents();

      for (const content of contents) {
        expect(content.id).toBeTruthy();
        expect(content.name).toBeTruthy();
        expect(content.description).toBeTruthy();
        expect(content.body).toBeTruthy();
      }
    });

    it('should have matching IDs with command templates', () => {
      const templates = getCommandTemplates();
      const contents = getCommandContents();

      const templateIds = templates.map(t => t.id).sort();
      const contentIds = contents.map(c => c.id).sort();

      expect(contentIds).toEqual(templateIds);
    });

    it('should filter by workflow IDs when provided', () => {
      const filtered = getCommandContents(['propose', 'explore']);
      expect(filtered).toHaveLength(2);
      const ids = filtered.map(c => c.id);
      expect(ids).toContain('propose');
      expect(ids).toContain('explore');
      expect(ids).not.toContain('new');
    });

    it('should return all contents when filter is undefined', () => {
      const all = getCommandContents();
      const noFilter = getCommandContents(undefined);
      expect(noFilter).toHaveLength(all.length);
    });

    it('should propagate agent metadata from templates to contents', () => {
      const contents = getCommandContents();
      const apply = contents.find(c => c.id === 'apply');
      expect(apply).toBeDefined();
      expect(apply?.agent).toBe('code-generator');
      // commands without subagent config should not carry the field
      const explore = contents.find(c => c.id === 'explore');
      expect(explore?.agent).toBeUndefined();
    });
  });

  describe('generateSkillContent', () => {
    it('should generate valid YAML frontmatter', () => {
      const template = {
        name: 'test-skill',
        description: 'Test description',
        instructions: 'Test instructions',
        license: 'MIT',
        compatibility: 'Test compatibility',
        metadata: {
          author: 'test-author',
          version: '2.0',
        },
      };

      const content = generateSkillContent(template, '0.23.0');

      expect(content).toMatch(/^---\n/);
      expect(content).toContain('name: test-skill');
      expect(content).toContain('description: Test description');
      expect(content).toContain('license: MIT');
      expect(content).toContain('compatibility: Test compatibility');
      expect(content).toContain('author: test-author');
      expect(content).toContain('version: "2.0"');
      expect(content).toContain('generatedBy: "0.23.0"');
      expect(content).toContain('Test instructions');
    });

    it('should use default values for optional fields', () => {
      const template = {
        name: 'minimal-skill',
        description: 'Minimal description',
        instructions: 'Minimal instructions',
      };

      const content = generateSkillContent(template, '0.24.0');

      expect(content).toContain('license: MIT');
      expect(content).toContain('compatibility: 需要 codespec CLI。');
      expect(content).toContain('author: codespec');
      expect(content).toContain('version: "1.0"');
      expect(content).toContain('generatedBy: "0.24.0"');
    });

    it('should embed the provided version in generatedBy field', () => {
      const template = {
        name: 'version-test',
        description: 'Test version embedding',
        instructions: 'Instructions',
      };

      const content1 = generateSkillContent(template, '0.23.0');
      expect(content1).toContain('generatedBy: "0.23.0"');

      const content2 = generateSkillContent(template, '1.0.0');
      expect(content2).toContain('generatedBy: "1.0.0"');

      const content3 = generateSkillContent(template, '0.24.0-beta.1');
      expect(content3).toContain('generatedBy: "0.24.0-beta.1"');
    });

    it('should end frontmatter with separator and blank line', () => {
      const template = {
        name: 'test',
        description: 'Test',
        instructions: 'Body content',
      };

      const content = generateSkillContent(template, '0.23.0');

      expect(content).toMatch(/---\n\nBody content\n$/);
    });

    it('should apply transformInstructions callback when provided', () => {
      const template = {
        name: 'transform-test',
        description: 'Test transform callback',
        instructions: 'Use /opsx:new to start and /opsx:apply to implement.',
      };

      const transformer = (text: string) => text.replace(/\/opsx:/g, '/opsx-');
      const content = generateSkillContent(template, '0.23.0', transformer);

      expect(content).toContain('/opsx-new');
      expect(content).toContain('/opsx-apply');
      expect(content).not.toContain('/opsx:new');
      expect(content).not.toContain('/opsx:apply');
    });

    it('should not transform instructions when callback is undefined', () => {
      const template = {
        name: 'no-transform-test',
        description: 'Test without transform',
        instructions: 'Use /opsx:new to start.',
      };

      const content = generateSkillContent(template, '0.23.0', undefined);

      expect(content).toContain('/opsx:new');
    });

    it('should support custom transformInstructions logic', () => {
      const template = {
        name: 'custom-transform',
        description: 'Test custom transform',
        instructions: 'Some PLACEHOLDER text here.',
      };

      const customTransformer = (text: string) => text.replace('PLACEHOLDER', 'REPLACED');
      const content = generateSkillContent(template, '0.23.0', customTransformer);

      expect(content).toContain('Some REPLACED text here.');
      expect(content).not.toContain('PLACEHOLDER');
    });
  });

  describe('getExternalAgentTemplates', () => {
    it('should return all 5 external agent templates', () => {
      const agents = getExternalAgentTemplates();
      expect(agents).toHaveLength(5);
      const filenames = agents.map(a => a.filename);
      expect(filenames).toEqual(expect.arrayContaining([
        'code-generator.md',
        'change-verifier.md',
        'code-quality-reviewer.md',
        'concept-clarify.md',
        'spec-reviewer.md',
      ]));
      // dt-* agents are disabled for init auto-creation
      expect(filenames).not.toContain('dt-code-generator.md');
      expect(filenames).not.toContain('dt-code-quality-reviewer.md');
    });
  });

  describe('OPENCODE_SUBAGENT_FILES', () => {
    it('should contain exactly the 4 pure-subagent files', () => {
      expect(OPENCODE_SUBAGENT_FILES.size).toBe(4);
      expect(OPENCODE_SUBAGENT_FILES.has('change-verifier.md')).toBe(true);
      expect(OPENCODE_SUBAGENT_FILES.has('code-quality-reviewer.md')).toBe(true);
      expect(OPENCODE_SUBAGENT_FILES.has('concept-clarify.md')).toBe(true);
      expect(OPENCODE_SUBAGENT_FILES.has('spec-reviewer.md')).toBe(true);
      // dt-* agents are disabled, must not be in the set
      expect(OPENCODE_SUBAGENT_FILES.has('dt-code-generator.md')).toBe(false);
      expect(OPENCODE_SUBAGENT_FILES.has('dt-code-quality-reviewer.md')).toBe(false);
      // code-generator.md must NOT be in the set (apply runs it in main session, no mode)
      expect(OPENCODE_SUBAGENT_FILES.has('code-generator.md')).toBe(false);
    });
  });

  describe('OPENCODE_AGENT_PERMISSIONS', () => {
    it('should grant todowrite + task to code-generator', () => {
      expect(OPENCODE_AGENT_PERMISSIONS['code-generator.md']).toEqual({
        todowrite: 'allow',
        task: 'allow',
      });
    });
  });

  describe('injectFrontmatterMode', () => {
    it('should insert mode: subagent before the closing frontmatter delimiter', () => {
      const input = `---
name: change-verifier
description: |
  some description here
---

body content`;
      const result = injectFrontmatterMode(input);
      expect(result).toBe(`---
name: change-verifier
description: |
  some description here
mode: subagent
---

body content`);
    });

    it('should be idempotent when mode field already exists', () => {
      const input = `---
name: change-verifier
description: test
mode: primary
---

body`;
      const result = injectFrontmatterMode(input);
      expect(result).toBe(input);
    });

    it('should return content unchanged when no frontmatter exists', () => {
      const input = 'just some markdown without frontmatter';
      const result = injectFrontmatterMode(input);
      expect(result).toBe(input);
    });

    it('should return content unchanged when frontmatter is malformed (no closing delimiter)', () => {
      const input = `---
name: broken
description: no closing delimiter`;
      const result = injectFrontmatterMode(input);
      expect(result).toBe(input);
    });

    it('should inject all real external subagent templates correctly', () => {
      const agents = getExternalAgentTemplates();
      for (const agent of agents) {
        if (!OPENCODE_SUBAGENT_FILES.has(agent.filename)) continue;
        const injected = injectFrontmatterMode(agent.content);
        // must contain mode: subagent in frontmatter
        const frontmatterEnd = injected.indexOf('\n---\n', 4);
        expect(frontmatterEnd).toBeGreaterThan(0);
        const frontmatter = injected.slice(0, frontmatterEnd);
        expect(frontmatter).toMatch(/^mode: subagent$/m);
      }
    });
  });

  describe('injectFrontmatterPermission', () => {
    const permission = { todowrite: 'allow', task: 'allow' };

    it('should insert a permission block before the closing frontmatter delimiter', () => {
      const input = `---
name: code-generator
description: |
  some description here
---

body content`;
      const result = injectFrontmatterPermission(input, permission);
      expect(result).toBe(`---
name: code-generator
description: |
  some description here
permission:
  todowrite: allow
  task: allow
---

body content`);
    });

    it('should be idempotent when a permission field already exists', () => {
      const input = `---
name: code-generator
description: test
permission:
  todowrite: deny
---
body`;
      const result = injectFrontmatterPermission(input, permission);
      expect(result).toBe(input);
    });

    it('should return content unchanged when no frontmatter exists', () => {
      const input = 'just some markdown without frontmatter';
      const result = injectFrontmatterPermission(input, permission);
      expect(result).toBe(input);
    });

    it('should return content unchanged when frontmatter is malformed (no closing delimiter)', () => {
      const input = `---
name: broken
description: no closing delimiter`;
      const result = injectFrontmatterPermission(input, permission);
      expect(result).toBe(input);
    });

    it('should inject permission into the real code-generator template', () => {
      const agents = getExternalAgentTemplates();
      const cg = agents.find(a => a.filename === 'code-generator.md');
      expect(cg).toBeDefined();
      const injected = injectFrontmatterPermission(cg!.content, permission);
      const frontmatterEnd = injected.indexOf('\n---\n', 4);
      expect(frontmatterEnd).toBeGreaterThan(0);
      const frontmatter = injected.slice(0, frontmatterEnd);
      expect(frontmatter).toMatch(/^permission:$/m);
      expect(frontmatter).toMatch(/^  todowrite: allow$/m);
      expect(frontmatter).toMatch(/^  task: allow$/m);
    });
  });
});
