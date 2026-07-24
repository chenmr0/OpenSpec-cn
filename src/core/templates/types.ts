/**
 * Core template types for skills and slash commands.
 */

export interface SkillTemplate {
  name: string;
  description: string;
  instructions: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
}

export interface CommandTemplate {
  name: string;
  description: string;
  category: string;
  tags: string[];
  content: string;
  /** 执行该命令时切换到的子 agent（仅部分工具支持，如 opencode 的 command frontmatter `agent`） */
  agent?: string;
}
