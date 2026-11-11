import { prepareWorkspace } from "../agent/index.ts";
import type { Spawner } from "../types.ts";
import { findCli } from "./doctor.ts";
import { mergeGuidance, WIKI_SKILL } from "./setup-model.ts";

/** Explicit wizard action only. No shell interpolation, no --force, no library writes. */
export async function configureWorkspace(spawner: Spawner, dir: string): Promise<string> {
  const cli = await findCli(spawner, await spawner.baseEnv());
  if (!cli) throw new Error("Install zotero-cli using the environment checks first.");
  await prepareWorkspace(spawner, dir, { zoteroCli: cli, refresh: false });
  const skill = PathUtils.join(dir, ".agents", "skills", "zotero-cli", "SKILL.md");
  if (!(await IOUtils.exists(skill))) throw new Error("zotero-cli skill was not installed; run zotero-mcp install-skill --target agents --root <workspace>.");
  const path = PathUtils.join(dir, "AGENTS.md");
  const old = await IOUtils.exists(path) ? await IOUtils.readUTF8(path) : "";
  const merged = mergeGuidance(old);
  const wiki = PathUtils.join(dir, ".agents", "skills", "zotero-llm-wiki", "SKILL.md");
  let kept = false;
  if (await IOUtils.exists(wiki)) kept = (await IOUtils.readUTF8(wiki)) !== WIKI_SKILL;
  else {
    await IOUtils.makeDirectory(PathUtils.parent(wiki)!, { createAncestors: true, ignoreExisting: true });
    await IOUtils.writeUTF8(wiki, WIKI_SKILL, { tmpPath: wiki + ".tmp" });
  }
  if (merged !== old) {
    // A backup for every actual rules update; existing backup never overwritten.
    if (old) await IOUtils.writeUTF8(path + `.before-companion-${Date.now()}.bak`, old);
    await IOUtils.writeUTF8(path, merged, { tmpPath: path + ".companion-tmp" });
  }
  return kept ? "Workspace ready. Existing zotero-llm-wiki skill preserved; review its rules before use." : "Workspace ready: zotero-cli skill + Wiki skill + AGENTS.md guidance installed. No library content was changed.";
}
