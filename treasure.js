import { randint, pick, pickWeighted } from "./utils.js";
import { badgeHtml, coinRowHtml } from "./badges.js";

/* =========================
   Catalog loader
   ========================= */
const CATALOG_PATH = "./data/catalog.json";
let CATALOG_DATA = null;

const TREASURE_READY = (async () => {
  try {
    const res = await fetch(CATALOG_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch ${CATALOG_PATH} → ${res.status}`);
    CATALOG_DATA = await res.json();
  } catch (err) {
    console.error("Failed to load catalog.json:", err);
    CATALOG_DATA = { items: [] };
  }
})();

export function loadTreasureData() {
  return TREASURE_READY;
}

/* =========================
   DOM helpers
   ========================= */
const el = (id) => document.getElementById(id);

/* =========================
   Treasure-only privacy
   - Slider id: #treasurePrivacySlider
   - 0 = Public (SRD + homebrew)
   - 1 = Private (everything) — ALWAYS prompts
   ========================= */
const PW = "harrywraith";
let _treasurePrivacyMode = 0; // internal state: 0 public, 1 private
let _promptGuard = false;

function getPrivacyMode() {
  // Source of truth is the slider value, not just the internal var
  const s = el("treasurePrivacySlider");
  if (!s) return _treasurePrivacyMode;
  const v = Number(s.value) ? 1 : 0;
  return v;
}

function setPrivacyMode(v, { reflect = true, clearOnPublic = true } = {}) {
  _treasurePrivacyMode = v ? 1 : 0;
  if (reflect) {
    const s = el("treasurePrivacySlider");
    if (s) s.value = String(_treasurePrivacyMode);
  }
  if (_treasurePrivacyMode === 0 && clearOnPublic) {
    const out = el("treasureResult");
    if (out) out.innerHTML = "—";
  }
  console.debug(
    "[treasure] privacy =",
    _treasurePrivacyMode ? "Private" : "Public"
  );
}

function bindTreasurePrivacy() {
  const slider = el("treasurePrivacySlider");
  if (!slider) return;

  // Don’t force a value; respect whatever is in the HTML, default is "0"
  setPrivacyMode(Number(slider.value), { reflect: true, clearOnPublic: false });

  const handleToggle = () => {
    const target = Number(slider.value) ? 1 : 0;

    if (target === 1) {
      // switching to Private → ALWAYS prompt (no caching)
      if (_promptGuard) {
        // reentrancy (shouldn’t happen, but be safe)
        slider.value = String(getPrivacyMode());
        return;
      }
      _promptGuard = true;
      const ok = window.prompt("Enter private mode password:", "") === PW;
      _promptGuard = false;

      if (!ok) {
        // deny and revert (stay public)
        setPrivacyMode(0, { reflect: true, clearOnPublic: false });
        return;
      }
      setPrivacyMode(1, { reflect: true, clearOnPublic: false });
    } else {
      // switching to Public
      setPrivacyMode(0, { reflect: true, clearOnPublic: true });
    }
  };

  // Use change (release) for clean UX; input would prompt on every pixel
  if (slider && slider.dataset.bound !== "1") {
    slider.dataset.bound = "1";
    slider.addEventListener("change", handleToggle);
  }
}

/* =========================
   Public filter
   ========================= */
function isPublicAllowed(item) {
  return (
    String(item?.publication || "")
      .toLowerCase()
      .trim() === "srd"
  );
}
function inScope(item) {
  // If Private → everything; if Public → SRD + homebrew only
  return getPrivacyMode() === 1 ? true : isPublicAllowed(item);
}

/* =========================
   Coins + badges
   ========================= */
const lc = (s) => String(s || "").toLowerCase();
const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

function coinsFromGp(gp) {
  let cp = Math.round((Number(gp) || 0) * 100);
  if (!Number.isFinite(cp)) cp = 0;
  const pp = Math.floor(cp / 1000);
  cp -= pp * 1000;
  const gpInt = Math.floor(cp / 100);
  cp -= gpInt * 100;
  const sp = Math.floor(cp / 10);
  cp -= sp * 10;
  return { pp, gp: gpInt, sp, cp };
}
function coinPill(k, v) {
  return v ? `<span class="coin coin-${k}">${v}${k}</span>` : "";
}
function coinRow(coins, cls = "") {
  return coinRowHtml(coins, cls);
}

function titleCase(s) {
  return String(s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderBadges(entity) {
  const lc = (s) =>
    String(s || "")
      .toLowerCase()
      .trim();
  const titleCase = (s) =>
    String(s || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const isNA = (s) => {
    const v = lc(s);
    return !v || v === "n/a" || v === "na" || v === "-" || v === "—";
  };

  // Map normalized item "type" → badge class your CSS already styles
  const TYPE_BADGE = {
    weapon: "weapon",
    armor: "armor",
    shield: "shield",
    ring: "ring",
    wand: "wand",
    staff: "staff",
    rod: "rod",
    ammunition: "ammo",
    ammo: "ammo",
    wondrous: "wondrous",
    weapons: "weapon",
    rings: "ring",
    staves: "staff",
    potions: "potion",
    goods: "goods",
    gear: "gear",
    art: "art",
    gems: "gems",
  };

  const badges = [];
  const add = (cls, label, title = label) => {
    if (!isNA(label)) badges.push(badgeHtml(cls, label, { title }));
  };

  // rarity
  const rRaw = String(entity?.rarity || "");
  if (!isNA(rRaw)) {
    const r = lc(rRaw.replace(/[_-]+/g, " "));
    add(
      `rarity ${r}`,
      r.replace(/\b\w/g, (c) => c.toUpperCase()),
      "Rarity"
    );
  }

  // attunement
  if (entity.attunement === true)
    add("attune attune-true", "attune", "Requires attunement");
  else if (entity.attunement === false)
    add("attune attune-false", "no attune", "No attunement required");

  // consumable
  if (entity.is_consumable) add("consumable", "consumable");

  // type → map if known; otherwise use a sanitized class from the raw type
  const tRaw = lc(entity.type);
  const tMapped = TYPE_BADGE[tRaw];
  const clsSafe = (tMapped || tRaw)
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/[^a-z0-9-]/g, "-") // punctuation → hyphen
    .replace(/-+/g, "-") // collapse dup hyphens
    .replace(/^-|-$/g, ""); // trim
  if (clsSafe) add(clsSafe, titleCase(entity.type), "Type");

  // illicit
  const tags = Array.isArray(entity.tags) ? entity.tags.map(lc) : [];
  if (tags.includes("illicit"))
    add("illicit", "illicit", "Restricted / illicit goods");

  // publication → SRD only
  if (lc(entity.publication) === "srd")
    add("pub pub-srd", "srd", "Open content");

  return badges.length
    ? `<span class="tb-badges">${badges.join(" ")}</span>`
    : "";
}

/* =========================
   Catalog helpers
   ========================= */
function allItems() {
  return Array.isArray(CATALOG_DATA?.items) ? CATALOG_DATA.items : [];
}

function magicCatalog() {
  return allItems().filter(
    (it) => it?.name && inScope(it) && it.magical === true
  );
}

function gemCatalog() {
  return allItems().filter(
    (it) => it?.name && inScope(it) && lc(it.type) === "gems"
  );
}
function artCatalog() {
  return allItems().filter(
    (it) => it?.name && inScope(it) && lc(it.type) === "art"
  );
}

/* =========================
   Magic rarity buckets + roll
   ========================= */
function getBuckets() {
  const buckets = {
    common: [],
    uncommon: [],
    rare: [],
    "very rare": [],
    legendary: [],
    artifact: [],
  };
  for (const it of magicCatalog()) {
    const r = String(it.rarity || "")
      .replace(/[_-]+/g, " ")
      .toLowerCase();
    if (r === "varies") continue;
    if (buckets[r]) buckets[r].push(it);
  }
  return buckets;
}

const RARITY_BY_LEVEL = {
  levelNone: null, // no magic
  levelSkazka: {
    low: [{ v: "uncommon", w: 98 }],
    mid: [
      { v: "uncommon", w: 55 },
      { v: "rare", w: 45 },
    ],
    high: [
      { v: "rare", w: 65 },
      { v: "very rare", w: 30 },
      { v: "legendary", w: 5 },
    ],
    epic: [
      { v: "very rare", w: 65 },
      { v: "legendary", w: 33 },
      { v: "artifact", w: 2 },
    ],
  },
  levelLow: {
    low: [{ v: "uncommon", w: 98 }],
    mid: [
      { v: "uncommon", w: 55 },
      { v: "rare", w: 45 },
    ],
    high: [
      { v: "rare", w: 65 },
      { v: "very rare", w: 30 },
      { v: "legendary", w: 5 },
    ],
    epic: [
      { v: "very rare", w: 65 },
      { v: "legendary", w: 33 },
      { v: "artifact", w: 2 },
    ],
  },
  levelNormal: {
    low: [
      { v: "uncommon", w: 85 },
      { v: "rare", w: 14 },
      { v: "very rare", w: 1 },
    ],
    mid: [
      { v: "uncommon", w: 55 },
      { v: "rare", w: 38 },
      { v: "very rare", w: 7 },
    ],
    high: [
      { v: "rare", w: 65 },
      { v: "very rare", w: 30 },
      { v: "legendary", w: 5 },
    ],
    epic: [
      { v: "very rare", w: 65 },
      { v: "legendary", w: 33 },
      { v: "artifact", w: 2 },
    ],
  },
  levelHigh: {
    low: [
      { v: "uncommon", w: 70 },
      { v: "rare", w: 28 },
      { v: "very rare", w: 2 },
    ],
    mid: [
      { v: "uncommon", w: 25 },
      { v: "rare", w: 50 },
      { v: "very rare", w: 25 },
    ],
    high: [
      { v: "rare", w: 30 },
      { v: "very rare", w: 50 },
      { v: "legendary", w: 20 },
    ],
    epic: [
      { v: "very rare", w: 45 },
      { v: "legendary", w: 45 },
      { v: "artifact", w: 10 },
    ],
  },
};

function isConsumableMagic(it) {
  return !!(it && it.magical === true && it.is_consumable === true);
}

function rollMagicItemsForBand(band, count, levelKey = "levelNormal") {
  const weights = RARITY_BY_LEVEL[levelKey] || RARITY_BY_LEVEL.levelNormal;
  if (!weights) return [];
  const b = getBuckets();
  const out = [];
  for (let i = 0; i < count; i++) {
    let rarity = pickWeighted(weights[band] || weights.mid);
    let pool = b[rarity] || [];

    // broaden if empty
    if (!pool.length) {
      const order = [
        "common",
        "uncommon",
        "rare",
        "very rare",
        "legendary",
        "artifact",
      ];
      const idx = Math.max(0, order.indexOf(rarity));
      pool = [
        ...order
          .slice(idx)
          .map((r) => b[r])
          .flat(),
        ...order
          .slice(0, idx)
          .map((r) => b[r])
          .flat(),
      ].filter(Boolean);
    }

    // Skazka: consumable-only
    if (levelKey === "levelSkazka") {
      pool = pool.filter(isConsumableMagic);
      if (!pool.length) continue;
    }

    const it = pick(pool);
    if (it) out.push(it);
  }
  return out;
}

/* =========================
   Dice + simple tables
   ========================= */
function rollDice(expr) {
  if (!expr) return 0;
  const m = /^(\d+)d(\d+)(?:\*(\d+))?$/i.exec(expr);
  if (!m) return 0;
  const n = +m[1],
    d = +m[2],
    mult = m[3] ? +m[3] : 1;
  let total = 0;
  for (let i = 0; i < n; i++) total += randint(1, d);
  return total * mult;
}

const INDIVIDUAL_RULES = {
  low: { cp: "5d6", sp: "4d6", gp: "3d6" },
  mid: { sp: "4d6*10", gp: "2d6*10" },
  high: { sp: "3d6*10", gp: "4d6*10", pp: "2d6" },
  epic: { gp: "8d6*10", pp: "4d6" },
};
const INDIVIDUAL_MAGIC = {
  low: { p: 0.1, count: [1, 1] },
  mid: { p: 0.15, count: [1, 1] },
  high: { p: 0.18, count: [0, 1] },
  epic: { p: 0.2, count: [0, 1] },
};

const COIN_BANDS = {
  low: { gp: [50, 200], sp: [100, 400], cp: [0, 200] },
  mid: { gp: [200, 800], sp: [200, 800], cp: [0, 200] },
  high: { gp: [800, 3000], sp: [500, 2000], cp: [0, 100] },
  epic: { gp: [3000, 10000], sp: [0, 3000], cp: [0, 0] },
};
const GEM_COUNTS = { low: [0, 1], mid: [1, 4], high: [3, 8], epic: [6, 12] };
const ART_COUNTS = { low: [0, 0], mid: [0, 2], high: [1, 3], epic: [2, 5] };
const MAGIC_COUNTS = { low: [0, 1], mid: [1, 2], high: [2, 4], epic: [3, 6] };

/* =========================
   Main roll
   ========================= */
export function rollTreasure(mode, band, levelKey = "levelNormal") {
  // Read mode at call-time to avoid stale state
  const isPrivate = getPrivacyMode() === 1;
  console.debug("[treasure] roll in", isPrivate ? "Private" : "Public");

  if (mode === "individual") {
    const r = INDIVIDUAL_RULES[band] || INDIVIDUAL_RULES.mid;
    const coinsObj = {
      cp: rollDice(r.cp),
      sp: rollDice(r.sp),
      gp: rollDice(r.gp),
      pp: rollDice(r.pp),
    };
    let magic = [];
    if (levelKey !== "levelNone") {
      const im = INDIVIDUAL_MAGIC[band] || INDIVIDUAL_MAGIC.mid;
      const n = Math.random() < im.p ? randint(im.count[0], im.count[1]) : 0;
      magic = n > 0 ? rollMagicItemsForBand(band, n, levelKey) : [];
    }
    return {
      mode,
      band,
      coins: `${coinsObj.gp ? coinsObj.gp + " gp" : ""}${
        coinsObj.sp ? (coinsObj.gp ? ", " : "") + coinsObj.sp + " sp" : ""
      }${
        coinsObj.cp
          ? (coinsObj.gp || coinsObj.sp ? ", " : "") + coinsObj.cp + " cp"
          : ""
      }${
        coinsObj.pp
          ? (coinsObj.gp || coinsObj.sp || coinsObj.cp ? ", " : "") +
            coinsObj.pp +
            " pp"
          : ""
      }`,
      coins_raw: coinsObj,
      gem_items: [],
      art_items: [],
      magic,
      private: isPrivate,
    };
  }

  // Hoard
  const c = COIN_BANDS[band] || COIN_BANDS.mid;
  const gp = randint(c.gp[0], c.gp[1]);
  const sp = randint(c.sp[0], c.sp[1]);
  const cp = randint(c.cp[0], c.cp[1]);
  const coins = { gp, sp, cp };

  // Pools already honor privacy via inScope()
  const gPool = gemCatalog();
  const aPool = artCatalog();

  const [gMin, gMax] = GEM_COUNTS[band] || GEM_COUNTS.mid;
  const gCount = randint(gMin, gMax);
  const gem_items = Array.from({ length: gCount }, () =>
    gPool.length ? pick(gPool) : null
  ).filter(Boolean);

  const [aMin, aMax] = ART_COUNTS[band] || ART_COUNTS.mid;
  const aCount = randint(aMin, aMax);
  const art_items = Array.from({ length: aCount }, () =>
    aPool.length ? pick(aPool) : null
  ).filter(Boolean);

  let magic = [];
  if (levelKey !== "levelNone") {
    const [mMin, mMax] = MAGIC_COUNTS[band] || MAGIC_COUNTS.mid;
    const mCount = randint(mMin, mMax);
    magic = mCount > 0 ? rollMagicItemsForBand(band, mCount, levelKey) : [];
  }

  return {
    mode: "hoard",
    band,
    coins: `${gp} gp${sp ? `, ${sp} sp` : ""}${cp ? `, ${cp} cp` : ""}`,
    coins_raw: coins,
    gem_items,
    art_items,
    magic,
    private: isPrivate,
  };
}

/* =========================
   Render
   ========================= */
export function renderTreasure(t) {
  if (!t) return "—";

  const header = `<div><strong>${
    t.mode === "individual" ? "Individual" : "Hoard"
  }</strong></div>`;
  const coinsLine = `<div class="loot-line"><span>Coinage:</span> ${
    coinRow(t.coins_raw, "coins-sum") || t.coins
  }</div>`;

  const gemsBlock =
    t.gem_items && t.gem_items.length
      ? `<div class="loot-line"><span>Gems:</span></div>
<ul class="tb-list">
${t.gem_items
  .map((g) => {
    const badges = renderBadges(g);
    return `<li class="loot-line loot-gem"><span class="tb-detail-name">${g.name}</span> ${badges}</li>`;
  })
  .join("\n")}
</ul>`
      : "";

  const artBlock =
    t.art_items && t.art_items.length
      ? `<div class="loot-line"><span>Art:</span></div>
<ul class="tb-list">
${t.art_items
  .map((a) => {
    const badges = renderBadges(a);
    return `<li class="loot-line loot-art"><span class="tb-detail-name">${a.name}</span> ${badges}</li>`;
  })
  .join("\n")}
</ul>`
      : "";

  const magicBlock =
    t.magic && t.magic.length
      ? `<div class="loot-line"><span>Magic:</span></div>
<ul class="tb-list">
${t.magic
  .map((m) => {
    const badges = renderBadges(m);
    return `<li class="loot-line loot-magic"><span class="tb-detail-name">${m.name}</span> ${badges}</li>`;
  })
  .join("\n")}
</ul>`
      : "";

  return `<div>
${header}
${coinsLine}
${gemsBlock}
${artBlock}
${magicBlock}
</div>`;
}

/* =========================
   Boot
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  bindTreasurePrivacy();
  console.debug(
    "[treasure] init; starting mode =",
    getPrivacyMode() ? "Private" : "Public"
  );
});
