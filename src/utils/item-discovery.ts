import { promises as fs } from 'fs';
import path from 'path';

export async function getActiveChangeIds(root: string = process.cwd()): Promise<string[]> {
  const changesPath = path.join(root, 'codespec', 'changes');
  try {
    const entries = await fs.readdir(changesPath, { withFileTypes: true });
    const result: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'archive') continue;
      const metaPath = path.join(changesPath, entry.name, '.codespec.yaml');
      try {
        await fs.access(metaPath);
        result.push(entry.name);
      } catch {
        // skip directories without .codespec.yaml
      }
    }
    return result.sort();
  } catch {
    return [];
  }
}

export async function getSpecIds(root: string = process.cwd()): Promise<string[]> {
  const specsPath = path.join(root, 'codespec', 'specs');
  const result: string[] = [];
  try {
    const entries = await fs.readdir(specsPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const specFile = path.join(specsPath, entry.name, 'spec.md');
      try {
        await fs.access(specFile);
        result.push(entry.name);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return result.sort();
}

export async function getArchivedChangeIds(root: string = process.cwd()): Promise<string[]> {
  const archivePath = path.join(root, 'codespec', 'changes', 'archive');
  try {
    const entries = await fs.readdir(archivePath, { withFileTypes: true });
    const result: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const metaPath = path.join(archivePath, entry.name, '.codespec.yaml');
      try {
        await fs.access(metaPath);
        result.push(entry.name);
      } catch {
        // skip directories without .codespec.yaml
      }
    }
    return result.sort();
  } catch {
    return [];
  }
}

