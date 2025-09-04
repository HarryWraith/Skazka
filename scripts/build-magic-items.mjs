// scripts/convert-5ebits-to-magic-items.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const IN  = resolve('data/5e-SRD-Magic-Items.json'); // put the file here
const OUT = resolve('data/magic-items.json');

const normType = (s='') => {
  const t = s.toLowerCase();
  if (t.includes('weapon')) return 'weapon';
  if (t.includes('armor') || t.includes('shield')) return 'armor';
  if (t.includes('ammunition') || t.includes('ammo')) return 'ammo';
  if (t.includes('potion') || t.includes('oil')) return 'potion';
  if (t.includes('ring')) return 'ring';
  if (t.includes('rod')) return 'rod';
  if (t.includes('staff')) return 'staff';
  if (t.includes('wand')) return 'wand';
  if (t.includes('scroll')) return 'scroll';
  return 'wondrous';
};

const quirks = { /* same object as above (omitted for brevity) */ };

const raw = JSON.parse(await readFile(IN, 'utf8'));
const items = raw.map(it => {
  const rarityName = (it.rarity && (it.rarity.name || it.rarity)) || 'Uncommon';
  const category   = (it.equipment_category && (it.equipment_category.name || it.equipment_category)) ||
                     it.gear_category || it.type || '';
  const attuneRaw  = it.requires_attunement;
  const attunement = !!(attuneRaw === true || (typeof attuneRaw === 'string' && attuneRaw.toLowerCase().includes('attune')));
  return {
    name: it.name,
    type: normType(String(category)),
    rarity: String(rarityName).toLowerCase(),
    attunement
  };
});

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify({
  schema: "magic-items.v1",
  license: "Contains SRD 5.1 material © Wizards of the Coast — CC BY 4.0.",
  updated: new Date().toISOString(),
  items,
  quirks
}, null, 2), 'utf8');

console.log(`Wrote ${items.length} items → ${OUT}`);
