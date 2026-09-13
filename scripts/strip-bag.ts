/**
 * Removes items from one bag beyond a slot number: strip-bag <in.save> <out.save> <bagKey> <maxSlots>
 * Keeps the first <maxSlots> stacks (by slot number) of the bag; everything else in the save is untouched.
 */
import fs from 'node:fs';
import { openSave, sealSave } from '../src/shared/cdcrypto';
import { parseParc, serializeParc } from '../src/shared/parc';
import { Model } from '../src/shared/cdmodel';

const [input, output, bagArg, maxArg] = process.argv.slice(2);
const bagKey = Number(bagArg);
const maxSlots = Number(maxArg);
const c = openSave(new Uint8Array(fs.readFileSync(input)));
const m = new Model(parseParc(c.blob));
const inv = m.root('InventorySaveData')!;
const bag = m.list(inv, '_inventorylist').items.find((b) => m.num(b, '_inventoryKey') === bagKey)!;
const list = m.list(bag, '_itemList');
const before = list.items.length;
list.items = list.items.filter((it) => m.num(it, '_slotNo') < maxSlots);
console.log(`bag ${bagKey}: ${before} -> ${list.items.length} stacks`);
const blob = serializeParc(m.doc);
parseParc(blob);
fs.writeFileSync(output, sealSave(c, blob));
console.log('written', output);
