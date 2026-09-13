"""Build resources/game (gamedata.json + item icons) for the Crimson Desert save editor.

Input is a checkout of NattKh/CRIMSON-DESERT-SAVE-EDITOR-AND-GAME-MODS (MPL-2.0), which
ships a lossless dump of the game's iteminfo table, English names and the item icons
extracted from the game's .paz archives:

    python tools/build_gamedata.py <path-to-checkout>
"""
import json
import os
import struct
import sys
from collections import defaultdict

from PIL import Image

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'resources', 'game')
DATA = os.path.join(SRC, 'CrimsonGameMods', 'data')
ICON_SIZE = 128


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# ---------------------------------------------------------------- equip types / slots
equip_hash = {int(k, 16): v for k, v in load(os.path.join(DATA, 'equip_type_hash_map.json'))['hashes'].items()}
# labels for hashes the community map does not name, derived from the items that carry them
equip_hash.update({0x983475f8: 'Bracelet', 0x28485c4e: 'Tool', 0xf85aad42: 'SubWeapon', 0x166fd1cd: 'Extra', 0x12e0eb73: 'Tool', 0x74ee4a67: 'Tool'})

WEAPON_TYPES = {'OneHandSword', 'OneHandAxe', 'OneHandMace', 'OneHandRapier', 'OneHandDagger', 'OneHandBow', 'OneHandMusket',
                'OneHandShotgun', 'OneHandPistol', 'OneHandCannon', 'TwoHandSword', 'TwoHandAxe', 'TwoHandSpear', 'TwoHandHalberd',
                'TwoHandWarHammer', 'TwoHandHammer', 'TwoHandGiantBastard', 'TwoHandCannon', 'Fist', 'Flag'}
SHIELD_TYPES = {'OneHandShield', 'OneHandTowerShield'}
ARMOR_TYPES = {'Helm', 'UpperBody', 'Hand', 'Foot'}
ACCESSORY_TYPES = {'Earring', 'Necklace', 'Ring'}
OUTFIT_TYPES = {'Cloak', 'Crown', 'Mask', 'Lantern', 'Backpack', 'WritingTool', 'FellingAxe', 'FishingRod', 'Bracelet', 'Tool', 'SubWeapon', 'Extra'}
MOUNT_TYPES = {'HorseArmor', 'HorseArmor_Stirrup', 'HorseArmor_Saddle', 'HorseArmor_Helm'}
PET_TYPES = {'PetArmor_Chest', 'PetArmor_Helm'}

# item_type -> group for non-equipment items
TYPE_GROUP = {
    0: 'ammo', 35: 'ammo',
    31: 'gadget', 71: 'gadget',
    19: 'material', 103: 'material', 26: 'material', 2: 'material', 4: 'material', 16: 'material',
    41: 'consumable', 13: 'consumable',
    74: 'gem',
    48: 'recipe',
    45: 'quest', 42: 'quest', 8: 'quest', 36: 'quest', 43: 'quest', 44: 'quest', 46: 'quest', 63: 'quest',
    62: 'trade', 61: 'trade',
    32: 'currency',
    54: 'upgrade',
    102: 'core',
    50: 'weapon',
}
CAT_GROUP = {
    3601: 'material', 3201: 'material', 3701: 'material', 10501: 'material',
    2301: 'consumable', 2701: 'consumable',
    2402: 'ammo', 3001: 'gadget', 4001: 'quest', 12001: 'recipe', 7001: 'trade', 12501: 'quest', 2501: 'gem',
    2803: 'upgrade', 60001: 'currency', 60002: 'currency', 60003: 'currency', 60007: 'currency', 60008: 'currency',
}

GROUPS = [
    ('weapon', 'Weapons', '#d9534f'),
    ('shield', 'Shields', '#c47f3b'),
    ('armor', 'Armor', '#8a9bb0'),
    ('accessory', 'Accessories', '#d4a53c'),
    ('outfit', 'Cloaks & gear', '#9d7bd8'),
    ('mount', 'Mount gear', '#b08968'),
    ('pet', 'Pet gear', '#7cb3a9'),
    ('gem', 'Socket gems', '#5ec2d6'),
    ('consumable', 'Consumables', '#7fbf5a'),
    ('material', 'Materials', '#9aa56b'),
    ('ammo', 'Ammo', '#c9a56a'),
    ('gadget', 'Gadgets', '#e08a4a'),
    ('trade', 'Trade goods', '#c9b27c'),
    ('recipe', 'Recipes', '#b58cc2'),
    ('core', 'Abyss cores', '#6f7fe0'),
    ('upgrade', 'Expansions', '#6cc4a1'),
    ('currency', 'Currency', '#f0c040'),
    ('quest', 'Quest & notes', '#8c8c8c'),
    ('misc', 'Misc', '#777777'),
]


def group_of(equip_label, item_type, category):
    if equip_label:
        if equip_label in WEAPON_TYPES: return 'weapon'
        if equip_label in SHIELD_TYPES: return 'shield'
        if equip_label in ARMOR_TYPES: return 'armor'
        if equip_label in ACCESSORY_TYPES: return 'accessory'
        if equip_label in OUTFIT_TYPES: return 'outfit'
        if equip_label in MOUNT_TYPES: return 'mount'
        if equip_label in PET_TYPES: return 'pet'
        if equip_label.startswith('0x'): return 'weapon'
    if item_type in TYPE_GROUP: return TYPE_GROUP[item_type]
    if category in CAT_GROUP: return CAT_GROUP[category]
    return 'misc'


# ---------------------------------------------------------------- items
names = {i['itemKey']: i for i in load(os.path.join(DATA, 'item_names.json'))['items']}
max_enchant = {int(k): v for k, v in load(os.path.join(DATA, 'max_enchant_map.json')).items()}
icon_dir = os.path.join(SRC, 'icons_local')
icons = {int(os.path.splitext(f)[0]) for f in os.listdir(icon_dir) if f.endswith('.webp')}

items = []
seen = set()
with open(os.path.join(DATA, 'iteminfo_dump', 'items.jsonl'), encoding='utf-8') as fh:
    for line in fh:
        it = json.loads(line)
        key = it['key']
        seen.add(key)
        eq = it.get('equip_type_info') or 0
        eq_label = equip_hash.get(eq, hex(eq)) if eq else None
        nm = names.get(key, {})
        name = nm.get('name') or it['string_key'].replace('_', ' ')
        ench = it.get('enchant_data_list') or []
        me = max_enchant.get(key)
        if me is None:
            me = max(len(ench) - 1, 0) if ench else 0
        sharp = ((it.get('sharpness_data') or {}).get('max_sharpness')) or 0
        sockets = ((it.get('drop_default_data') or {}).get('use_socket')) or 0
        entry = {
            'k': key,
            'n': name,
            'i': it['string_key'],
            'g': group_of(eq_label, it.get('item_type', 0), it.get('category_info', 0)),
            't': it.get('item_tier', 0),
            's': it.get('max_stack_count', 1) or 1,
            'inv': it.get('inventory_info', 2),
        }
        if eq_label: entry['e'] = eq_label
        if eq: entry['eh'] = eq
        if me: entry['me'] = me
        if sharp: entry['ms'] = sharp
        if sockets: entry['so'] = 1
        if it.get('is_dyeable'): entry['dye'] = 1
        if key in icons: entry['ic'] = 1
        if it.get('is_blocked'): entry['blocked'] = 1
        items.append(entry)
# items known only from item_names.json (older/newer game builds)
for key, nm in names.items():
    if key in seen: continue
    entry = {'k': key, 'n': nm['name'], 'i': nm.get('internalName', ''), 'g': 'misc', 't': 0, 's': nm.get('maxStack', 1) or 1, 'inv': 2}
    if key in icons: entry['ic'] = 1
    items.append(entry)
items.sort(key=lambda x: x['k'])
print('items', len(items), 'with icons', sum(1 for i in items if i.get('ic')))

# ---------------------------------------------------------------- equip slots per character
sys.path.insert(0, os.path.join(SRC, 'CrimsonGameMods'))
import equipslotinfo_parser as esp  # noqa: E402

SLOT_LABELS = {0: 'Main hand', 1: 'Off hand', 2: 'Ranged / tool', 3: 'Helm', 4: 'Body', 5: 'Hands', 6: 'Feet', 7: 'Earring I',
               8: 'Earring II', 9: 'Necklace', 10: 'Ring I', 11: 'Ring II', 12: 'Dagger', 13: 'Two-handed', 14: 'Sub weapon',
               15: 'Lantern', 16: 'Cloak', 17: 'Crown', 18: 'Mask', 19: 'Backpack', 20: 'Extra I', 21: 'Extra II'}
vt = os.path.join(SRC, 'vanilla_tables')
equip_slots = {}
for rec in esp.parse_all(open(os.path.join(vt, 'equipslotinfo.pabgh'), 'rb').read(), open(os.path.join(vt, 'equipslotinfo.pabgb'), 'rb').read()):
    equip_slots[rec.key] = [{'slot': e.slot_index, 'label': SLOT_LABELS.get(e.slot_index, f'Slot {e.slot_index}'),
                             'types': [equip_hash.get(h, hex(h)) for h in e.etl_hashes], 'hashes': e.etl_hashes} for e in rec.entries]
print('equip slot records', list(equip_slots))

# ---------------------------------------------------------------- misc name tables
chars = {int(k): v['clean'] for k, v in load(os.path.join(DATA, 'character_names.json')).items()}
knowledge = {k['key']: {'n': k.get('display_name') or k.get('name') or str(k['key']), 'i': k.get('name', '')} for k in load(os.path.join(DATA, 'knowledge_keys_all.json'))}


def clean_display(s):
    # "{StaticInfo:Knowledge:Knowledge_Node_Abyssone_0001#Ethereal Pathway}" -> "Ethereal Pathway"
    if s and s.startswith('{') and '#' in s:
        return s.split('#', 1)[1].rstrip('}')
    return s


missions = {m['key']: {'n': clean_display(m.get('display')) or m['name'], 'i': m['name']} for m in load(os.path.join(DATA, 'mission_names.json'))}
quests = {q['key']: {'n': clean_display(q.get('display')) or q['name'], 'i': q['name']} for q in load(os.path.join(DATA, 'quest_names.json'))}
skills = {int(k): v['skill_name'] for k, v in load(os.path.join(DATA, 'skill_english_names.json')).items()}
stores = {int(k): v for k, v in load(os.path.join(DATA, 'store_names.json')).items()}

BAGS = {1: 'Money & resources', 2: 'Inventory', 3: 'Pearl (account)', 4: 'Pearl (character)', 5: 'Quest items', 6: 'Wagon', 7: 'Pets & vehicles',
        8: 'Camp warehouse', 9: 'Warehouse', 10: 'Bank vault', 11: 'Camp straw', 12: 'Recovery', 13: 'Kuku', 14: 'Hidden', 15: 'Bag 15',
        16: 'Bag 16', 17: 'Bag 17', 18: 'Collection', 19: 'Bag 19', 20: 'Bag 20'}

# Slot capacity per bag: (base, max) from gamedata/inventory.staticinfobody in 0008/1.paz (game 2.02.00).
# The save's _varyExpandSlotCount adds to the base, never past the max. Exceeding the capacity crashes the game on load.
BAG_CAPS = {1: (20, 240), 2: (50, 240), 3: (20, 240), 4: (20, 240), 5: (300, 300), 6: (1, 12), 7: (1, 3), 8: (240, 1000), 9: (240, 240),
            10: (300, 300), 11: (50, 50), 12: (300, 300), 13: (240, 240), 14: (5, 5), 15: (10, 1000), 16: (10, 1000), 17: (10, 1000),
            18: (10, 1000), 19: (10, 1000), 20: (50, 50), 21: (1, 30)}

gamedata = {
    'items': items,
    'bagCaps': {str(k): {'base': b, 'max': mx} for k, (b, mx) in BAG_CAPS.items()},
    'groups': [{'id': g, 'label': l, 'color': c} for g, l, c in GROUPS],
    'equipSlots': equip_slots,
    'bags': BAGS,
    'characters': chars,
    'knowledge': knowledge,
    'missions': missions,
    'quests': quests,
    'skills': skills,
    'stores': stores,
}
os.makedirs(os.path.join(OUT, 'data'), exist_ok=True)
with open(os.path.join(OUT, 'data', 'gamedata.json'), 'w', encoding='utf-8') as f:
    json.dump(gamedata, f, ensure_ascii=False, separators=(',', ':'))
print('gamedata.json', os.path.getsize(os.path.join(OUT, 'data', 'gamedata.json')) // 1024, 'KB')

# ---------------------------------------------------------------- icons
if '--no-icons' not in sys.argv:
    os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)
    n = 0
    for key in sorted(icons):
        dst = os.path.join(OUT, 'icons', f'{key}.webp')
        if os.path.exists(dst): continue
        im = Image.open(os.path.join(icon_dir, f'{key}.webp')).convert('RGBA')
        im = im.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
        im.save(dst, 'WEBP', quality=82, method=4)
        n += 1
    print('icons written', n)
