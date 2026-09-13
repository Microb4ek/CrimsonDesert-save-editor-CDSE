/**
 * Round-trip check: decrypt every slot in the default save folder (or the folders given as
 * arguments), parse the reflect container, serialize it again and verify the bytes are
 * identical; then seal it and open it again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { openSave, sealSave } from '../src/shared/cdcrypto';
import { parseParc, serializeParc } from '../src/shared/parc';
import { summarizeLobby } from '../src/shared/summary';
import { defaultSaveRoots, listSlots } from '../src/main/saves';

const args = process.argv.slice(2);
const files: string[] = [];
if (args.length) {
  for (const a of args) {
    if (fs.statSync(a).isDirectory()) for (const f of fs.readdirSync(a)) if (f.endsWith('.save')) files.push(path.join(a, f));
    else files.push(a);
  }
} else {
  for (const s of listSlots(defaultSaveRoots())) files.push(s.lobbyPath, s.path);
}

let bad = 0;
for (const file of files) {
  const t0 = Date.now();
  const bytes = new Uint8Array(fs.readFileSync(file));
  try {
    const c = openSave(bytes);
    const doc = parseParc(c.blob);
    const again = serializeParc(doc);
    let same = again.length === c.blob.length;
    let at = -1;
    if (same) for (let i = 0; i < again.length; i++) if (again[i] !== c.blob[i]) { same = false; at = i; break; }
    const sealed = sealSave(c, again);
    const reopened = openSave(sealed);
    const ok = same && reopened.hmacOk && reopened.blob.length === c.blob.length;
    if (!ok) bad++;
    const extra = file.endsWith('lobby.save') ? JSON.stringify(summarizeLobby(bytes)) : `${doc.roots.length} roots, ${doc.types.length} types`;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${file}  hmac=${c.hmacOk} blob=${c.blob.length} ${same ? 'identical' : `differs at ${at} (${again.length} vs ${c.blob.length})`} sealed=${sealed.length}B reopen=${reopened.hmacOk} ${Date.now() - t0}ms  ${extra}`);
  } catch (e) {
    bad++;
    console.log(`FAIL ${file}: ${e instanceof Error ? e.stack : e}`);
  }
}
console.log(bad ? `${bad} failures` : 'all good');
process.exit(bad ? 1 : 0);
