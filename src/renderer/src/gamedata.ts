/** Static game data (resources/game/data/gamedata.json) built by tools/build_gamedata.py. */

export interface GameItem {
  k: number;
  /** display name */
  n: string;
  /** internal string key */
  i: string;
  /** group id (weapon, armor, …) */
  g: string;
  /** tier / grade 0..5 */
  t: number;
  /** max stack */
  s: number;
  /** default inventory key */
  inv: number;
  /** equip type label */
  e?: string;
  /** equip type hash */
  eh?: number;
  /** max enchant level */
  me?: number;
  /** max sharpness */
  ms?: number;
  /** has sockets */
  so?: number;
  dye?: number;
  ic?: number;
  blocked?: number;
}

export interface GameGroup { id: string; label: string; color: string }
export interface EquipSlotDef { slot: number; label: string; types: string[]; hashes: number[] }
export interface NamedKey { n: string; i: string }

export interface GameData {
  items: GameItem[];
  groups: GameGroup[];
  equipSlots: Record<string, EquipSlotDef[]>;
  bags: Record<string, string>;
  characters: Record<string, string>;
  knowledge: Record<string, NamedKey>;
  missions: Record<string, NamedKey>;
  quests: Record<string, NamedKey>;
  skills: Record<string, string>;
  stores: Record<string, string>;
}

export const TIER_LABEL = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export const TIER_COLOR = ['#9a9a9a', '#6fbf6f', '#5aa0e6', '#b07be6', '#e6a23c', '#e64c4c'];

export class GameDb {
  readonly itemsByKey = new Map<number, GameItem>();
  readonly groupsById = new Map<string, GameGroup>();

  constructor(public readonly data: GameData) {
    for (const i of data.items) this.itemsByKey.set(i.k, i);
    for (const g of data.groups) this.groupsById.set(g.id, g);
  }

  item(key: number | bigint | null | undefined): GameItem | undefined {
    return key === null || key === undefined ? undefined : this.itemsByKey.get(Number(key));
  }

  itemName(key: number | bigint | null | undefined): string {
    if (key === null || key === undefined) return 'Empty';
    const it = this.itemsByKey.get(Number(key));
    return it?.n ?? `Item #${key}`;
  }

  iconUrl(key: number | bigint | null | undefined): string | null {
    const it = this.item(key);
    return it?.ic ? `cd://icons/${it.k}.webp` : null;
  }

  groupColor(id: string | undefined): string {
    return this.groupsById.get(id ?? '')?.color ?? '#777';
  }
  groupLabel(id: string | undefined): string {
    return this.groupsById.get(id ?? '')?.label ?? 'Misc';
  }

  bagName(key: number): string {
    return this.data.bags[String(key)] ?? `Bag ${key}`;
  }
  characterName(key: number): string {
    return this.data.characters[String(key)] ?? `Character #${key}`;
  }
  knowledgeName(key: number): string {
    return this.data.knowledge[String(key)]?.n ?? `Knowledge #${key}`;
  }
  missionName(key: number): string {
    return this.data.missions[String(key)]?.n ?? `Mission #${key}`;
  }
  questName(key: number): string {
    return this.data.quests[String(key)]?.n ?? `Quest #${key}`;
  }
  skillName(key: number): string {
    return this.data.skills[String(key)] ?? `Skill #${key}`;
  }
  storeName(key: number): string {
    return this.data.stores[String(key)] ?? `Store #${key}`;
  }
  equipSlots(characterKey: number): EquipSlotDef[] {
    return this.data.equipSlots[String(characterKey)] ?? this.data.equipSlots['1'] ?? [];
  }
}

export async function loadGameData(): Promise<GameDb> {
  const url = await window.api.gameDataUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load game data: ${res.status}`);
  return new GameDb((await res.json()) as GameData);
}

export function fmt(n: number | bigint): string {
  return Number(n).toLocaleString('en-US');
}
