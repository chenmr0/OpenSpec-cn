export const CODESPEC_DIR_NAME = 'codespec';

export const CODESPEC_MARKERS = {
  start: '<!-- CODESPEC:START -->',
  end: '<!-- CODESPEC:END -->'
};

export interface CodeSpecConfig {
  aiTools: string[];
}

export interface AIToolOption {
  name: string;
  value: string;
  available: boolean;
  successLabel?: string;
  skillsDir?: string; // e.g., '.claude' - /skills suffix per Agent Skills spec
  detectionPaths?: string[]; // Override skillsDir for auto-detection; any path existing triggers detection
}

export const AI_TOOLS: AIToolOption[] = [
  { name: 'OpenCode', value: 'opencode', available: true, successLabel: 'OpenCode', skillsDir: '.opencode' },
  { name: 'Claude Code', value: 'claude', available: true, successLabel: 'Claude Code', skillsDir: '.claude' },
];
