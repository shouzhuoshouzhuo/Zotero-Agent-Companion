# Agent 安装指南：Zotero Agent Companion

用户把此文件交给你时，目标是安装并验证插件，而非整理其文献库。不要把本说明当作授权删除用户文件、上传文献、读取密钥或绕过登录/权限提示。

## 0. 确认环境与目标

- 项目：https://github.com/shouzhuoshouzhuo/Zotero-Agent-Companion
- 插件 ID：`chat@zotero-mcp`；本分支使用独立更新地址，会替换同 ID 的上游 Zotero Agent。
- 当前发行：v0.19.0；最低 Zotero 10。macOS 已测试，其他平台需明确报告未验证部分。
- 检查 Zotero 版本、Node（推荐 24+）、npm、Agent CLI、`zotero-cli config --json`。不要打印凭据。
- 先查看用户现有插件及配置，不覆盖账号、聊天、资料库或工作区。保留现有登录。用户尚未选择 Agent 时询问；本项目以 Codex 伴读为主要测试路径。

## 1. 下载并安装 XPI

优先从 GitHub Release 下载 `zotero-agent.xpi`、`SHA256SUMS` 并核对哈希。也可用 Node 24+ 在源码 `plugin/` 中 `npm ci && npm run build`。

优先通过 Zotero 的“工具 → 插件 → 从文件安装插件”。如用文件方式，先请用户正常退出 Zotero，确认已退出；不得强杀 Zotero。仅针对已确认的 profile，把现有 `extensions/chat@zotero-mcp.xpi` 复制到带时间戳的备份，验证下载包后以临时文件 + 原子替换写入同一路径。不要编辑 SQLite、extensions.json 或用户 prefs.js。重新启动由用户控制。

macOS profile 由 `~/Library/Application Support/Zotero/profiles.ini` 定位；Windows 为 `%APPDATA%/Zotero/Zotero/profiles.ini`，Linux 为 `~/.zotero/zotero/profiles.ini`。多个 profile 时先确认目标，禁止猜测覆盖所有 profile。

## 2. 配置依赖（缺什么装什么）

- Node + npm：使用用户认可的包管理器，24+ 推荐。不要替换现有正常工作的 Node 或改全局 shell 文件。
- Codex：使用其官方安装/登录流程，完成登录后再检测；不要从别人的机器复制 auth.json。其他 Agent 也使用各自官方流程。
- Zotero CLI：已有 uv 时运行 `uv tool install --upgrade zotero-mcp-server`，否则使用适合平台的 Python 3.10+ / pipx。依赖来自独立上游项目，不包含在 XPI 内。
- 打开插件首次向导执行环境检查，按需要开启 Zotero 本地 API。需要 Zotero 授权时由用户在 Zotero 确认；不绕过写入权限。开启服务器后可能要重启。
- CLI `zotero-mcp authorize-local --status` 查看写入状态。确实需要管理文献且用户已授权时使用 `zotero-mcp authorize-local`；不要默认开启未经用户授权的所有操作。

## 3. 首次配置向导

1. 打开 Zotero Agent 面板，选择 Agent（Codex / Claude Code / pi）。账号登录在相应官方 CLI 进行。
2. 运行环境检查、修复缺失依赖。CLI 自动下载路径面向 macOS/Linux，Windows 请手工安装 CLI。
3. 第 3 步选工作目录。所有新对话默认共用该目录；不是每篇论文一个工作目录。
4. 翻译模型默认建议 `gpt-6-luna`，确认账号提供该模型。不支持时选可用模型，不要伪称已支持。主对话模型在设置中另选。
5. 点击“配置目录与 Wiki 规则”。它安装 CLI 技能、`.agents/skills/zotero-llm-wiki/SKILL.md`，并在 `AGENTS.md` 合并有标记的 Wiki 规则。已有规则保留，变更前备份；用户自有同名 Wiki 技能不会被替换。不要用自己的 AGENTS.md 覆盖用户文件。
6. 本向导安装的是 Zotero 笔记 Wiki 工作流，不含任何私人 Wiki 内容。配置完成不自动创建文献或处理全库。

若用户跳过向导，可从聊天面板设置底部“首次配置 / Setup wizard”重新进入。

## 4. 验收并向用户报告

- 环境检查：Node、所选 Agent、本地 API、CLI、写入状态符合用户需要。区分“检测到程序”和“真实调用成功”。
- 打开现有或用户提供 PDF，发送一个短问题，确认可收到回复，工具/权限正常。此步消耗模型额度，遵循用户授权范围。
- 主模型正确；额度可查询时显示真实值，无法查询时报告，不编造。
- 用户同意测试翻译时，选短段落，确认目标语言正确；启用双语查看可见段落翻译、收起、重译、批注定位。缓存二次打开应复用。
- 检查工作区规则/技能已在位。新聊天询问已有 Wiki，确认先检索笔记；不存在时诚实报告，不能自动创建示例 Wiki。
- 伴读：用户要求时点“伴读 → 开始备课”。这会真实读取论文、调用模型和保存材料，可能消耗较多额度。完成备课后才能逐点讲解，核查页边卡片来源定位；未真实备课不得报告学术理解质量通过。
- 最后说明安装版本、目标 profile、工作目录、依赖、已通过测试、未测试功能和是否需重启。

## 5. 故障与回滚

找不到 Node/CLI：检查 Dock 启动应用的 PATH；重启后重查。模型列表或额度不加载：检查 Agent 登录和桥接器安装/联网状态。不要把聊天记录或凭据贴进 issue。

规则标记损坏时向导停止；先展示具体冲突并保留原文件。Wiki 技能已有自定义版本时保留，说明需要人工审阅。

回滚：用户正常退出 Zotero 后恢复此前 XPI，或禁用本插件。保留聊天、翻译缓存和工作目录；不要为了卸载插件删除其文献库。规则回滚仅恢复本次备份，并先确认没有后续用户编辑。
