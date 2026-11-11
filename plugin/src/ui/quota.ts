import type { AccountQuota, BackendId, PanelHost, QuotaWindow } from "../types.ts";
import { t } from "../i18n.ts";
import { env, h, setKids } from "./dom.ts";

function windowLabel(w: QuotaWindow, i: number): string {
  const m = w.minutes;
  if (!m) return t(i === 0 ? "quota.primary" : "quota.secondary");
  if (m % 1440 === 0) return t("quota.days", { n: m / 1440 });
  if (m % 60 === 0) return t("quota.hours", { n: m / 60 });
  return t("quota.minutes", { n: m });
}

/** A small account badge, with reset details on click. Never persists account data in chat history. */
export class QuotaBadge {
  readonly el: HTMLDetailsElement;
  private summary: HTMLElement;
  private body: HTMLElement;
  private data: AccountQuota | undefined;
  private failed = false;
  private busy = false;
  private active = false;
  private disposed = false;
  private generation = 0;
  private lastAttempt = 0;
  private timer: number;
  private host: PanelHost;
  constructor(host: PanelHost) {
    this.host = host;
    this.summary = h("summary.quota__summary");
    this.body = h("div.quota__body");
    this.el = h("details.quota", { hidden: true }, this.summary, this.body) as HTMLDetailsElement;
    this.el.addEventListener("toggle", () => { if (this.el.open) void this.refresh(); });
    this.el.addEventListener("keydown", (e) => { if (e.key === "Escape") { this.el.open = false; this.summary.focus(); } });
    this.timer = env.win.setInterval(() => { if (this.active && !env.doc.hidden) void this.refresh(); }, 120_000);
    this.paint();
  }
  setContext(backend: BackendId, auth: string | undefined): void {
    const active = backend === "codex" && auth === "subscription" && !!this.host.runtime.accountQuota;
    this.el.hidden = !active;
    if (active === this.active) return;
    this.active = active;
    this.generation++;
    this.busy = false;
    this.data = undefined;
    this.failed = false;
    this.lastAttempt = 0;
    this.el.open = false;
    this.paint();
    if (active) void this.refresh(true);
  }
  async refresh(force = false): Promise<void> {
    if (!this.active || this.disposed || this.busy || (!force && Date.now() - this.lastAttempt < 30_000)) return;
    this.busy = true;
    this.lastAttempt = Date.now();
    const generation = this.generation;
    this.paint();
    try {
      const data = await this.host.runtime.accountQuota!();
      if (this.disposed || generation !== this.generation) return;
      this.data = data;
      this.failed = false;
    } catch {
      if (this.disposed || generation !== this.generation) return;
      // An old number is not a current quota after a failed refresh.
      this.failed = true;
    } finally {
      if (!this.disposed && generation === this.generation) { this.busy = false; this.paint(); }
    }
  }
  private paint(): void {
    const data = this.failed ? undefined : this.data;
    const first = data?.windows[0];
    this.summary.textContent = first ? t("quota.remaining", { n: Math.floor(first.remainingPercent) }) : data?.credits?.unlimited ? t("quota.unlimited") : data?.credits?.balance !== undefined ? t("quota.credits", { n: data.credits.balance }) : t(this.busy ? "quota.loading" : "quota.unavailable");
    this.summary.title = t("quota.title");
    this.el.dataset.low = String(!!first && first.remainingPercent <= 10);
    const kids: HTMLElement[] = [h("strong", null, t("quota.title"))];
    if (data) {
      if (data.plan) kids.push(h("div.quota__meta", null, `ChatGPT ${data.plan}`));
      for (const [i, w] of data.windows.entries()) {
        const reset = w.resetsAt ? new Date(w.resetsAt * 1000).toLocaleString() : null;
        kids.push(h("div.quota__window", null,
          h("div.quota__row", null, h("span", null, windowLabel(w, i)), h("strong", null, t("quota.remaining", { n: Math.floor(w.remainingPercent) }))),
          h("progress", { max: 100, value: w.remainingPercent, "aria-label": windowLabel(w, i) }),
          reset ? h("div.quota__meta", null, t("quota.reset", { time: reset })) : null));
      }
      if (data.credits) kids.push(h("div", null, data.credits.unlimited ? t("quota.unlimited") : t("quota.credits", { n: data.credits.balance ?? "—" })));
    } else kids.push(h("p.quota__meta", { role: "status" }, t(this.busy ? "quota.loading" : "quota.error")));
    if (this.data) kids.push(h("div.quota__meta", null, t("quota.updated", { time: new Date(this.data.fetchedAt).toLocaleTimeString() })));
    kids.push(h("button.btn.btn--sm", { type: "button", disabled: this.busy ? true : null, onclick: () => void this.refresh(true) }, t(this.busy ? "quota.loading" : "quota.refresh")));
    setKids(this.body, kids);
  }
  dispose(): void { this.disposed = true; this.generation++; env.win.clearInterval(this.timer); }
}
