#!/usr/bin/env python3
"""Build release XPI, corresponding source and update feed from this source tree."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
subprocess.run(['npm', 'run', 'build'], cwd=root/'plugin', check=True)
addon = json.loads((root/'plugin/addon.json').read_text())
version = addon['version']
repo = addon['homepage']
out = root/'artifacts'
out.mkdir(exist_ok=True)
xpi = out/'zotero-agent.xpi'
shutil.copyfile(root/'plugin/dist/zotero-agent.xpi', xpi)
with zipfile.ZipFile(xpi) as z:
    manifest = json.loads(z.read('manifest.json'))
    assert manifest['version'] == version
    assert b'ZMC_TEST_SCRIPT' not in z.read('plugin.js'), 'Never release test hooks'
sha = hashlib.sha256(xpi.read_bytes()).hexdigest()
feed = {'addons': {addon['id']: {'updates': [{
    'version': version,
    'update_link': f'{repo}/releases/download/v{version}/zotero-agent.xpi',
    'update_hash': 'sha256:'+sha,
    'applications': {'zotero': {'strict_min_version': addon['minZotero']}}
}]}}}
(root/'plugin/updates.json').write_text(json.dumps(feed, indent=2)+'\n')
manifest = {'version':version, 'plugin_id':addon['id'], 'xpi':f'{repo}/releases/download/v{version}/zotero-agent.xpi', 'sha256':sha, 'min_zotero':addon['minZotero'], 'node_recommended':'24+', 'agent_install_guide':repo+'/blob/main/INSTALL_FOR_AGENTS.md', 'wiki_storage':'Zotero notes', 'tested_platform':'macOS / Zotero 10.0.9'}
(out/'install-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
# Explicit source roots; no home/workspace data, dependencies, builds or test profiles.
files = []
for name in ['README.md','INSTALL_FOR_AGENTS.md','NOTICE.md','LICENSE','.gitignore','plugin','docs','scripts','.github']:
    path = root/name
    candidates = [path] if path.is_file() else path.rglob('*')
    for f in candidates:
        rel = f.relative_to(root)
        if any(p in {'node_modules','dist','.git','__pycache__','shots'} or p.startswith('.dev') for p in rel.parts): continue
        if f.is_file() and not f.is_symlink() and f.name != '.DS_Store': files.append(f)
source = out/f'zotero-agent-companion-{version}-source.zip'
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(files): z.write(f, 'Zotero-Agent-Companion/'+str(f.relative_to(root)))
checks = [xpi,source,out/'install-manifest.json']
(out/'SHA256SUMS').write_text(''.join(hashlib.sha256(f.read_bytes()).hexdigest()+'  '+f.name+'\n' for f in checks))
print(f'Release {version}: '+str(out))
