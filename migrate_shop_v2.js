// @ts-nocheck
/**
 * Usage: node migrate_shop_v2.js input.json output.json
 * - Upgrades to schema "shop.v2"
 * - Adds: id, description, availability, legal_status
 * - Heuristics for: pack_qty, pack_unit, length_ft, volume_gal, service_unit, ammo_type, consumable
 * - Keeps your existing fields (tags, notes, rarity, etc.)
 */

const fs = require("fs");

const [, , inPath, outPath] = process.argv;
if (!inPath) {
  console.error("Usage: node migrate_shop_v2.js input.json output.json");
  process.exit(1);
}

const raw = fs.readFileSync(inPath, "utf8");
const data = JSON.parse(raw);

// ---------- helpers ----------
const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const seen = new Set();
const uniq = (base) => {
  let id = base || "item";
  let n = 2;
  while (seen.has(id)) id = `${base}-${n++}`;
  seen.add(id);
  return id;
};

const catLabelById = Object.fromEntries(
  (data.categories || []).map((c) => [c.id, c.label || c.id])
);

function availabilityFor(price) {
  const p = Number(price);
  if (!isFinite(p)) return "standard";
  if (p <= 1) return "ubiquitous";
  if (p <= 25) return "common";
  if (p <= 100) return "standard";
  if (p <= 1000) return "uncommon";
  if (p <= 10000) return "rare";
  return "very_rare";
}

function legalStatusFor(cat) {
  if (!cat) return "legal";
  if (/black_market/.test(cat)) return "illegal";
  if (/^magic_/.test(cat)) return "regulated";
  return "legal";
}

function guessConsumable(name, category, existing) {
  if (typeof existing === "boolean") return existing;
  if (/magic_consumables_scrolls/.test(category)) return true;
  if (
    /(potion|elixir|bead|scroll|dust|oil|venom|poison|draught|tincture|ampoule|phial|vial|incense|cone|rations?)/i.test(
      name
    )
  )
    return true;
  if (/food_drink_rations/.test(category)) return true;
  return undefined;
}

function ammoType(name) {
  if (/arrows?/i.test(name)) return "arrow";
  if (/crossbow bolts?/i.test(name)) return "bolt";
  if (/sling bullets?/i.test(name)) return "bullet";
  if (/blowgun needles?/i.test(name)) return "needle";
  return undefined;
}

function parseParensFields(name) {
  const m = String(name).match(/\(([^)]+)\)/i);
  if (!m) return {};
  const inside = m[1].toLowerCase();
  const out = {};

  const per = inside.match(/per\s+([a-z /-]+)/i);
  if (per) out.service_unit = per[1].trim();

  const len = inside.match(/(\d+)\s*(?:ft|foot|feet|')/i);
  if (len) out.length_ft = Number(len[1]);

  const vol = inside.match(/(\d+)\s*(?:gal|gallon|gallons)/i);
  if (vol) out.volume_gal = Number(vol[1]);

  const qty =
    inside.match(/bag of\s*(\d+)/i) ||
    inside.match(
      /(\d+)\s*(?:pieces?|bolts?|arrows?|needles?|bullets?|sheets?|days?|lb|lbs|pounds?|feet?|sticks?)/i
    ) ||
    inside.match(/(\d+)/i);
  if (qty) {
    out.pack_qty = Number(qty[1]);
    if (/days?/.test(inside)) out.pack_unit = "day";
    else if (/feet?/.test(inside)) out.pack_unit = "foot";
    else if (/bolts?/.test(inside)) out.pack_unit = "bolt";
    else if (/arrows?/.test(inside)) out.pack_unit = "arrow";
    else if (/needles?/.test(inside)) out.pack_unit = "needle";
    else if (/bullets?/.test(inside)) out.pack_unit = "bullet";
    else if (/sheets?/.test(inside)) out.pack_unit = "sheet";
    else if (/lb|pounds?/.test(inside)) out.pack_unit = "lb";
    else out.pack_unit = "count";
  }
  return out;
}

function armorTierHint(name) {
  if (/padded|leather|studded/i.test(name)) return "light armor";
  if (/hide|chain shirt|scale mail|breastplate|half plate/i.test(name))
    return "medium armor";
  if (/ring mail|chain mail|splint|plate/i.test(name)) return "heavy armor";
  if (/shield/i.test(name)) return "shield";
  return null;
}

function describeArmsArmor(name) {
  if (/shield/i.test(name))
    return "A sturdy shield for blocking blows and missiles.";
  const tier = armorTierHint(name);
  if (tier)
    return `Protective ${tier} favored by adventurers and guards alike.`;
  if (/bow|crossbow|sling|blowgun|dart|javelin/i.test(name))
    return "A reliable ranged weapon for hunting and skirmishing.";
  if (/lance|glaive|halberd|pike/i.test(name))
    return "A polearm with reach, ideal for ranks and cavalry charges.";
  if (/greatsword|greataxe|maul|greatclub/i.test(name))
    return "A heavy two-handed weapon for devastating strikes.";
  if (
    /rapier|scimitar|shortsword|longsword|battleaxe|warhammer|mace|flail|handaxe|war pick|sickle|quarterstaff|club|dagger|spear|trident|whip|net/i.test(
      name
    )
  )
    return "A dependable melee weapon for close-quarters fighting.";
  if (/ammunition|arrows?|bolts?|bullets?|needles?/i.test(name))
    return "A bundle of ammunition for bows or crossbows.";
  return "A practical weapon or piece of armor for everyday adventuring.";
}

function genericDescription(item) {
  const { name, category } = item;
  if (/arms_armor/.test(category)) return describeArmsArmor(name);
  if (/adventuring_gear/.test(category))
    return "Rugged gear for travel, exploration, and dungeon delving.";
  if (/tools_kits_instruments/.test(category)) {
    if (/kit|supplies|tools/i.test(name))
      return "A complete kit granting the means to practice a trade or craft.";
    if (
      /bagpipes|drum|dulcimer|flute|lute|lyre|horn|pan flute|shawm|viol/i.test(
        name
      )
    )
      return "A musical instrument suited to performers and bards.";
    return "Specialized tools for artisans, navigators, and tinkerers.";
  }
  if (/clothing_accessories/.test(category)) {
    if (
      /cloak|boots|gloves|hat|robes|vestments|uniform|attire|pin|scarf|veil/i.test(
        name
      )
    )
      return "Durable clothing or accessory for comfort, style, or disguise.";
    return "Everyday garments and accessories for life on the road or in town.";
  }
  if (/containers_storage/.test(category))
    return "A container for carrying, storing, or securing goods.";
  if (/vehicles_mounts_animals/.test(category)) {
    if (/horse|pony|camel|mastiff|warhorse|mule|donkey/i.test(name))
      return "A dependable mount or animal for travel and hauling.";
    if (/saddle|bit|bridle|barding|saddlebags/i.test(name))
      return "Tack and trappings for outfitting a mount.";
    if (
      /cart|wagon|carriage|chariot|rowboat|keelboat|longship|sailing ship|warship|galley/i.test(
        name
      )
    )
      return "A conveyance for moving people and cargo over land or sea.";
    if (/feed|stable/i.test(name))
      return "Upkeep costs for mounts and animals.";
    return "Transport, mounts, and their necessary equipment.";
  }
  if (/food_drink_rations/.test(category))
    return "Edible provisions and drink—priced per serving or bundle.";
  if (/lodging_services/.test(category))
    return "Services or accommodations—priced per the unit indicated.";
  if (/materials_trade_goods_valuables/.test(category)) {
    if (/ingot|dust|filings|flakes/i.test(name))
      return "Refined metal stock useful for crafting and spellwork.";
    if (
      /gem|agate|quartz|opal|sapphire|emerald|diamond|pearl|garnet|jade|zircon|ruby|tourmaline|beryl|spinel|amethyst|amber|coral|jet|labradorite|sunstone|prehnite|kyanite|seraphinite|ametrine|iolite|morganite|heliodor|kunzite|tanzanite|ammolite|sphene|jacinth|taaffeite|musgravite|benitoite/i.test(
        name
      )
    )
      return "Cut stone or mineral valued by jewelers, nobles, and mages.";
    if (/incense|reagent|powdered|oils|unguent|focus|vessel|chest/i.test(name))
      return "Arcane or ritual material often required for spellcasting.";
    if (
      /linen|silk|leather|lumber|wheat|flour|salt|iron|copper|mercury/i.test(
        name
      )
    )
      return "Common trade good bought and sold by merchants.";
    return "Materials and valuables traded across markets and guild halls.";
  }
  if (/books_maps_writing/.test(category))
    return "Paper goods, writing tools, and references for scholars and scouts.";
  if (/magic_consumables_scrolls/.test(category))
    return "A magical consumable; effects and rules per SRD / table policy.";
  if (/magic_arms_armor/.test(category))
    return "A magical weapon or armor; price follows rarity policy.";
  if (/magic_wands_rings_wondrous/.test(category))
    return "A wondrous or attuned magic item; price follows rarity policy.";
  if (/black_market/.test(category))
    return "An illicit poison or narcotic—restricted and punishable to possess.";
  return `A useful item in the ${catLabelById[category] || category} category.`;
}

function makeDescription(item) {
  if (item.description && String(item.description).trim())
    return String(item.description).trim();
  if (/black_market/.test(item.category) && item.notes)
    return String(item.notes).trim();
  return genericDescription(item);
}

// ---------- transform ----------
const items = (data.items || []).map((orig) => {
  const item = { ...orig };

  const baseId = slug(item.name || "item");
  item.id = item.id ? uniq(slug(item.id)) : uniq(baseId);

  item.description = makeDescription(item);

  item.legal_status = item.legal_status || legalStatusFor(item.category);
  item.availability = item.availability || availabilityFor(item.price_gp);

  const parsed = parseParensFields(item.name || "");
  for (const [k, v] of Object.entries(parsed)) {
    if (v != null && item[k] == null) item[k] = v;
  }

  const ammo = ammoType(item.name || "");
  if (ammo && item.ammo_type == null) item.ammo_type = ammo;

  const guessedConsumable = guessConsumable(
    item.name || "",
    item.category || "",
    item.consumable
  );
  if (typeof guessedConsumable === "boolean" && item.consumable == null) {
    item.consumable = guessedConsumable;
  }

  return item;
});

const out = {
  ...data,
  schema: "shop.v2",
  generated: new Date().toISOString(),
  items,
};

if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`✔ Wrote ${outPath} with ${items.length} items.`);
} else {
  process.stdout.write(JSON.stringify(out, null, 2));
}
