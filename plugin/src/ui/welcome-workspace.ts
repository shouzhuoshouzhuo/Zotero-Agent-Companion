import type { PanelHost } from "../types.ts";
import { h, setKids, errMessage } from "./dom.ts";

/** Kept separate from health checks: setup writes only after the user's explicit click. */
export function workspaceStep(host: PanelHost, changed: () => void) {
  const zh = /^zh/i.test(host.locale());
  const say = (cn: string, en: string) => zh ? cn : en;
  let busy = false;
  let ready = false;
  const path = h("p.wrow__d", { style: "overflow-wrap:anywhere" }, host.about().workspace);
  const log = h("p.wrow__d", { role: "status", "aria-live": "polite" });
  const model = h("input", { type: "text", value: host.getSettings().translateModel[host.getSettings().backend] || "gpt-6-luna", "aria-label": say("翻译模型 ID", "Translation model ID"), style: "width:100%;box-sizing:border-box;padding:8px;margin:8px 0" }) as HTMLInputElement;
  const choose = h("button.btn.btn--quiet", { type: "button", onclick: async () => {
    try {
      const dir = await host.chooseFolder(host.about().workspace);
      if (!dir) return;
      await host.setSettings({ chatFolder: dir }); ready = false; path.textContent = host.about().workspace; changed();
    } catch (e) { log.textContent = errMessage(e); }
  } }, say("选择目录", "Choose folder")) as HTMLButtonElement;
  const install = h("button.btn.btn--solid", { type: "button", onclick: async () => {
    if (busy || !host.configureWorkspace) return;
    const backend = host.getSettings().backend;
    busy = true; choose.disabled = install.disabled = model.disabled = true;
    log.textContent = say("正在配置工作目录…", "Configuring workspace…");
    try {
      const message = await host.configureWorkspace();
      const s = host.getSettings();
      await host.setSettings({ translateModel: { ...s.translateModel, [backend]: model.value.trim() } });
      ready = true; log.textContent = message; changed();
    } catch (e) { log.textContent = errMessage(e); }
    finally { busy = false; choose.disabled = install.disabled = model.disabled = false; }
  } }, say("配置目录与 Wiki 规则", "Configure workspace & Wiki rules")) as HTMLButtonElement;
  const backend = h("p.wrow__d");
  const el = h("section.wel__sec", { "data-testid": "workspace-setup" },
    h("div.wel__head", null, h("span.wel__n", null, "3"), h("h3.wel__h", null, say("工作目录与知识积累", "Workspace & knowledge"))),
    h("p.wrow__d", null, say("所有新对话共用此目录，包含 Agent 规则和伴读备课缓存。Wiki 默认保存在 Zotero 笔记中。", "New chats share this folder for agent guidance and teaching caches. Wiki content stays in Zotero notes by default.")),
    path, choose,
    h("label", null, say("独立翻译模型（默认 Luna）", "Separate translation model (Luna by default)"), model), backend,
    h("p.wrow__d", null, say("模型必须在所选 Agent 账号中可用；这里不改变主对话模型。配置会保留已有规则和技能，不创建示例文献，也不修改你的文献库。", "The model ID must be available to your selected agent/account. The main chat model is unchanged. Setup preserves existing rules and skills and does not write library content.")),
    install, log,
    h("details", null, h("summary", null, say("配置后如何验收", "Verify your setup")),
      h("p.wrow__d", null, say("① 在设置选择主模型并检查额度。② 打开 PDF，选一段文字测试翻译。③ 点工具栏“伴读”→“开始备课”，完成后逐点教学。④ 新对话让 Agent 检索已有 Wiki。备课会调用你的模型并消耗额度。", "Choose your chat model in Settings and check quota. Test translation on a PDF selection. Open Companion → Prepare lesson, then teach point by point. Start a new chat and ask it to search existing Wiki notes. Preparation uses your model quota."))));
  model.addEventListener("input", () => { ready = false; changed(); });
  return { el, isReady: () => ready, render() { path.textContent = host.about().workspace; setKids(backend, say("当前 Agent：", "Current agent: ") + host.getSettings().backend); } };
}
