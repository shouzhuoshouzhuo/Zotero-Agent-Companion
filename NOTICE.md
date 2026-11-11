# Attribution and licensing

Zotero Agent Companion is a modified distribution of the Zotero Agent plugin from [54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp), based on its 0.17.0 source. The plugin and these modifications are AGPL-3.0-or-later; see LICENSE and plugin/LICENSE. Original notices are retained.

Modifications: translation sidebar, language normalization, progressive persistent bilingual reading, annotation geometry refresh, Wiki graph documents and drag correction, full-conversation margin companion, quota integration, and portable first-run setup/documentation.

The bilingual implementation was informed by Z-Transplit; see [BILINGUAL-NOTICE.md](plugin/BILINGUAL-NOTICE.md) for the source commit and links. Companion UI references assistant-ui and Vercel AI Elements/shadcn interaction patterns; no runtime code from those UI libraries is bundled. See plugin/COMPANION.md.

Wiki guidance is a project-specific adaptation of the LLM Wiki approach associated with Andrej Karpathy. It is not his official verbatim prompt and does not update automatically.

This repository contains the corresponding modified plugin source and build instructions. It does not claim endorsement by Zotero, OpenAI, the upstream project or the referenced authors. Agent CLIs, ACP bridges, zotero-mcp-server and npm dependencies are separate projects with their own licenses and distribution terms.
