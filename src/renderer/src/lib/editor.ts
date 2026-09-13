/** Domain helpers on top of the reflect model: bags, items, equipment, money, characters. */
import { Model, toNumber } from '@shared/cdmodel';
import type { ObjList, ObjNode, Value } from '@shared/parc';
import type { GameDb, GameItem } from '../gamedata';

export const MAX_ENDURANCE = 65535;
export const COPPER_KEY = 1;
export const GOLD_BAR_KEY = 53;
export const GOLD_BAR_VALUE = 50_000;
export const BAG_MONEY = 1;
export const BAG_MAIN = 2;
export const BAG_BANK = 10;
export const CAMP_RESOURCE_KEYS = [11, 12, 13, 14, 15];

// ---------------------------------------------------------------- generic walk
export function* walk(m: Model, className: string, root?: ObjNode): Generator<ObjNode> {
  const want = m.type(className)?.index;
  if (want === undefined) return;
  const stack: ObjNode[] = root ? [root] : m.doc.roots.map((r) => r.obj);
  while (stack.length) {
    const o = stack.pop()!;
    if (o.type === want) yield o;
    for (const s of o.fields) {
      const v = s.value;
      if (!v || typeof v !== 'object' || v instanceof Uint8Array || Array.isArray(v)) continue;
      if ('items' in v) for (const it of (v as ObjList).items) stack.push(it);
      else stack.push(v as ObjNode);
    }
  }
}

// ---------------------------------------------------------------- bags & items
export interface Bag {
  key: number;
  node: ObjNode;
  items: ObjList;
  expand: number;
}

export function bags(m: Model): Bag[] {
  const inv = m.root('InventorySaveData');
  if (!inv) return [];
  return m.list(inv, '_inventorylist').items.map((node) => ({
    key: m.num(node, '_inventoryKey'),
    node,
    items: m.list(node, '_itemList'),
    expand: m.num(node, '_varyExpandSlotCount'),
  }));
}

export function bag(m: Model, key: number): Bag | undefined {
  return bags(m).find((b) => b.key === key);
}

export interface ItemView {
  node: ObjNode;
  key: number;
  no: bigint;
  slot: number;
  count: number;
  enchant: number;
  endurance: number;
  sharpness: number;
  maxSockets: number;
  validSockets: number;
  sockets: Array<{ node: ObjNode; key: number; endurance: number }>;
  locked: boolean;
  newMark: boolean;
  averagePrice: number;
}

export function itemView(m: Model, node: ObjNode): ItemView {
  const sockets = m.has(node, '_socketSaveDataList') ? m.list(node, '_socketSaveDataList').items : [];
  return {
    node,
    key: m.num(node, '_itemKey'),
    no: m.big(node, '_itemNo'),
    slot: m.num(node, '_slotNo'),
    count: m.num(node, '_stackCount'),
    enchant: m.num(node, '_enchantLevel'),
    endurance: m.num(node, '_endurance'),
    sharpness: m.num(node, '_sharpness'),
    maxSockets: m.num(node, '_maxSocketCount'),
    validSockets: m.num(node, '_validSocketCount'),
    sockets: sockets.map((s) => ({ node: s, key: m.num(s, '_itemKey'), endurance: m.num(s, '_currentEndurance') })),
    locked: !!m.num(node, '_isLocked'),
    newMark: !!m.num(node, '_isNewMark'),
    averagePrice: m.num(node, '_averagePrice'),
  };
}

/** Highest item number in use; the game's counter for this lives in lobby.save (_generateNo). */
export function maxItemNo(m: Model): bigint {
  let max = 0n;
  for (const it of walk(m, 'ItemSaveData')) {
    const n = m.big(it, '_itemNo');
    if (n > max && n < 0xffffffffffn) max = n;
  }
  return max;
}

export function nextItemNo(m: Model): bigint {
  return maxItemNo(m) + 1n;
}

function nowCtc(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/** A fresh ItemSaveData. A template (any existing item) keeps the game's usual field pattern. */
export function createItem(m: Model, key: number, count: number, template?: ObjNode | null, db?: GameDb): ObjNode {
  const it = template ? m.clone(template) : m.create('ItemSaveData');
  const info = db?.item(key);
  m.set(it, '_saveVersion', 1);
  m.set(it, '_itemNo', nextItemNo(m));
  m.set(it, '_itemKey', key);
  m.set(it, '_slotNo', 0);
  m.set(it, '_stackCount', BigInt(Math.max(1, count)));
  m.clear(it, '_averagePrice');
  m.set(it, '_enchantLevel', 0);
  m.clear(it, '_useableCtc');
  m.set(it, '_endurance', MAX_ENDURANCE);
  if (info?.ms) m.set(it, '_sharpness', info.ms);
  else m.clear(it, '_sharpness');
  m.clear(it, '_batteryStat');
  m.clear(it, '_maxBatteryStat');
  m.set(it, '_maxSocketCount', 5);
  m.set(it, '_validSocketCount', 0);
  const sockets = m.list(it, '_socketSaveDataList');
  sockets.items = [];
  for (let i = 0; i < 5; i++) sockets.items.push(m.create('ItemSocketSaveData'));
  if (m.has(it, '_itemDyeDataList')) m.list(it, '_itemDyeDataList').items = [];
  if (m.has(it, '_dropResultSubSaveItemList')) m.list(it, '_dropResultSubSaveItemList').items = [];
  m.set(it, '_transferredItemKey', key);
  m.clear(it, '_currentGimmickState');
  m.set(it, '_maxChargeUseableCount', 1);
  m.set(it, '_chargedUseableCount', 0n);
  m.clear(it, '_coolTimePerCharge');
  m.set(it, '_timeWhenPushItem', nowCtc());
  if (m.has(it, '_characterConversionData')) m.clear(it, '_characterConversionData');
  m.set(it, '_isNewMark', 1);
  m.clear(it, '_isLocked');
  return it;
}

export function anyItemTemplate(m: Model, preferBag?: Bag): ObjNode | null {
  if (preferBag?.items.items.length) return preferBag.items.items[0];
  for (const b of bags(m)) if (b.items.items.length) return b.items.items[0];
  for (const it of walk(m, 'ItemSaveData')) return it;
  return null;
}

export function freeSlot(m: Model, b: Bag): number {
  const used = new Set(b.items.items.map((it) => m.num(it, '_slotNo')));
  let s = 0;
  while (used.has(s)) s++;
  return s;
}

export function addItem(m: Model, db: GameDb, bagKey: number, key: number, count: number): ObjNode {
  const b = bag(m, bagKey);
  if (!b) throw new Error(`Bag ${bagKey} does not exist in this save`);
  const it = createItem(m, key, count, anyItemTemplate(m, b), db);
  m.set(it, '_slotNo', freeSlot(m, b));
  b.items.items.push(it);
  return it;
}

export function removeItem(m: Model, b: Bag, node: ObjNode): void {
  m.remove(b.items, node);
}

export function setStack(m: Model, node: ObjNode, count: number): void {
  m.set(node, '_stackCount', BigInt(Math.max(0, Math.trunc(count))));
}

export function setSocket(m: Model, node: ObjNode, index: number, gemKey: number): void {
  const list = m.list(node, '_socketSaveDataList');
  while (list.items.length <= index) list.items.push(m.create('ItemSocketSaveData'));
  const s = list.items[index];
  if (gemKey) {
    m.set(s, '_itemKey', gemKey);
    m.set(s, '_currentEndurance', MAX_ENDURANCE);
  } else {
    m.clear(s, '_itemKey');
    m.clear(s, '_currentEndurance');
  }
  const valid = list.items.filter((x) => m.num(x, '_itemKey')).length;
  m.set(node, '_validSocketCount', Math.max(valid, m.num(node, '_validSocketCount')));
}

// ---------------------------------------------------------------- money
export interface MoneyLine {
  key: number;
  count: number;
  node: ObjNode | null;
}

/** Copper lives as an item in the main bag; camp resources and contributions in bag 1. */
export function moneyLines(m: Model): { copper: MoneyLine; camp: MoneyLine[]; other: MoneyLine[] } {
  const main = bag(m, BAG_MAIN);
  const copperNode = main?.items.items.find((it) => m.num(it, '_itemKey') === COPPER_KEY) ?? null;
  const copper = { key: COPPER_KEY, count: copperNode ? m.num(copperNode, '_stackCount') : 0, node: copperNode };
  const money = bag(m, BAG_MONEY);
  const lines: MoneyLine[] = (money?.items.items ?? []).map((it) => ({ key: m.num(it, '_itemKey'), count: m.num(it, '_stackCount'), node: it }));
  const camp = CAMP_RESOURCE_KEYS.map((k) => lines.find((l) => l.key === k) ?? { key: k, count: 0, node: null });
  const other = lines.filter((l) => !CAMP_RESOURCE_KEYS.includes(l.key));
  return { copper, camp, other };
}

export function setMoney(m: Model, db: GameDb, bagKey: number, key: number, count: number): void {
  const b = bag(m, bagKey);
  if (!b) throw new Error(`Bag ${bagKey} missing`);
  const node = b.items.items.find((it) => m.num(it, '_itemKey') === key);
  if (node) setStack(m, node, count);
  else if (count > 0) addItem(m, db, bagKey, key, count);
}

export interface BankView {
  goldBars: number;
  balance: number;
  history: Array<{ node: ObjNode; time: bigint; percent: number; current: number; prev: number; benefit: boolean }>;
  propensity: number;
  bankNode: ObjNode | null;
}

export function bankView(m: Model): BankView {
  const vault = bag(m, BAG_BANK);
  const goldBars = vault?.items.items.filter((it) => m.num(it, '_itemKey') === GOLD_BAR_KEY).reduce((a, it) => a + m.num(it, '_stackCount'), 0) ?? 0;
  const contents = m.root('InventoryItemContentsSaveData');
  const banks = contents && m.has(contents, '_bankDataList') ? m.list(contents, '_bankDataList').items : [];
  const bankNode = banks[0] ?? null;
  const history = bankNode
    ? m.list(bankNode, '_bankHistoryDataList').items.map((h) => ({
        node: h,
        time: m.big(h, '_updateHistoryTime'),
        percent: m.num(h, '_applyPercent'),
        current: m.num(h, '_currentDefaultMoneyCount'),
        prev: m.num(h, '_prevDefaultMoneyCount'),
        benefit: !!m.num(h, '_isBenefit'),
      }))
    : [];
  return { goldBars, balance: goldBars * GOLD_BAR_VALUE, history, propensity: bankNode ? m.num(bankNode, '_investmentPropensity') : 0, bankNode };
}

/** The vault holds one Gold Bar item per 50,000 copper deposited. */
export function setGoldBars(m: Model, db: GameDb, n: number): void {
  const vault = bag(m, BAG_BANK);
  if (!vault) throw new Error('This save has no bank vault yet - visit a bank in game first');
  const bars = vault.items.items.filter((it) => m.num(it, '_itemKey') === GOLD_BAR_KEY);
  n = Math.max(0, Math.trunc(n));
  while (bars.length > n) {
    const it = bars.pop()!;
    m.remove(vault.items, it);
  }
  while (bars.length < n) bars.push(addItem(m, db, BAG_BANK, GOLD_BAR_KEY, 1));
}

// ---------------------------------------------------------------- character
export interface CharacterView {
  node: ObjNode;
  characterKey: number;
  level: number;
  exp: bigint;
  remainExp: bigint;
  skillPoints: number;
  hp: number;
  mp: number;
}

export function character(m: Model): CharacterView | null {
  const node = m.root('CharacterStatusSaveData');
  if (!node) return null;
  return {
    node,
    characterKey: m.num(node, '_characterKey'),
    level: m.num(node, '_level'),
    exp: m.big(node, '_experience'),
    remainExp: m.big(node, '_remainExperience'),
    skillPoints: m.num(node, '_remainSkillPoint'),
    hp: m.num(node, '_currentHp'),
    mp: m.num(node, '_currentMp'),
  };
}

export interface SubLevelView { node: ObjNode; key: number; level: number; maxLevel: number; exp: bigint }
export function subLevels(m: Model): SubLevelView[] {
  const root = m.root('SubLevelSaveData');
  if (!root) return [];
  return m.list(root, '_list').items.map((n) => ({ node: n, key: m.num(n, '_key'), level: m.num(n, '_level'), maxLevel: m.num(n, '_maxAchievedLevel'), exp: m.big(n, '_experience') }));
}

export interface SkillPointView { node: ObjNode; owner: number; current: number; elapsed: number }
export function skillPoints(m: Model): SkillPointView[] {
  const root = m.root('KnowledgeSaveData');
  if (!root || !m.has(root, '_skillPointSaveDataList')) return [];
  return m.list(root, '_skillPointSaveDataList').items.map((n) => ({ node: n, owner: m.num(n, '_skillPointOwnerType'), current: m.num(n, '_currentSkillPoint'), elapsed: m.num(n, '_elapsedSkillPoint') }));
}

// ---------------------------------------------------------------- equipment
export interface EquipView { node: ObjNode; item: ItemView; slot: number; occupied: number }
export function equipment(m: Model): { root: ObjNode; list: ObjList; slots: EquipView[] } | null {
  const root = m.root('EquipmentSaveData');
  if (!root) return null;
  const list = m.list(root, '_list');
  const slots = list.items
    .map((node) => {
      const item = m.obj(node, '_item');
      return item ? { node, item: itemView(m, item), slot: m.num(item, '_slotNo'), occupied: m.num(node, '_occupiedSlotNo') } : null;
    })
    .filter((x): x is EquipView => !!x);
  return { root, list, slots };
}

export function equipSlotItem(m: Model, slot: number): EquipView | undefined {
  return equipment(m)?.slots.find((e) => e.slot === slot);
}

/** Puts an item in an equip slot (replacing what is there). */
export function equipItem(m: Model, db: GameDb, slot: number, key: number): ObjNode {
  const eq = equipment(m);
  if (!eq) throw new Error('No equipment block');
  const existing = eq.slots.find((e) => e.slot === slot);
  const template = existing?.item.node ?? eq.slots[0]?.item.node ?? anyItemTemplate(m);
  const it = createItem(m, key, 1, template, db);
  m.set(it, '_slotNo', slot);
  m.set(it, '_isNewMark', 0);
  if (existing) m.set(existing.node, '_item', it);
  else {
    const el = eq.list.items[0] ? m.clone(eq.list.items[0]) : m.create('EquipSlotElementSaveData');
    m.set(el, '_item', it);
    m.clear(el, '_occupiedSlotNo');
    eq.list.items.push(el);
  }
  return it;
}

export function unequip(m: Model, slot: number): void {
  const eq = equipment(m);
  if (!eq) return;
  const existing = eq.slots.find((e) => e.slot === slot);
  if (existing) m.remove(eq.list, existing.node);
}

// ---------------------------------------------------------------- mercenaries / companions
export interface MercenaryView {
  node: ObjNode;
  characterKey: number;
  no: bigint;
  name: string;
  level: number;
  exp: bigint;
  hp: number;
  mp: number;
  skillPoints: number;
  dead: boolean;
  main: boolean;
  equip: ObjList | null;
  inventory: ObjList | null;
}

export function mercenaries(m: Model): MercenaryView[] {
  const root = m.root('MercenaryClanSaveData');
  if (!root) return [];
  return m.list(root, '_mercenaryDataList').items.map((n) => {
    const lv = m.obj(n, '_levelData');
    return {
      node: n,
      characterKey: m.num(n, '_characterKey'),
      no: m.big(n, '_mercenaryNo'),
      name: m.str(n, '_mercenaryName'),
      level: lv ? m.num(lv, '_level') : 0,
      exp: lv ? m.big(lv, '_exp') : 0n,
      hp: m.num(n, '_currentHp'),
      mp: m.num(n, '_currentMp'),
      skillPoints: m.num(n, '_remainSkillPoint'),
      dead: !!m.num(n, '_isDead'),
      main: !!m.num(n, '_isMainMercenary'),
      equip: m.has(n, '_equipItemList') ? m.list(n, '_equipItemList') : null,
      inventory: m.has(n, '_inventoryItemList') ? m.list(n, '_inventoryItemList') : null,
    };
  });
}

// ---------------------------------------------------------------- knowledge
export interface KnowledgeView { node: ObjNode; key: number; level: number; learned: bigint; newMark: boolean }
export function knowledge(m: Model): { list: ObjList; items: KnowledgeView[] } | null {
  const root = m.root('KnowledgeSaveData');
  if (!root) return null;
  const list = m.list(root, '_list');
  return { list, items: list.items.map((n) => ({ node: n, key: m.num(n, '_key'), level: m.num(n, '_level'), learned: m.big(n, '_learnedFieldTime'), newMark: !!m.num(n, '_isNewMark') })) };
}

export function addKnowledge(m: Model, key: number, level = 1): ObjNode {
  const k = knowledge(m);
  if (!k) throw new Error('No knowledge block');
  const existing = k.items.find((x) => x.key === key);
  if (existing) {
    m.set(existing.node, '_level', level);
    return existing.node;
  }
  const n = m.create('KnowledgeElementSaveData');
  m.set(n, '_key', key);
  m.set(n, '_level', level);
  m.set(n, '_learnedFieldTime', nowCtc());
  m.set(n, '_isNewMark', 1);
  k.list.items.push(n);
  return n;
}

// ---------------------------------------------------------------- quests
export interface MissionView { node: ObjNode; key: number; state: number; completed: bigint; completeCount: number }
export function missions(m: Model): { list: ObjList; items: MissionView[] } | null {
  const root = m.root('QuestSaveData');
  if (!root) return null;
  const list = m.list(root, '_missionStateList');
  return { list, items: list.items.map((n) => ({ node: n, key: m.num(n, '_key'), state: m.num(n, '_state'), completed: m.big(n, '_completedTime'), completeCount: m.num(n, '_completeCount') })) };
}
export interface QuestView { node: ObjNode; key: number; state: number; completed: bigint }
export function quests(m: Model): { list: ObjList; items: QuestView[] } | null {
  const root = m.root('QuestSaveData');
  if (!root) return null;
  const list = m.list(root, '_questStateList');
  return { list, items: list.items.map((n) => ({ node: n, key: m.num(n, '_questKey'), state: m.num(n, '_state'), completed: m.big(n, '_completedTime') })) };
}

export const QUEST_STATE = ['Unknown', 'Locked', 'Available', 'In progress', 'Ready to complete', 'Completed', 'Reward received'];

// ---------------------------------------------------------------- misc
export function valueToDisplay(v: Value): string {
  if (v === null) return 'null';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) return [...v].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (Array.isArray(v)) return `[${v.map((x) => valueToDisplay(x as Value)).join(', ')}]`;
  if ('items' in v) return `${v.items.length} objects`;
  return 'object';
}

export function asNumber(v: Value): number {
  return toNumber(v);
}

export function itemInfoFor(db: GameDb, it: ItemView): GameItem | undefined {
  return db.item(it.key);
}
