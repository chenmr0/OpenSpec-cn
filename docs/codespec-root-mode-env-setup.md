# CODESPEC_ROOT_MODE 环境变量自动配置指导

> 面向：希望"在 AI 工具里一次性配置、拉代码后自动让 `CODESPEC_ROOT_MODE=git` 生效"的协作团队。
> 本文所有结论均已在 Windows 11 + opencode 1.14.51 + CodeAgent（codeagentcli）实测验证通过。

---

## 一、CODESPEC_ROOT_MODE 是什么

`codespec` CLI 用 `resolveCodespecRoot` 解析项目根目录，由环境变量 `CODESPEC_ROOT_MODE` 控制（大小写不敏感）：

| 取值 | 行为 |
|---|---|
| `cwd`（默认，未设置或任意非 `git` 值） | 直接以启动目录作为根目录 |
| `git` | 从启动目录逐级向上查找 `.git`（文件或目录均算，兼容 git worktree 指针），将其所在目录作为根目录；走到文件系统根仍未找到则回退启动目录 |

- 默认 `cwd`：在 `src/components/` 等子目录直接执行，根目录=该子目录。
- 设为 `git`：在子目录执行时根目录=最近的 `.git` 所在仓库根，适合 monorepo 以仓库为根的场景。

**开关只接受环境变量**（无 config.yaml 字段）。要"项目级单次配置 + 拉代码者自动生效"，需把该变量注入到 AI 工具的运行环境。下文给出 opencode 与 CodeAgent 两种工具的实测可用配置。

---

## 二、机制差异（实测结论）

两个工具的扩展加载机制不同，这是配置成败的关键：

| 工具 | 启动期执行点 | 扩展发现方式 | 需要的文件 |
|---|---|---|---|
| opencode | `config` hook（启动时触发一次） | **自动扫描** `.opencode/plugins/*.{ts,js}` | 单文件即可 |
| CodeAgent | 扩展入口函数体（加载时执行一次） | **不自动扫目录**，必须由 `.cac/extensions.json` 声明 | 两个文件（manifest + 扩展） |

> CodeAgent 不会自动扫描 `.cac/extensions/` 目录。光放一个 `.ts` 文件不会被加载——必须在 `.cac/extensions.json` 的 `extensions` 数组里声明条目，启动时 CodeAgent(Bun) 会把 `.ts` 用 `Bun.build` 编译到 `~/.cac/extensions/.compiled/` 再 import 执行。这是最容易踩的坑。

两工具的扩展都额外提供 `shell.env` 钩子，用于把变量注入 **agent 生成的 shell 子进程**——这是 `setx` 写注册表之外、让"当前会话"立即生效的兜底手段。

---

## 三、opencode 配置（单文件，自动扫描）

### 文件：`.opencode/plugins/codespec-env.ts`（随项目提交）

```ts
// codespec-env.ts —— 启动时把 CODESPEC_ROOT_MODE=git 持久化到用户环境
export const CodespecEnvPlugin = async () => {
  const { spawnSync } = await import("child_process");

  // ① 启动期：持久化写入用户环境（仅执行一次）
  if (process.platform === "win32") {
    // Windows：setx 写入用户注册表，对新开的终端/进程生效
    spawnSync("setx", ["CODESPEC_ROOT_MODE", "git"], { encoding: "utf8" });
  } else {
    // Unix：写 ~/.bashrc 持久化（zsh 用户改成 ~/.zshrc）
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const rc = path.join(os.homedir(), ".bashrc");
    const marker = "export CODESPEC_ROOT_MODE=git # codespec-env";
    const has = fs.existsSync(rc) ? fs.readFileSync(rc, "utf8").includes(marker) : false;
    if (!has) fs.appendFileSync(rc, `\n${marker}\n`);
  }

  return {
    // ② 当前会话兜底：setx 不影响已运行进程，这里注入 agent 跑的 shell
    "shell.env": async (_input, output) => {
      output.env.CODESPEC_ROOT_MODE = "git";
    },
  };
};
```

### 实测结果（已通过）

- 在含 `.opencode/plugins/codespec-env.ts` 的目录运行 `opencode run "..."`：
  - `config` hook 执行，`setx` 退出码 0。
  - PowerShell 查询 `[Environment]::GetEnvironmentVariable('CODESPEC_ROOT_MODE','User')` 返回 `git`。
- 自动发现链路：`config/plugin.ts` 的 `Glob.scan("{plugin,plugins}/*.{ts,js}")` → 合并 local scope → 加载注册 → `tool/shell.ts` 的 `shell.env` 注入子进程。

---

## 四、CodeAgent 配置（两个文件，必须声明 manifest）

### 文件 1：`.cac/extensions.json`（声明条目，随项目提交）

```json
{
  "extensions": [
    "./.cac/extensions/codespec-env.ts"
  ]
}
```

> 条目相对路径基准是 **启动目录（projectRoot = `process.cwd()`）**，不是 `.cac` 目录本身，所以要写 `./.cac/extensions/codespec-env.ts`。
> 若该文件已存在其他扩展条目（例如 codespec 官方扩展），在 `extensions` 数组里追加本条目即可，互不影响。
> 路径安全校验 `isAllowedLocalExtensionPath` 要求本地扩展路径必须在 `projectRoot/.cac` 目录内（或显式 `file://` URL），`./.cac/extensions/...` 满足。

### 文件 2：`.cac/extensions/codespec-env.ts`（扩展本体，随项目提交）

```ts
// codespec-env.ts —— CodeAgent 扩展，启动加载时执行一次函数体
export default async function () {
  const { spawnSync } = await import("child_process");

  // ① 启动期：持久化写入（函数体加载时执行一次）
  if (process.platform === "win32") {
    spawnSync("setx", ["CODESPEC_ROOT_MODE", "git"], { encoding: "utf8" });
  } else {
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const rc = path.join(os.homedir(), ".bashrc");
    const marker = "export CODESPEC_ROOT_MODE=git # codespec-env";
    const has = fs.existsSync(rc) ? fs.readFileSync(rc, "utf8").includes(marker) : false;
    if (!has) fs.appendFileSync(rc, `\n${marker}\n`);
  }

  return {
    // ② 当前会话兜底：注入 agent 跑的 shell
    shell: {
      env: async (_input, output) => {
        output.env.CODESPEC_ROOT_MODE = "git";
      },
    },
  };
}
```

### 实测结果（已通过）

- 在 `.cac/extensions.json` 声明条目 + 放置扩展文件后，在该目录运行 `codeagentcli.exe`：
  - 扩展被 `Bun.build` 编译到 `~/.cac/extensions/.compiled/` 后加载执行。
  - 扩展函数体执行，`setx` 退出码 0。
  - PowerShell 查询 User 级环境变量返回 `git`。
- 加载链路：`entrypoints/init.ts` → `loadExtensions(process.cwd())` → `readExtensionsConfig` 读 `.cac/extensions.json` → `resolveExtensionTarget` 解析条目 → `createExtensionFromPath` 用 `Bun.build` 编译并 `import` → 执行默认导出函数。
- **未声明 manifest 时扩展不会被加载**（这是 CodeAgent 与 opencode 的核心差异，已实测确认）。

---

## 五、必读：setx 方案的硬限制

1. **Windows 专用**：`setx` 是 Windows 命令；Unix 上 `export` 非持久化，必须改 `~/.bashrc`/`~/.zshrc`（示例已含跨平台分支）。
2. **只对新进程生效**：`setx` 写注册表，**当前已运行的终端/opencode/CodeAgent 进程拿不到**——所以示例里加了 `shell.env` 兜底，让当前会话里 agent 跑的 `codespec` 也能拿到。你自己手动开终端跑 `codespec` 要生效，需**重开终端**。
3. **用户全局，非项目隔离**：`setx` 写的是当前 Windows 用户的环境变量，**影响该用户所有项目**——别的项目里 `codespec` 也会变成 git 模式。撤销：`setx CODESPEC_ROOT_MODE ""` 或用 PowerShell `[Environment]::SetEnvironmentVariable('CODESPEC_ROOT_MODE', $null, 'User')`。
4. **首次可能弹信任**：opencode 无信任弹窗；CodeAgent 若改用 `.cac/settings.json` 的 `env` 字段会触发 `hasDangerousEnvVars` 白名单弹窗，但走上面的扩展 `shell.env` 可绕开。

> 这意味着：本方案本质是"用户级一次性开启"，不是真正的项目隔离。如果团队里每个人都希望 git 模式，这套 hook 让每人首次启动工具时自动 setx 一次，之后全局生效——这正是"拉代码者自动生效"的落点。若要项目隔离（不同项目不同根模式），应改用 `CODESPEC_ROOT_MODE` 的进程级注入（如 opencode `shell.env` 不带 setx），而非 setx。

---

## 六、单机自用的更简做法

如果你只是自己一台机器要用 git 模式，根本不需要 hook——手动执行一次即可一劳永逸：

```bash
# Windows（PowerShell 或 cmd）
setx CODESPEC_ROOT_MODE git
# 或 PowerShell
[Environment]::SetEnvironmentVariable('CODESPEC_ROOT_MODE','git','User')

# Unix（写入 shell 配置）
echo 'export CODESPEC_ROOT_MODE=git' >> ~/.bashrc
```

之后重开终端，所有 `codespec` 命令均走 git 模式。hook 方案的价值仅在于"让协作团队里每个拉代码的人首次启动 AI 工具时自动执行这一步"。

---

## 七、验证清单

配置落地后，按以下步骤验证：

1. **退出并重启** AI 工具（扩展只在启动时加载一次，不会热重载）。
2. 查注册表（Windows）确认持久化写入：
   ```powershell
   powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('CODESPEC_ROOT_MODE','User')"
   # 应输出 git
   ```
3. 在该工具会话里让 agent 跑一条 shell 命令检查当前会话注入：
   ```bash
   echo $CODESPEC_ROOT_MODE   # Windows: echo %CODESPEC_ROOT_MODE%
   # 应输出 git（由 shell.env 兜底注入）
   ```
4. 在项目子目录跑 `codespec status`，确认根目录解析为 `.git` 所在目录：
   ```bash
   cd src/components && codespec status   # 根目录应为仓库根而非 src/components
   ```

---

## 八、文件清单（随 git 提交以让团队自动生效）

| 工具 | 提交文件 |
|---|---|
| opencode | `.opencode/plugins/codespec-env.ts` |
| CodeAgent | `.cac/extensions.json` + `.cac/extensions/codespec-env.ts` |

两个工具互不冲突，可同时配置。