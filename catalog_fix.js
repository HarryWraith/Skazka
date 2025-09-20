// catalog_fix.js — post-merge cleanup & enrichment for ./data/catalog.json
// Usage (from repo root):
//   node catalog_fix.js         # update in place
//   node catalog_fix.js --audit # also write ./data/attunement_audit.csv
//
// What it does:
// 1) Re-tag non-magic SRD items (generic shop goods) as 'homebrew' (publication).
// 2) Ensures every item has attunement: true/false/null (null for non-magic).
//    - Magic: true if description says "requires attunement", or if in strong SRD families
//      (wands, staves, Ioun Stones). False for potions, scrolls, ammunition, plain +X weapons/armor/shields.
//    - Optional overrides via ./data/attunement_overrides.json (by name or id).
//    - Existing attunement:true is preserved; attunement:false is re-evaluated and can be upgraded to true.
// 3) Adds 'identification' (null by default; optional house-rule "arcana dc XX" by rarity).
// 4) UI-prep fields: is_consumable, slot, price_coins, sell_coins.
//
// A backup is written to ./data/catalog.backup.json
//
const fs = require("fs");
const path = require("path");

const IN_PATH = path.resolve("./data/catalog.json");
const OUT_PATH = IN_PATH;
const BK_PATH = path.resolve("./data/catalog.backup.json");
const OVERRIDES_PATH = path.resolve("./data/attunement_overrides.json");

const ARGS = process.argv.slice(2);
const DO_AUDIT = ARGS.includes("--audit");

// ---------- toggles
// If true, populate identification with "arcana dc XX" by rarity.
const ENABLE_HOUSE_RULE_ID = false;
const ID_DC_BY_RARITY = {
  common: 10,
  uncommon: 12,
  rare: 15,
  "very rare": 18,
  legendary: 20,
  artifact: 22,
};

// ---------- helpers
const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const lower = (s) => String(s || "").toLowerCase();
const norm = (s) => lower(s).trim();

function splitCoinsFromGP(gpFloat) {
  // convert a gp float into integer pp/gp/sp/cp (greedy, rounding to nearest cp)
  let totalCp = Math.round(Number(gpFloat || 0) * 100); // 1 gp = 100 cp
  if (!Number.isFinite(totalCp)) totalCp = 0;
  const pp = Math.floor(totalCp / 1000);
  totalCp -= pp * 1000; // 1 pp = 10 gp = 1000 cp
  const gp = Math.floor(totalCp / 100);
  totalCp -= gp * 100;
  const sp = Math.floor(totalCp / 10);
  totalCp -= sp * 10;
  const cp = totalCp;
  return { pp, gp, sp, cp };
}

function detectConsumable(it) {
  const tags = Array.isArray(it?.tags) ? it.tags.map(lower) : [];
  const t = lower(it?.type);
  const n = lower(it?.name);
  const kinds = Array.isArray(it?.kinds) ? it.kinds.map(lower) : [];
  if (tags.includes("consumable") || kinds.includes("consumable")) return true;
  if (t === "potion" || t === "scroll") return true;
  if (/\b(ammo|ammunition|oil|ointment|elixir|philter|dust|bead)\b/.test(n))
    return true;
  return false;
}

function detectSlot(it) {
  const t = lower(it?.type);
  const n = lower(it?.name);
  const tags = Array.isArray(it?.tags) ? it.tags.map(lower) : [];

  if (tags.includes("ring") || /\bring\b/.test(n)) return "ring";
  if (tags.includes("amulet") || /amulet|necklace|periapt|talisman/.test(n))
    return "neck";
  if (tags.includes("cloak") || /cloak|cape/.test(n)) return "shoulders";
  if (tags.includes("boots") || /boots|slippers|sandals/.test(n)) return "feet";
  if (tags.includes("helm") || /helm|helmet|circlet|crown/.test(n))
    return "head";
  if (tags.includes("gloves") || /gloves|gauntlets/.test(n)) return "hands";
  if (tags.includes("belt") || /belt|girdle/.test(n)) return "waist";
  if (tags.includes("bracers") || /bracers|bracelet/.test(n)) return "wrists";
  if (tags.includes("shield") || /\bshield\b/.test(n)) return "offhand";
  if (
    tags.includes("armor") ||
    /\b(armor|mail|plate|leather)\b/.test(n) ||
    t === "armor"
  )
    return "body";
  if (
    t === "weapon" ||
    /\b(sword|axe|mace|bow|crossbow|spear|dagger|staff|club|maul|flail|whip|trident)\b/.test(
      n
    )
  )
    return "weapon";
  if (t === "wondrous item" || tags.includes("wondrous")) return "wondrous";
  if (/instrument/.test(n)) return "instrument";
  if (/ammo|ammunition|arrow|bolt|bullet/.test(n)) return "ammunition";
  if (t === "potion") return "potion";
  if (t === "scroll") return "scroll";
  return null;
}

function descRequiresAttunement(it) {
  const d = lower(it?.description || "");
  if (!d) return false;
  // catch variants: "(requires attunement)", "(requires attunement by a wizard)"
  return /\brequires\s+attunement\b/.test(d);
}

// Overrides (by name or id)
function loadOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_PATH)) {
      const o = JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf8"));
      const byName = o?.byName || o?.names || {};
      const byId = o?.byId || o?.ids || {};
      const normName = {};
      for (const [k, v] of Object.entries(byName)) normName[norm(k)] = !!v;
      return { byName: normName, byId: byId };
    }
  } catch (e) {
    console.warn("Failed to load attunement_overrides.json:", e.message);
  }
  return { byName: {}, byId: {} };
}

// Attunement rules -> { value: true|false|null, reason: string }
function computeAttunement(it, overrides) {
  // Non-magic → null
  if (!it?._from_magic) return { value: null, reason: "non-magic" };

  // Overrides (name / id)
  const nameN = norm(it?.name);
  if (nameN && Object.prototype.hasOwnProperty.call(overrides.byName, nameN)) {
    const v = !!overrides.byName[nameN];
    return { value: v, reason: `override:name:${v}` };
  }
  if (it?.id && Object.prototype.hasOwnProperty.call(overrides.byId, it.id)) {
    const v = !!overrides.byId[it.id];
    return { value: v, reason: `override:id:${v}` };
  }

  // Explicit SRD-style text
  if (descRequiresAttunement(it)) return { value: true, reason: "explicit" };

  // Family rules (strong signals that require attunement)
  const type = lower(it?.type);
  const name = lower(it?.name);

  if (type === "wand" || /\bwand\b/.test(name))
    return { value: true, reason: "family:wands" };
  if (type === "staff" || /\bstaff\b/.test(name))
    return { value: true, reason: "family:staves" };
  if (/\bioun\s+stone\b/.test(name))
    return { value: true, reason: "family:ioun_stone" };

  // Families that do NOT require attunement in SRD
  const tags = Array.isArray(it?.tags) ? it.tags.map(lower) : [];
  if (type === "potion" || type === "scroll")
    return { value: false, reason: "family:consumable" };
  if (
    type === "ammunition" ||
    /\b(ammo|ammunition|arrow|bolt|bullet)\b/.test(name)
  )
    return { value: false, reason: "family:ammo" };
  if (
    type === "armor" ||
    type === "shield" ||
    tags.includes("armor") ||
    tags.includes("shield")
  ) {
    if (/\+\d/.test(name)) return { value: false, reason: "family:armor+X" };
  }
  if (type === "weapon" && /\+\d/.test(name))
    return { value: false, reason: "family:weapon+X" };

  // Default conservative: false
  return { value: false, reason: "default:false" };
}

// ---------- main
function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error("Could not find", IN_PATH);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(IN_PATH, "utf8"));
  const items = Array.isArray(raw?.items) ? raw.items : [];

  // backup
  try {
    fs.writeFileSync(BK_PATH, JSON.stringify(raw, null, 2), "utf8");
  } catch (e) {
    console.warn("Backup failed:", e.message);
  }

  const overrides = loadOverrides();

  // counters
  let publicationFixed = 0;
  let attTrue = 0,
    attFalse = 0,
    attNull = 0;
  let reclassFalseToTrue = 0,
    keptTrue = 0;
  let explicit = 0,
    familyTrue = 0,
    familyFalse = 0,
    overrideTrue = 0,
    overrideFalse = 0,
    defaultFalse = 0;
  let idAdded = 0,
    consumableSet = 0,
    slotSet = 0,
    priceCoins = 0,
    sellCoins = 0;

  const auditRows = [["name", "id", "attunement", "reason"]];

  const out = items.map((it) => {
    const o = { ...it };

    // (1) Publication fix: non-magic "SRD" -> "homebrew"
    if (!o._from_magic && /srd/i.test(String(o.publication || ""))) {
      o.publication = "homebrew";
      publicationFixed++;
    }

    // (2) Attunement: recompute (keeping only explicit true)
    const prev = o.attunement;
    let next, reason;
    const res = computeAttunement(o, overrides);
    next = res.value;
    reason = res.reason;

    // If previously true, keep true (manual curation wins)
    if (prev === true) {
      keptTrue++;
      next = true;
      reason = "kept:true";
    } else {
      // If previously false (or unset) and rules say true, upgrade
      if (prev === false && next === true) reclassFalseToTrue++;
    }

    // Record counters
    if (next === null) attNull++;
    else if (next === true) attTrue++;
    else attFalse++;

    if (reason === "explicit") explicit++;
    else if (reason.startsWith("family:")) {
      if (next === true) familyTrue++;
      else familyFalse++;
    } else if (
      reason.startsWith("override:name") ||
      reason.startsWith("override:id")
    ) {
      if (next === true) overrideTrue++;
      else overrideFalse++;
    } else if (reason === "default:false") {
      defaultFalse++;
    }

    o.attunement = next;

    if (DO_AUDIT && next !== null) {
      auditRows.push([
        String(o.name || ""),
        String(o.id || ""),
        String(next),
        reason,
      ]);
    }

    // (3) Identification
    if (typeof o.identification === "undefined") {
      if (ENABLE_HOUSE_RULE_ID && o._from_magic) {
        const r = lower(o.rarity || "");
        const dc = ID_DC_BY_RARITY[r];
        o.identification = Number.isFinite(dc) ? `arcana dc ${dc}` : null;
      } else {
        o.identification = null;
      }
      idAdded++;
    }

    // (4) UI prep
    const isCons = detectConsumable(o);
    if (o.is_consumable !== isCons) {
      o.is_consumable = isCons;
      consumableSet++;
    }

    const slot = detectSlot(o);
    if (o.slot !== slot) {
      o.slot = slot;
      slotSet++;
    }

    const pb = splitCoinsFromGP(o.price_gp);
    if (JSON.stringify(o.price_coins) !== JSON.stringify(pb)) {
      o.price_coins = pb;
      priceCoins++;
    }

    const sp =
      o.sell_price != null
        ? splitCoinsFromGP(o.sell_price)
        : { pp: 0, gp: 0, sp: 0, cp: 0 };
    if (JSON.stringify(o.sell_coins) !== JSON.stringify(sp)) {
      o.sell_coins = sp;
      sellCoins++;
    }

    return o;
  });

  const result = { ...raw, items: out };
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), "utf8");

  if (DO_AUDIT) {
    const csv = auditRows
      .map((r) =>
        r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")
      )
      .join("\n");
    fs.writeFileSync(path.resolve("./data/attunement_audit.csv"), csv, "utf8");
  }

  // Print summary
  console.log("catalog_fix complete");
  console.log("  publication → homebrew (non-magic SRD):", publicationFixed);
  console.log(
    "  attunement  true:",
    attTrue,
    " false:",
    attFalse,
    " null:",
    attNull
  );
  console.log(
    "      sources  explicit:",
    explicit,
    " familyTrue:",
    familyTrue,
    " familyFalse:",
    familyFalse,
    " overrideTrue:",
    overrideTrue,
    " overrideFalse:",
    overrideFalse,
    " keptTrue:",
    keptTrue,
    " reclass false→true:",
    reclassFalseToTrue,
    " defaultFalse:",
    defaultFalse
  );
  console.log("  identification added:", idAdded);
  console.log("  is_consumable set:", consumableSet);
  console.log("  slot set:", slotSet);
  console.log("  price_coins set:", priceCoins, " sell_coins set:", sellCoins);
  console.log("Wrote", out.length, "items →", OUT_PATH);
  console.log("Backup at", BK_PATH);
}

main();
