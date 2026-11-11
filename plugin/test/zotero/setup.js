// Isolated profile only; no paid model or personal library access.
async function main(ctx) {
 const {Zotero,win,IOUtils,PathUtils}=ctx;
 const check=(v,m)=>{if(!v)throw Error(m);};
 const folder=PathUtils.join(Zotero.Profile.dir,'setup workspace with spaces');
 await IOUtils.remove(folder,{recursive:true,ignoreAbsent:true});
 await IOUtils.makeDirectory(folder,{createAncestors:true});
 const rules=PathUtils.join(folder,'AGENTS.md');
 await IOUtils.writeUTF8(rules,'# Existing user instructions\nPreserve this sentence.\n');
 Zotero.Prefs.set('extensions.zotero-chat.settings',JSON.stringify({backend:'codex',welcomed:false,chatFolder:folder,model:{codex:'keep-main-model'}}),true);
 ctx.plugin.windows.get(win).show();
 const panel=ctx.plugin.panel(win),host=panel.host;
 const root=await ctx.waitFor(()=>win.document.getElementById('zmc-root')?.shadowRoot?.querySelector('[data-testid="workspace-setup"]'),'workspace wizard');
 const workspace=root;
 check(workspace.textContent.includes(folder),'wizard shows selected workspace');
 const before=await Zotero.Items.getAll(Zotero.Libraries.userLibraryID);
 const skill=PathUtils.join(folder,'.agents','skills','zotero-llm-wiki','SKILL.md');
 check(!(await IOUtils.exists(skill)),'no setup writes before explicit click');
 workspace.querySelector('input').value='gpt-6-luna';
 const button=[...workspace.querySelectorAll('button')].find(b=>/Configure workspace|配置目录/.test(b.textContent));
 check(button,'configure button');button.click();
 await ctx.waitFor(()=>workspace.textContent.includes('Workspace ready'), 'setup success',120000);
 const first=await IOUtils.readUTF8(rules);
 check(first.includes('Preserve this sentence.')&&first.includes('wiki guidance'),'rules merged');
 check((await IOUtils.readUTF8(skill)).includes('source-grounded'),'Wiki skill installed');
 check(await IOUtils.exists(PathUtils.join(folder,'.agents','skills','zotero-cli','SKILL.md')),'CLI skill installed');
 check(host.getSettings().model.codex==='keep-main-model','main model preserved');
 check(host.getSettings().translateModel.codex==='gpt-6-luna','translation model saved');
 await host.configureWorkspace();check(await IOUtils.readUTF8(rules)===first,'setup idempotent');
 await IOUtils.writeUTF8(skill,'Custom user Wiki instructions');
 await host.configureWorkspace();check(await IOUtils.readUTF8(skill)==='Custom user Wiki instructions','existing skill preserved');
 check((await Zotero.Items.getAll(Zotero.Libraries.userLibraryID)).length===before.length,'library unchanged');
 await ctx.resize(1150,950);
 workspace.scrollIntoView({block:'start'});
 await ctx.sleep(1000);
 await ctx.snapshot('setup-wizard');
 return {wizard:true,noAutomaticWrites:true,rulesPreserved:true,idempotent:true,skillsInstalled:true,customSkillPreserved:true,mainModelPreserved:true,translationModel:true,libraryUnchanged:true};
}
