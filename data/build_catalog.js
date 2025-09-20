// build_catalog.js  — CommonJS version (Node: no ESM required)
// Run: node build_catalog.js

const fs = require("fs");

const SHOP_PATH = "shop.json";
const MAGIC_PATH = "magic-items.json";
const OUT_PATH = ".catalog.json";

// helpers
const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/(^-|-$)/g, "");

const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

// Accepts: 10, "10 gp", "75 sp", "1 gp 5 sp", "12cp"
function parsePriceGP(v) {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  let s = String(v).toLowerCase().replace(/,/g, " ").trim();

  // tokenized "1 gp 5 sp"
  let gp = 0,
    sp = 0,
    cp = 0,
    found = false,
    m;
  const re = /(\d+(?:\.\d+)?)\s*(gp|sp|cp)\b/g;
  while ((m = re.exec(s))) {
    found = true;
    const n = parseFloat(m[1]);
    if (m[2] === "gp") gp += n;
    else if (m[2] === "sp") sp += n;
    else cp += n;
  }
  if (found) return gp + sp / 10 + cp / 100;

  const num = parseFloat(s);
  return isNaN(num) ? NaN : num;
}

// Load sources
const shopRaw = JSON.parse(fs.readFileSync(SHOP_PATH, "utf8"));
const magicRaw = JSON.parse(fs.readFileSync(MAGIC_PATH, "utf8"));

// Normalize SHOP → items[]
function* normalizeShop() {
  const items = Array.isArray(shopRaw?.items) ? shopRaw.items : [];
  for (const it of items) {
    const name = String(it?.name || "").trim();
    if (!name) continue;

    const category = String(it?.category ?? it?.cat ?? "misc")
      .toLowerCase()
      .replace(/\s+/g, "_");

    let price = parsePriceGP(it?.price_gp ?? it?.price ?? it?.gp);
    if (!isFinite(price)) {
      const sp = parsePriceGP(it?.price_sp ?? it?.sp);
      const cp = parsePriceGP(it?.price_cp ?? it?.cp);
      price = (isFinite(sp) ? sp / 10 : 0) + (isFinite(cp) ? cp / 100 : 0);
    }
    if (!isFinite(price) || price < 0) continue;

    const id = slug(it?.id || `${name}-${category}`);
    const weight = Number(it?.weight ?? it?.weight_lb ?? it?.wt);
    const kinds = Array.isArray(it?.kinds)
      ? it.kinds
      : it?.kind
      ? [it.kind]
      : [];

    yield {
      id,
      name,
      kinds,
      type: it?.type ?? null,
      rarity: it?.rarity ?? null,
      attunement: it?.attunement ?? null,
      category,
      price_gp: round2(price),
      sell_price: round2(price * 0.5),
      weight: isFinite(weight) ? weight : null,
      tags: Array.isArray(it?.tags) ? it.tags : [],
      publication: it?.publication ?? "homebrew",
      source: it?.source ?? null,
      description: it?.description ?? null,
      _from_magic: false,
      _from_shop: true,
    };
  }
}

// Normalize MAGIC → items[]
function* normalizeMagic() {
  const items = Array.isArray(magicRaw?.items) ? magicRaw.items : [];
  for (const it of items) {
    const name = String(it?.name || "").trim();
    if (!name) continue;

    const category = String(it?.category ?? "magic_item")
      .toLowerCase()
      .replace(/\s+/g, "_");

    let price = parsePriceGP(it?.price_gp ?? it?.price);
    price = isFinite(price) ? round2(price) : null;

    const id = slug(it?.id || `${name}-${category}`);
    const weight = Number(it?.weight ?? it?.weight_lb);

    const tags = new Set(Array.isArray(it?.tags) ? it.tags : []);
    tags.add("magic");

    yield {
      id,
      name,
      kinds: Array.isArray(it?.kinds) ? it.kinds : [],
      type: it?.type ?? null,
      rarity: it?.rarity ?? null,
      attunement: it?.attunement ?? null,
      category,
      price_gp: price,
      sell_price: price != null ? round2(price * 0.5) : null,
      weight: isFinite(weight) ? weight : null,
      tags: Array.from(tags),
      publication: it?.publication ?? "srd",
      source: it?.source ?? null,
      description: it?.description ?? null,
      _from_magic: true,
      _from_shop: false,
    };
  }
}

// Merge + dedupe (by name+category, case-insensitive)
const map = new Map();
const keyOf = (it) =>
  `${it.name.toLowerCase()}::${String(it.category || "").toLowerCase()}`;

for (const rec of [...normalizeShop(), ...normalizeMagic()]) {
  const k = keyOf(rec);
  if (!map.has(k)) {
    map.set(k, rec);
  } else {
    const prev = map.get(k);
    const merged = {
      ...prev,
      ...rec,
      kinds: Array.from(new Set([...(prev.kinds || []), ...(rec.kinds || [])])),
      tags: Array.from(new Set([...(prev.tags || []), ...(rec.tags || [])])),
      price_gp:
        prev._from_shop && prev.price_gp != null
          ? prev.price_gp
          : rec._from_shop && rec.price_gp != null
          ? rec.price_gp
          : prev.price_gp ?? rec.price_gp ?? null,
      sell_price: null, // recompute below
      weight: prev.weight ?? rec.weight ?? null,
      publication: prev.publication || rec.publication || "homebrew",
      source: prev.source || rec.source || null,
      _from_magic: !!(prev._from_magic || rec._from_magic),
      _from_shop: !!(prev._from_shop || rec._from_shop),
    };
    merged.sell_price =
      merged.price_gp != null ? round2(merged.price_gp * 0.5) : null;
    map.set(k, merged);
  }
}

// Ensure required fields + defaults
const items = Array.from(map.values()).map((it) => ({
  id: it.id || slug(`${it.name}-${it.category}`),
  name: it.name,
  kinds: Array.isArray(it.kinds) ? it.kinds : [],
  type: it.type ?? null,
  rarity: it.rarity ?? null,
  attunement: it.attunement ?? null,
  category: it.category ?? "misc",
  price_gp: it.price_gp ?? null,
  sell_price: it.price_gp != null ? round2(it.price_gp * 0.5) : null,
  weight: it.weight ?? null,
  tags: Array.isArray(it.tags) ? it.tags : [],
  publication: it.publication ?? "homebrew",
  source: it.source ?? null,
  description: it.description ?? null,
  _from_magic: !!it._from_magic,
  _from_shop: !!it._from_shop,
}));

items.sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(
  OUT_PATH,
  JSON.stringify({ schema: "catalog.v1", items }, null, 2),
  "utf8"
);
console.log(`Wrote ${items.length} items → ${OUT_PATH}`);
