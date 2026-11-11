# Zotero Agent Companion

把完整 Agent 对话、逐段双语阅读、Zotero LLM Wiki 和页边伴读放进 Zotero。

基于 [54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp) 的 Zotero Agent 0.17.0 定制；本仓库提供可安装的 XPI 和对应源码，使用 **AGPL-3.0-or-later**。与上游使用相同插件 ID，会替换上游插件，不能并行安装。

## 安装

1. 在 [Releases](https://github.com/shouzhuoshouzhuo/Zotero-Agent-Companion/releases/latest) 下载 `zotero-agent.xpi`。
2. Zotero → 工具 → 插件 → 齿轮 → 从文件安装插件，然后重启 Zotero。
3. 打开 Zotero Agent 聊天面板，按首次配置向导选择 Agent、检查环境、选择工作目录、配置 Wiki 规则。以后可在聊天面板设置底部重新打开向导。
4. 在设置中选主模型；翻译模型可单独设置，向导建议 `gpt-6-luna`，须在你的账号中可用。主模型不会被向导改动。

**交给另一个 Agent：** 把 [INSTALL_FOR_AGENTS.md](INSTALL_FOR_AGENTS.md) 的链接交给它，并说“照这个说明安装并验收”。说明包含依赖、配置、验收、回滚和失败处理。不要把你的账号文件或个人工作目录发给安装者。

## 包含什么

- 完整 Codex / Claude Code / pi 对话，复用其工具、历史、权限流程与登录；支持的账号可显示真实剩余额度，不可查询时不伪造数值。
- PDF 选段翻译侧栏；原文下方逐段双语，进入视口才翻译，本地持久缓存；颜色区分、收起、重新翻译和批注定位修正。
- Zotero Wiki 连接图、主视图图谱标签页、笔记跳转和有限坐标拖拽修复。
- PDF 工具栏“伴读”：先备课，再逐点高亮、显示页边解释和来源链接；浮动小对话框共享完整 Agent 会话和额度。备课覆盖是模型自报，并非独立理解认证。
- 首次配置向导：选择工作目录、检查本地 API / CLI / Node / Agent / 写入授权；安装 CLI 技能和可迁移的 Wiki 指导规则。保留已有规则和同名 Wiki 技能，修改规则前备份。

## 依赖与兼容性

面向 **Zotero 10+**，在 **macOS + Zotero 10.0.9** 实测。原文下双语和页边定位使用 Zotero 内部阅读器 API，未来 Zotero 更新可能需要适配。Windows / Linux 尚未进行端到端验收；Windows 上请先手工安装 CLI，勿使用向导中面向 Unix 的 CLI 自动安装路径。

需要 Node.js **24+（含 npm）**、已登录的 Agent CLI，以及独立的 `zotero-mcp-server` / `zotero-cli`。XPI 不捆绑这些运行时或任何账号；首次启动 Agent 桥接器会从 npm 安装固定版本，需联网。不会自动下载新论文、自动监控全库或后台批量备课。译文和备课需要模型调用，缓存命中可避免重复请求，重新翻译会重新调用。

Wiki 默认存储在 Zotero 笔记，向导写入的工作目录仅包含技能、规则和伴读缓存。源文献、已有聊天、API 密钥和私人 Wiki 均不在发行包中。

## 开发

```sh
cd plugin
npm ci
npm run typecheck
npm run build
```

得到 `plugin/dist/zotero-agent.xpi`。相关单元测试：

```sh
node --experimental-strip-types --test test/setup-model.test.ts test/companion-model.test.ts test/ui/graph-model.test.ts test/wiki-document.test.ts test/bilingual.test.ts test/bilingual-layout.test.ts test/agent/translate.test.ts test/agent/quota.test.ts
```

macOS 隔离测试（独立资料库 + 模拟 Agent，不访问真实文献）：

```sh
node scripts/dev.mjs --build --script test/zotero/setup.js --mock-agent --xpi --timeout 180
node scripts/dev.mjs --build --script test/zotero/companion.js --mock-agent --xpi --timeout 120
```

隔离测试会启动并关闭它自己创建的 Zotero 进程。不要用真实资料库替代测试目录。发布前再执行 `npm run build`，发行包不包含开发测试入口。

详细说明：[伴读](plugin/COMPANION.md) · [上游及参考项目](NOTICE.md) · [验证范围](docs/VALIDATION.md)。
