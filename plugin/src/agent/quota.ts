// Read-only account RPCs: no thread, prompt, auth-file access or model call.
import type { AccountQuota, QuotaWindow, Spawner } from "../types.ts";
import { JsonRpcPeer } from "./jsonrpc.ts";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : undefined;

function windowOf(value: unknown): QuotaWindow | undefined {
  const w = obj(value);
  if (!w || typeof w.usedPercent !== "number" || !Number.isFinite(w.usedPercent) || w.usedPercent < 0) return;
  return {
    remainingPercent: Math.max(0, 100 - w.usedPercent),
    ...(typeof w.windowDurationMins === "number" && Number.isFinite(w.windowDurationMins) && w.windowDurationMins > 0 ? { minutes: w.windowDurationMins } : {}),
    ...(typeof w.resetsAt === "number" && Number.isFinite(w.resetsAt) && w.resetsAt > 0 ? { resetsAt: w.resetsAt } : {}),
  };
}

export function parseQuota(value: unknown): AccountQuota {
  const r = obj(value);
  // Only display the Codex bucket; another model's bucket is not its quota.
  const bucket = obj(obj(r?.rateLimitsByLimitId)?.codex) ?? obj(r?.rateLimits);
  if (!bucket || (typeof bucket.limitId === "string" && bucket.limitId !== "codex")) throw new Error("Codex quota unavailable");
  const windows = [windowOf(bucket.primary), windowOf(bucket.secondary)].filter((w): w is QuotaWindow => !!w);
  const c = obj(bucket.credits);
  const credits = c?.unlimited === true ? { unlimited: true } : c?.hasCredits === true && (typeof c.balance === "string" || typeof c.balance === "number") ? { balance: String(c.balance) } : undefined;
  if (!windows.length && !credits) throw new Error("Codex quota unavailable");
  return { windows, fetchedAt: Date.now(), ...(typeof bucket.planType === "string" ? { plan: bucket.planType } : {}), ...(credits ? { credits } : {}) };
}

export async function readCodexQuota(spawner: Spawner, command: string, args: string[], env: Record<string, string>, timeoutMs = 15_000): Promise<AccountQuota> {
  const proc = await spawner.spawn(command, [...args, "app-server", "--listen", "stdio://"], { env });
  const peer = new JsonRpcPeer(proc);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = async () => {
    await peer.request("initialize", { clientInfo: { name: "zotero_agent_quota", title: "Zotero Agent", version: "0.17.0.1" } });
    peer.notify("initialized");
    const a = obj(await peer.request("account/read", { refreshToken: false }));
    const account = obj(a?.account);
    if (account?.type !== "chatgpt") throw new Error("ChatGPT quota requires subscription login");
    const quota = parseQuota(await peer.request("account/rateLimits/read"));
    if (typeof account.planType === "string") quota.plan = account.planType;
    return quota;
  };
  try {
    return await Promise.race([read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Quota request timed out")), timeoutMs);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    peer.close();
    await proc.kill();
  }
}
