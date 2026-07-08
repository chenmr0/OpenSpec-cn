/**
 * Create AR Command
 *
 * Creates an architecture requirement draft file under an existing change.
 */

import ora from 'ora';
import path from 'path';
import * as fs from 'fs';
import { FileSystemUtils } from '../../utils/file-system.js';
import { resolveSchemaForChange } from '../../utils/change-metadata.js';
import { getSchemaDir } from '../../core/artifact-graph/index.js';
import { validateChangeExists, validateSchemaExists, DEFAULT_SCHEMA } from './shared.js';

export interface CreateArOptions {
  change?: string;
  json?: boolean;
}

export interface CreateArResult {
  success: boolean;
  changeName: string;
  filePath: string;
  schemaName: string;
  created: boolean;
}

function resolveArTemplate(schemaName: string, projectRoot: string): string {
  const schemaDir = getSchemaDir(schemaName, projectRoot);
  if (schemaDir) {
    const schemaTemplate = path.join(schemaDir, 'templates', 'ar.md');
    if (fs.existsSync(schemaTemplate)) {
      return fs.readFileSync(schemaTemplate, 'utf-8');
    }
  }

  const defaultSchemaDir = getSchemaDir(DEFAULT_SCHEMA, projectRoot);
  if (!defaultSchemaDir) {
    throw new Error(`未找到默认 Schema '${DEFAULT_SCHEMA}'`);
  }

  const defaultTemplate = path.join(defaultSchemaDir, 'templates', 'ar.md');
  if (!fs.existsSync(defaultTemplate)) {
    throw new Error(`未找到 AR 模板: ${defaultTemplate}`);
  }

  return fs.readFileSync(defaultTemplate, 'utf-8');
}

export async function createArCommand(options: CreateArOptions): Promise<void> {
  const spinner = options.json ? undefined : ora('正在创建 AR 文件...').start();

  try {
    const projectRoot = process.cwd();
    const changeName = await validateChangeExists(options.change, projectRoot);
    const changeDir = path.join(projectRoot, 'codespec', 'changes', changeName);
    const filePath = path.join(changeDir, 'ar.md');
    const schemaName = resolveSchemaForChange(changeDir);
    validateSchemaExists(schemaName, projectRoot);
    const alreadyExists = fs.existsSync(filePath);

    if (!alreadyExists) {
      const template = resolveArTemplate(schemaName, projectRoot);
      await FileSystemUtils.writeFile(filePath, template);
    }

    const result: CreateArResult = {
      success: true,
      changeName,
      filePath: path.resolve(filePath),
      schemaName,
      created: !alreadyExists,
    };

    spinner?.stop();

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.created) {
      console.log(`已创建 AR 文件: ${result.filePath}`);
    } else {
      console.log(`AR 文件已存在: ${result.filePath}`);
    }
  } catch (error) {
    spinner?.stop();
    throw error;
  }
}
