# 支持的工具

CodeSpec 兼容多种 AI 编程助手。运行 `codespec init` 时，CodeSpec 会根据你当前的配置文件/工作流选择和交付方式来配置所选工具。

## 工作原理

对于每个选定的工具，CodeSpec 可以安装：

1. **技能**（如果交付方式包含技能）：`.../skills/codespec-*/SKILL.md`
2. **命令**（如果交付方式包含命令）：工具特定的 `opsx-*` 命令文件

默认情况下，CodeSpec 使用 `core` 配置文件，包含以下工作流：
- `propose`
- `explore`
- `apply`
- `archive`

你可以通过 `codespec config profile` 启用扩展工作流（`new`、`continue`、`ff`、`verify`、`sync`、`bulk-archive`、`onboard`），然后运行 `codespec update`。

## 工具目录参考

| 工具 (ID) | 技能路径模式 | 命令路径模式 |
|-----------|---------------------|----------------------|
| Amazon Q Developer (`amazon-q`) | `.amazonq/skills/codespec-*/SKILL.md` | `.amazonq/prompts/opsx-<id>.md` |
| Antigravity (`antigravity`) | `.agent/skills/codespec-*/SKILL.md` | `.agent/workflows/opsx-<id>.md` |
| Auggie (`auggie`) | `.augment/skills/codespec-*/SKILL.md` | `.augment/commands/opsx-<id>.md` |
| IBM Bob Shell (`bob`) | `.bob/skills/codespec-*/SKILL.md` | `.bob/commands/opsx-<id>.md` |
| Claude Code (`claude`) | `.claude/skills/codespec-*/SKILL.md` | `.claude/commands/opsx/<id>.md` |
| Cline (`cline`) | `.cline/skills/codespec-*/SKILL.md` | `.clinerules/workflows/opsx-<id>.md` |
| CodeBuddy (`codebuddy`) | `.codebuddy/skills/codespec-*/SKILL.md` | `.codebuddy/commands/opsx/<id>.md` |
| Codex (`codex`) | `.codex/skills/codespec-*/SKILL.md` | `$CODEX_HOME/prompts/opsx-<id>.md`\* |
| ForgeCode (`forgecode`) | `.forge/skills/codespec-*/SKILL.md` | 不生成（无命令适配器；使用基于技能的 `/codespec-*` 调用） |
| Continue (`continue`) | `.continue/skills/codespec-*/SKILL.md` | `.continue/prompts/opsx-<id>.prompt` |
| CoStrict (`costrict`) | `.cospec/skills/codespec-*/SKILL.md` | `.cospec/codespec/commands/opsx-<id>.md` |
| Crush (`crush`) | `.crush/skills/codespec-*/SKILL.md` | `.crush/commands/opsx/<id>.md` |
| Cursor (`cursor`) | `.cursor/skills/codespec-*/SKILL.md` | `.cursor/commands/opsx-<id>.md` |
| Factory Droid (`factory`) | `.factory/skills/codespec-*/SKILL.md` | `.factory/commands/opsx-<id>.md` |
| Gemini CLI (`gemini`) | `.gemini/skills/codespec-*/SKILL.md` | `.gemini/commands/opsx/<id>.toml` |
| GitHub Copilot (`github-copilot`) | `.github/skills/codespec-*/SKILL.md` | `.github/prompts/opsx-<id>.prompt.md`\*\* |
| iFlow (`iflow`) | `.iflow/skills/codespec-*/SKILL.md` | `.iflow/commands/opsx-<id>.md` |
| Junie (`junie`) | `.junie/skills/codespec-*/SKILL.md` | `.junie/commands/opsx-<id>.md` |
| Kilo Code (`kilocode`) | `.kilocode/skills/codespec-*/SKILL.md` | `.kilocode/workflows/opsx-<id>.md` |
| Kiro (`kiro`) | `.kiro/skills/codespec-*/SKILL.md` | `.kiro/prompts/opsx-<id>.prompt.md` |
| Lingma (`lingma`) | `.lingma/skills/codespec-*/SKILL.md` | `.lingma/commands/opsx/<id>.md` |
| OpenCode (`opencode`) | `.opencode/skills/codespec-*/SKILL.md` | `.opencode/commands/opsx-<id>.md` |
| Pi (`pi`) | `.pi/skills/codespec-*/SKILL.md` | `.pi/prompts/opsx-<id>.md` |
| Qoder (`qoder`) | `.qoder/skills/codespec-*/SKILL.md` | `.qoder/commands/opsx/<id>.md` |
| Qwen Code (`qwen`) | `.qwen/skills/codespec-*/SKILL.md` | `.qwen/commands/opsx-<id>.toml` |
| RooCode (`roocode`) | `.roo/skills/codespec-*/SKILL.md` | `.roo/commands/opsx-<id>.md` |
| Trae (`trae`) | `.trae/skills/codespec-*/SKILL.md` | 不生成（无命令适配器；使用基于技能的 `/codespec-*` 调用） |
| Windsurf (`windsurf`) | `.windsurf/skills/codespec-*/SKILL.md` | `.windsurf/workflows/opsx-<id>.md` |

\* Codex 命令安装在全局 Codex 主目录（如设置了 `$CODEX_HOME/prompts/`，否则为 `~/.codex/prompts/`），而非项目目录中。

\*\* GitHub Copilot 的提示文件在 IDE 扩展（VS Code、JetBrains、Visual Studio）中被识别为自定义斜杠命令。Copilot CLI 目前不直接使用 `.github/prompts/*.prompt.md` 文件。

## 非交互式设置

用于 CI/CD 或脚本化设置，使用 `--tools`（可选 `--profile`）：

```bash
# 配置特定工具
codespec init --tools claude,cursor

# 配置所有支持的工具
codespec init --tools all

# 跳过工具配置
codespec init --tools none

# 覆盖此次运行的配置文件
codespec init --profile core
```

**可用工具 ID（`--tools`）：** `amazon-q`, `antigravity`, `auggie`, `bob`, `claude`, `cline`, `codex`, `codebuddy`, `continue`, `costrict`, `crush`, `cursor`, `factory`, `forgecode`, `gemini`, `github-copilot`, `iflow`, `junie`, `kilocode`, `kiro`, `lingma`, `opencode`, `pi`, `qoder`, `qwen`, `roocode`, `trae`, `windsurf`

## 依赖工作流的安装

CodeSpec 根据选定的工作流安装工作流产出物：

- **Core 配置文件（默认）：** `propose`、`explore`、`apply`、`archive`
- **自定义选择：** 所有工作流 ID 的任意子集：
  `propose`、`explore`、`new`、`continue`、`apply`、`ff`、`sync`、`archive`、`bulk-archive`、`verify`、`onboard`

换句话说，技能/命令的数量取决于配置文件和交付方式，不是固定的。

## 生成的技能名称

当通过配置文件/工作流配置选中时，CodeSpec 会生成以下技能：

- `codespec-propose`
- `codespec-explore`
- `codespec-new-change`
- `codespec-continue-change`
- `codespec-apply-change`
- `codespec-ff-change`
- `codespec-sync-specs`
- `codespec-archive-change`
- `codespec-bulk-archive-change`
- `codespec-verify-change`
- `codespec-onboard`

参阅 [命令](commands.md) 了解命令行为，参阅 [CLI](cli.md) 了解 `init`/`update` 选项。

## 相关文档

- [CLI 参考手册](cli.md) — 终端命令
- [命令](commands.md) — 斜杠命令和技能
- [入门指南](getting-started.md) — 首次设置指南
