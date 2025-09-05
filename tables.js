/* tables.js — JSON-driven generators
   Generators kept: Weather, Traps, Treasure, Names
   Removed: Travel, Road, Tavern (to be rebuilt later)
*/
(function () {
  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITIES (shared)
  // ─────────────────────────────────────────────────────────────────────────────
  const randint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[randint(0, arr.length - 1)];
  function pickWeighted(items) {
    const total = items.reduce((n, it) => n + (it.w || 0), 0);
    if (!total) return items.length ? items[0].v : null;
    let r = Math.random() * total;
    for (const it of items) { r -= (it.w || 0); if (r <= 0) return it.v; }
    return items[items.length - 1].v;
  }
  const ucfirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const get = (sel) => document.querySelector(sel);
  const setText = (sel, txt) => { const o = get(sel); if (o) o.textContent = txt; };
  const setVal  = (sel, val) => { const el = get(sel); if (el) el.value = val; };
  const rollBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // ─────────────────────────────────────────────────────────────────────────────
  // WEATHER  (data: /data/weather.json)
  // ─────────────────────────────────────────────────────────────────────────────
  const WEATHER_PATH = "/data/weather.json";
  let WEATHER_DATA = null, WEATHER_READY = null;

  function loadWeatherData() {
    if (WEATHER_READY) return WEATHER_READY;
    WEATHER_READY = (async () => {
      try {
        const res = await fetch(WEATHER_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`Fetch ${WEATHER_PATH} → ${res.status}`);
        WEATHER_DATA = await res.json();
      } catch (err) {
        console.error("Failed to load weather.json:", err);
        WEATHER_DATA = {
          zones: ["centre"], seasons: ["autumn"],
          temperature: { centre: { autumn: { min: 5, max: 12 } } },
          conditions: { centre: { autumn: [{ v: "overcast", w: 1 }] } }
        };
      }
    })();
    return WEATHER_READY;
  }
  loadWeatherData();

  function rollWeather(zone, season) {
    if (!WEATHER_DATA) return "Weather loading…";
    const z = WEATHER_DATA.temperature[zone] ? zone : WEATHER_DATA.zones[0];
    const s = WEATHER_DATA.temperature[z][season] ? season : WEATHER_DATA.seasons[0];
    const tband = WEATHER_DATA.temperature[z][s];
    const temp = rollBetween(tband.min, tband.max);
    const condition = pickWeighted(WEATHER_DATA.conditions[z][s]);
    return `${ucfirst(condition)}. High around ${temp}°C.`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TRAPS  (data: /data/traps.json) — DC + damage type/dice; base generator unchanged
  // ─────────────────────────────────────────────────────────────────────────────
  const TRAPS_PATH = "/data/traps.json";
  let TRAPS_DATA = null, TRAPS_READY = null;

  function loadTrapsData() {
    if (TRAPS_READY) return TRAPS_READY;
    TRAPS_READY = (async () => {
      try {
        const res = await fetch(TRAPS_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`Fetch ${TRAPS_PATH} → ${res.status}`);
        TRAPS_DATA = await res.json();
      } catch (err) {
        console.error("Failed to load traps.json:", err);
        TRAPS_DATA = {
          dc_brackets: {
            very_easy:{min:5,max:9}, easy:{min:10,max:14}, medium:{min:15,max:19},
            hard:{min:20,max:24}, very_hard:{min:25,max:29}, nearly_impossible:{min:30,max:30}
          },
          damage_by_lethality: { low:["1d6","1d8"], medium:["2d6","1d10","1d12"], high:["3d6","2d10","2d12"] },
          default_damage_type_by_tech: { clockwork:"piercing", arcane:"force", nature:"poison" },
          damage_type_keywords: [
            { type:"piercing", keywords:["spear","dart","needle","spike","arrow","bolt","stinger"] },
            { type:"slashing", keywords:["scythe","blade","saw","axe","razor","slicer"] },
            { type:"bludgeoning", keywords:["hammer","mace","club","block","boulder","ram","crush","piston"] },
            { type:"fire", keywords:["fire","flame","burn","scorch"] },
            { type:"cold", keywords:["ice","frost","freezing"] },
            { type:"acid", keywords:["acid","corrode"] },
            { type:"poison", keywords:["poison","toxin","venom","gas"] },
            { type:"lightning", keywords:["lightning","shock","electr"] },
            { type:"force", keywords:["force"] },
            { type:"thunder", keywords:["thunder","sonic","boom"] }
          ]
        };
      }
    })();
    return TRAPS_READY;
  }
  loadTrapsData();

  function pickTrapDC(bracketKey){
    const b = TRAPS_DATA?.dc_brackets?.[bracketKey] || TRAPS_DATA?.dc_brackets?.medium || { min:15, max:19 };
    return randint(b.min, b.max);
  }
  function pickTrapDamageDice(lethality){
    const t = TRAPS_DATA?.damage_by_lethality?.[lethality] || TRAPS_DATA?.damage_by_lethality?.medium || ["2d6"];
    return pick(t);
  }
  function inferTrapDamageType(htmlOrText, tech){
    const s = String(htmlOrText).toLowerCase();
    for (const row of (TRAPS_DATA?.damage_type_keywords || [])) {
      for (const kw of row.keywords) if (s.includes(kw.toLowerCase())) return row.type;
    }
    return (TRAPS_DATA?.default_damage_type_by_tech?.[tech]) || "piercing";
  }
  function appendTrapStats(html, dc, dice, dmgType){
    return String(html) +
      `<div class="trap-stats" style="margin-top:0.4rem;font-size:0.95em;opacity:0.9">
         <em>DC ${dc}</em> — <strong>${dice} ${dmgType}</strong>
       </div>`;
  }

  // Base trap description (kept unchanged)
  function rollTrap(tech, lvl, env) {
    const effectsByTech = {
      clockwork: [
        "a spring-loaded <strong>spear</strong> shoots from the wall",
        "a scythe blade sweeps from a hidden slot",
        "a volley of <strong>darts</strong> fires from the ceiling",
        "a crushing piston slams down from above",
        "spikes snap from the floor"
      ],
      arcane: [
        "a rune detonates in a burst of <strong>fire</strong>",
        "a glyph discharges <strong>lightning</strong> across the corridor",
        "an invisible <strong>force</strong> hammer slams intruders",
        "a freezing pulse coats everything in <strong>ice</strong>",
        "a sigil releases <strong>acid</strong> vapour"
      ],
      nature: [
        "a cloud of <strong>poison</strong> gas fills the chamber",
        "barbed vines lash out from the walls",
        "a hidden pit yawns open, studded with spikes",
        "a swarm of stinging insects erupts from a hollow",
        "a snaring root drags a victim toward thorns"
      ]
    };
    const complexity = pick(["simple","complex"]);
    const effect = pick(effectsByTech[tech] || effectsByTech.clockwork);
    const trigger = pick(["pressure plate","tripwire","magnetic latch","light beam","arcane proximity"]);
    const counter = pick(["wedging the plate","cutting the wire","disarming the latch","covering the sigil","careful stepping"]);
    return [
      `<div><b>${ucfirst(tech)} ${complexity} trap in a ${env}</b>: ${effect}.</div>`,
      `<div><b>Trigger</b>: ${trigger}.</div>`,
      `<div><b>Countermeasure</b>: ${counter}.</div>`,
      `<div><b>Lethality</b>: ${lvl}.</div>`
    ].join("");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NAMES (people-only)  (data: /data/names.json)
  // ─────────────────────────────────────────────────────────────────────────────
  const NAMES_PATH = "/data/names.json";
  let NAMES_DATA = null, NAMES_READY = null;

  function loadNamesData() {
    if (NAMES_READY) return NAMES_READY;
    NAMES_READY = (async () => {
      try {
        const res = await fetch(NAMES_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`Fetch ${NAMES_PATH} → ${res.status}`);
        NAMES_DATA = await res.json();
      } catch (err) {
        console.error("Failed to load names.json:", err);
        NAMES_DATA = {
          schema: "names.people.v1",
          people: {
            human_sken: { male:["Arno","Berrin","Corvin"], female:["Mira","Talia","Vessa"] }
          }
        };
      }
    })();
    return NAMES_READY;
  }
  loadNamesData();

  function pickMany(arr, n) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    if (n >= arr.length) return [...arr].sort(() => Math.random()-0.5).slice(0, n);
    const out = new Set();
    while (out.size < n) out.add(pick(arr));
    return [...out];
  }

  function rollNamesPeople(species, gender, count = 3) {
    const people = NAMES_DATA?.people || {};
    const sp = people[species] ? species : Object.keys(people)[0];
    const g  = (gender === "female" || gender === "male") ? gender : "male";
    const pool = people[sp]?.[g] || [];
    const names = pickMany(pool, count);
    return names.join(", ");
  }

  // ─────────────────────────────────────────────────────────────────────────────
// TREASURE  (data: /data/magic-items.json) — 5e-ish items + coins/gems
// ─────────────────────────────────────────────────────────────────────────────
const MAGIC_PATH = "/data/magic-items.json";
let MAGIC_DATA = null;

// Load magic items JSON once
const MAGIC_READY = (async () => {
  try {
    const res = await fetch(MAGIC_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch ${MAGIC_PATH} → ${res.status}`);
    MAGIC_DATA = await res.json();
  } catch (err) {
    console.error("Failed to load magic-items.json:", err);
    MAGIC_DATA = { items: [] };
  }
})();

// Build rarity buckets from JSON
function getBuckets() {
  const buckets = {
    common: [], uncommon: [], rare: [], "very rare": [], legendary: [], artifact: []
  };
  const items = Array.isArray(MAGIC_DATA?.items) ? MAGIC_DATA.items : [];
  for (const it of items) {
    const r = (it.rarity || "").toLowerCase();
    if (r === "varies") continue; // use explicit +1/+2/+3 entries instead
    if (buckets[r]) buckets[r].push(it);
  }
  return buckets;
}

// Rarity weights per treasure band
// World magic prevalence → rarity weights by treasure tier
// keys match your <select id="treasureLevel"> values
const RARITY_BY_LEVEL = {
  // Special: no magic at all (we short-circuit elsewhere; weights unused)
  levelNone: null,

  // Low-magic world (conservative). No Very Rare at mid.
  levelLow: {
    low:  [ { v: "uncommon",  w: 98 } ],
    mid:  [ { v: "uncommon",  w: 55 }, { v: "rare",      w: 45 } ],
    high: [ { v: "rare",      w: 65 }, { v: "very rare", w: 30 }, { v: "legendary", w: 5 } ],
    epic: [ { v: "very rare", w: 65 }, { v: "legendary", w: 33 }, { v: "artifact",  w: 2 } ]
  },

  // Normal world (balanced default).
  levelNormal: {
    low:  [ { v: "uncommon",  w: 85 }, { v: "rare",      w: 14 }, { v: "very rare", w: 1 } ],
    mid:  [ { v: "uncommon",  w: 55 }, { v: "rare",      w: 38 }, { v: "very rare", w: 7 } ],
    high: [ { v: "rare",      w: 65 }, { v: "very rare", w: 30 }, { v: "legendary", w: 5 } ],
    epic: [ { v: "very rare", w: 65 }, { v: "legendary", w: 33 }, { v: "artifact",  w: 2 } ]
  },

  // High-magic world (spicier).
  levelHigh: {
    low:  [ { v: "uncommon",  w: 70 }, { v: "rare",      w: 28 }, { v: "very rare", w: 2 } ],
    mid:  [ { v: "uncommon",  w: 25 }, { v: "rare",      w: 50 }, { v: "very rare", w: 25 } ],
    high: [ { v: "rare",      w: 30 }, { v: "very rare", w: 50 }, { v: "legendary", w: 20 } ],
    epic: [ { v: "very rare", w: 45 }, { v: "legendary", w: 45 }, { v: "artifact",  w: 10 } ]
  }
};

// Back-compat default if you ever call without a level key:
const RARITY_WEIGHTS = RARITY_BY_LEVEL.levelNormal;

// Hoard coins & counts
const COIN_BANDS = {
  low:  { gp:[  50,  200], sp:[100, 400], cp:[  0, 200] },
  mid:  { gp:[ 200,  800], sp:[200, 800], cp:[  0, 200] },
  high: { gp:[ 800, 3000], sp:[500,2000], cp:[  0, 100] },
  epic: { gp:[3000,10000], sp:[  0,3000], cp:[  0,   0] }
};
const GEM_TABLE    = ["agate","hematite","obsidian","garnet","pearl","amethyst","topaz","emerald shard","ruby sliver","sapphire chip","diamond shard"];
const GEM_COUNTS   = { low:[0,1], mid:[1,4], high:[3,8], epic:[6,12] };
const MAGIC_COUNTS = { 
  low:[0,1],   // ← still 0–1 items (≈50% chance of one)
  mid:[1,2], 
  high:[2,4], 
  epic:[3,6] 
};

// Pick magic items for a band
function rollMagicItemsForBand(band, count, levelKey = "levelNormal") {
  const weights = RARITY_BY_LEVEL[levelKey] || RARITY_WEIGHTS;
  if (!weights) return [];          // levelNone → no magic at all

  const b = getBuckets();
  const out = [];
  for (let i = 0; i < count; i++) {
    let rarity = pickWeighted(weights[band] || weights.mid);
    let pool = b[rarity] || [];
    if (!pool.length) {
      const order = ["common","uncommon","rare","very rare","legendary","artifact"];
      const idx = Math.max(0, order.indexOf(rarity));
      pool = [...order.slice(idx).map(r=>b[r]).flat(), ...order.slice(0,idx).map(r=>b[r]).flat()]
             .filter(Boolean);
    }
    out.push(pick(pool)?.name || "mystery item");
  }
  return out;
}

// Dice helper (e.g., "4d6*10")
function rollDice(expr) {
  if (!expr) return 0;
  const m = /^(\d+)d(\d+)(?:\*(\d+))?$/i.exec(expr);
  if (!m) return 0;
  const n = +m[1], d = +m[2], mult = m[3] ? +m[3] : 1;
  let total = 0;
  for (let i = 0; i < n; i++) total += randint(1, d);
  return total * mult;
}

// Individual treasure: coins by band
const INDIVIDUAL_RULES = {
  // CR feel buckets: 0–4, 5–10, 11–16, 17+
  low:  { cp: "5d6",     sp: "4d6",      gp: "3d6"       }, // small coins
  mid:  {                sp: "4d6*10",   gp: "2d6*10"    }, // more silver, some gold
  high: {                sp: "3d6*10",   gp: "4d6*10", pp: "2d6" }, // mostly gold + some pp
  epic: {                               gp: "8d6*10", pp: "4d6" }  // lots of gold + pp
};

// Chance for magic on individual treasure (per band)
const INDIVIDUAL_MAGIC = {
  low:  { p: 0.10, count: [1, 1] }, // 10% chance; when it triggers → 1 item
  mid:  { p: 0.15, count: [1, 1] }, // 15% chance; when it triggers → 1 item
  high: { p: 0.18, count: [0, 1] }, // 18% chance; when it triggers → 0–1 items (avg 0.5)
  epic: { p: 0.20, count: [0, 1] }  // 20% chance; when it triggers → 0–1 items (avg 0.5)
};

function formatCoins(co) {
  const parts = [];
  if (co.gp) parts.push(`${co.gp} gp`);
  if (co.sp) parts.push(`${co.sp} sp`);
  if (co.cp) parts.push(`${co.cp} cp`);
  if (co.pp) parts.push(`${co.pp} pp`);
  return parts.join(", ") || "—";
}

// Main roller
function rollTreasure(mode, band, levelKey = "levelNormal") {
  // INDIVIDUAL
  if (mode === "individual") {
    const r = INDIVIDUAL_RULES[band] || INDIVIDUAL_RULES.mid;
    const coinsObj = { cp: rollDice(r.cp), sp: rollDice(r.sp), gp: rollDice(r.gp), pp: rollDice(r.pp) };

    let magic = [];
    if (levelKey !== "levelNone") {
      const im = INDIVIDUAL_MAGIC[band] || INDIVIDUAL_MAGIC.mid;
      const n = (Math.random() < im.p) ? randint(im.count[0], im.count[1]) : 0;
      magic = (n > 0 && MAGIC_DATA?.items?.length) ? rollMagicItemsForBand(band, n, levelKey) : [];
    }
    return { mode, band, coins: formatCoins(coinsObj), gems: [], magic };
  }


  // HOARD
  const c = COIN_BANDS[band] || COIN_BANDS.mid;
  const gp = randint(c.gp[0], c.gp[1]);
  const sp = randint(c.sp[0], c.sp[1]);
  const cp = randint(c.cp[0], c.cp[1]);
  const coins = `${gp} gp${sp?`, ${sp} sp`:''}${cp?`, ${cp} cp`:''}`;

  const [gMin,gMax] = GEM_COUNTS[band] || GEM_COUNTS.mid;
  const gemCount = randint(gMin, gMax);
  const gems = Array.from({ length: gemCount }, () => pick(GEM_TABLE));

  let magic = [];
  if (levelKey !== "levelNone") {
    const [mMin,mMax] = MAGIC_COUNTS[band] || MAGIC_COUNTS.mid;
    const magicCount = randint(mMin, mMax);
    magic = (magicCount > 0 && MAGIC_DATA?.items?.length)
      ? rollMagicItemsForBand(band, magicCount, levelKey)
      : [];
  }

  return { mode:"hoard", band, coins, gems, magic };
}

// Render
function renderTreasure(t) {
  if (!t) return "—";
  if (t.mode === "individual") {
    const magic = t.magic?.length ? ` <em>Magic:</em> ${t.magic.join(", ")}` : "";
    return `<div><strong>Individual</strong>: ${t.coins}${magic}</div>`;
  }
  const gems  = t.gems?.length  ? `<div>Gems: ${t.gems.join(", ")}</div>`   : "";
  const magic = t.magic?.length ? `<div>Magic: ${t.magic.join(", ")}</div>` : "";
  return `<div><strong>Hoard</strong> (${t.band}): ${t.coins}${gems}${magic}</div>`;
}


  // ─────────────────────────────────────────────────────────────────────────────
  // DEBUG HELPERS (Weather, Traps, Names, Treasure)
  //   Tip: wrap these in a flag or strip for production
  // ─────────────────────────────────────────────────────────────────────────────
  window.weatherDebug = () =>
    (WEATHER_READY || Promise.resolve()).then(() => {
      const z = WEATHER_DATA?.zones?.[0] || "centre";
      const s = WEATHER_DATA?.seasons?.[0] || "autumn";
      return {
        path: WEATHER_PATH,
        zones: WEATHER_DATA?.zones || [],
        seasons: WEATHER_DATA?.seasons || [],
        sample: rollWeather(z, s)
      };
    });

  window.trapsDebug = () =>
    (TRAPS_READY || Promise.resolve()).then(() => ({
      path: TRAPS_PATH,
      brackets: Object.keys(TRAPS_DATA?.dc_brackets || {}),
      damageBands: Object.keys(TRAPS_DATA?.damage_by_lethality || {}),
      inferSample: (() => {
        const html = "<div>a spring-loaded spear</div>";
        return {
          type: inferTrapDamageType(html, "clockwork"),
          dcMedium: pickTrapDC("medium"),
          diceMedium: pickTrapDamageDice("medium")
        };
      })()
    }));

  window.namesDebug = () =>
    (NAMES_READY || Promise.resolve()).then(() => ({
      path: NAMES_PATH,
      species: Object.keys(NAMES_DATA?.people || {}),
      sample: rollNamesPeople(Object.keys(NAMES_DATA?.people || {human_sken:1})[0], "male", 3)
    }));

  window.magicDebug = () =>
    (MAGIC_READY || Promise.resolve()).then(() => ({
      path: MAGIC_PATH,
      count: MAGIC_DATA?.items?.length || 0,
      sample: MAGIC_DATA?.items?.[0]?.name || null
    }));

  window.rollTreasureDebug = (mode, band) =>
    (MAGIC_READY || Promise.resolve()).then(() => rollTreasure(mode, band));

  // ─────────────────────────────────────────────────────────────────────────────
  // CLICK HANDLER (only Weather, Traps, Names, Treasure)
  // ─────────────────────────────────────────────────────────────────────────────
  document.addEventListener("click", async function(e){
    const btn = e.target.closest("button");
    if (!btn) return;

    switch (btn.id) {
      // Weather
      case "rollWeather": {
        await loadWeatherData();
        const zone = get("#zone")?.value || "centre";
        const season = get("#season")?.value || "autumn";
        setText("#weatherResult", rollWeather(zone, season));
        break;
      }
      case "randWeather": {
        await loadWeatherData();
        const zones = ["far_north","north","centre","south","far_south"];
        const seasons = ["spring","summer","autumn","winter"];
        const z = pick(zones), s = pick(seasons);
        setVal("#zone", z); setVal("#season", s);
        setText("#weatherResult", rollWeather(z, s));
        break;
      }

      // Traps
      case "rollTrap": {
        await loadTrapsData();
        const tech = get("#trapTech")?.value || "clockwork";
        const lvl  = get("#trapLevel")?.value || "medium";
        const env  = get("#trapEnv")?.value || "dungeon";
        const dcKey = get("#trapDcBracket")?.value || "medium";

        const baseHtml = rollTrap(tech, lvl, env);
        const dc   = pickTrapDC(dcKey);
        const dice = pickTrapDamageDice(lvl);
        const dtype = inferTrapDamageType(baseHtml, tech);

        const outEl = get("#trapResult");
        if (outEl) outEl.innerHTML = appendTrapStats(baseHtml, dc, dice, dtype);
        break;
      }
      case "randTrap": {
        await loadTrapsData();
        const tech = pick(["clockwork","arcane","nature"]);
        const lvl  = pick(["low","medium","high"]);
        const env  = pick(["dungeon","tomb","sewer","forest","ruin","lair","temple"]);
        setVal("#trapTech", tech);
        setVal("#trapLevel", lvl);
        setVal("#trapEnv",   env);
        const keys = TRAPS_DATA?.dc_brackets ? Object.keys(TRAPS_DATA.dc_brackets) : ["medium"];
        const dcKey = pick(keys);
        if (get("#trapDcBracket")) setVal("#trapDcBracket", dcKey);

        const baseHtml = rollTrap(tech, lvl, env);
        const dc   = pickTrapDC(dcKey);
        const dice = pickTrapDamageDice(lvl);
        const dtype = inferTrapDamageType(baseHtml, tech);

        const outEl = get("#trapResult");
        if (outEl) outEl.innerHTML = appendTrapStats(baseHtml, dc, dice, dtype);
        break;
      }

      // Names (people only, always 3)
      case "rollName": {
        await loadNamesData();
        const species = get("#nameSpecies")?.value || "human_sken";
        const gender  = get("#nameGender")?.value || "male";
        setText("#nameResult", rollNamesPeople(species, gender, 3));
        break;
      }
      case "randName": {
        await loadNamesData();
        const speciesList = Object.keys(NAMES_DATA?.people || { human_sken:1 });
        const species = pick(speciesList.length ? speciesList : ["human_sken"]);
        const gender  = pick(["male","female"]);
        setVal("#nameSpecies", species);
        setVal("#nameGender", gender);
        setText("#nameResult", rollNamesPeople(species, gender, 3));
        break;
      }

      // Treasure (magic from /data/magic-items.json)
      case "rollTreasure": {
  await MAGIC_READY;
  const mode  = get("#treasureMode")?.value || "hoard";
  const band  = get("#treasureBand")?.value || "mid";
  const level = get("#treasureLevel")?.value || "levelNormal"; // ← NEW
  const t = rollTreasure(mode, band, level);
  const outEl = get("#treasureResult");
  if (outEl) outEl.innerHTML = renderTreasure(t);
  break;
}
case "randTreasure": {
  await MAGIC_READY;
  const mode  = pick(["hoard","individual"]);
  const band  = pick(["low","mid","high","epic"]);
  setVal("#treasureMode", mode);
  setVal("#treasureBand", band);
  const level = get("#treasureLevel")?.value || "levelNormal"; // keep user's world level; don't randomize
  const t = rollTreasure(mode, band, level);
  const outEl = get("#treasureResult");
  if (outEl) outEl.innerHTML = renderTreasure(t);
  break;
}
    }
  });
})();
