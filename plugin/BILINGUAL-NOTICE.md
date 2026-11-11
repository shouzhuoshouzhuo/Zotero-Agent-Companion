# Bilingual reading implementation notes

This modification builds on Zotero Agent / zotero-mcp 0.17.0 (AGPL-3.0-or-later for the plugin).

The native SDT reading-mode integration and sibling translation-block approach were informed by Z-Transplit (AGPL-3.0), at commit fe0e39f234da1c16eb97a77be9806755748834f5:

- https://github.com/Liozhang/z-transplit/blob/fe0e39f234da1c16eb97a77be9806755748834f5/src/core/pdf/sdt/sdtBridge.ts
- https://github.com/Liozhang/z-transplit/blob/fe0e39f234da1c16eb97a77be9806755748834f5/src/core/pdf/sdt/lazyQueue.ts
- https://github.com/Liozhang/z-transplit/blob/fe0e39f234da1c16eb97a77be9806755748834f5/src/core/pdf/sdt/interleaveView.ts

The implementation here uses the existing local ACP translator and adds a serial viewport-gated queue and an atomic local JSON cache. No external translation backend or Z-Transplit runtime is installed.

The plugin and this modification are distributed under AGPL-3.0-or-later; see LICENSE. Source for this modified build is included with the release artifacts.
