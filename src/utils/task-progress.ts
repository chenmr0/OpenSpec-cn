import { promises as fs, existsSync } from 'fs';
import path from 'path';

const TASK_PATTERN = /^#{1,6}\s+\[[\sx]\]/i;
const COMPLETED_TASK_PATTERN = /^#{1,6}\s+\[x\]/i;

export interface TaskProgress {
  total: number;
  completed: number;
}

export function countTasksFromContent(content: string): TaskProgress {
  const lines = content.split('\n');
  let total = 0;
  let completed = 0;
  for (const line of lines) {
    if (line.match(TASK_PATTERN)) {
      total++;
      if (line.match(COMPLETED_TASK_PATTERN)) {
        completed++;
      }
    }
  }
  return { total, completed };
}

export async function getTaskProgressForChange(changesDir: string, changeName: string, tracksFile: string = 'task.md'): Promise<TaskProgress> {
  let tasksPath = path.join(changesDir, changeName, tracksFile);
  // Backward compatibility: fall back to plan.md if task.md doesn't exist
  if (!existsSync(tasksPath) && tracksFile === 'task.md') {
    const legacyPath = path.join(changesDir, changeName, 'plan.md');
    if (existsSync(legacyPath)) {
      tasksPath = legacyPath;
    }
  }
  try {
    const content = await fs.readFile(tasksPath, 'utf-8');
    return countTasksFromContent(content);
  } catch {
    return { total: 0, completed: 0 };
  }
}

export function formatTaskStatus(progress: TaskProgress): string {
  if (progress.total === 0) return '无任务';
  if (progress.completed === progress.total) return '✓ 完成';
  return `${progress.completed}/${progress.total} 个任务`;
}


