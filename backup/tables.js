/* tables.js — JSON-driven Weather, Traps, Treasure (5e-ish via /data/magic-items.json)
   Single IIFE so everything shares scope with the click handler.
*/
(function () {
  // ---------- Utilities ----------
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

  // ===========================================
  // WEATHER: /data/weather.json
  // ===========================================
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

  // ===========================================
  // TRAPS add-ons: /data/traps.json → DC + damage (typed)
  // ===========================================
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

  // ===========================================
  // TREASURE: /data/magic-items.json (5e SRD items list)
  // ===========================================
  const MAGIC_PATH = "/data/magic-items.json";
  let MAGIC_DATA = null;
  // Promise used by click-handler to wait for items
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

  // Build rarity buckets from JSON (once loaded)
  function getBuckets() {
    const buckets = {
      common: [], uncommon: [], rare: [], "very rare": [], legendary: [], artifact: [], varies: []
    };
    const items = Array.isArray(MAGIC_DATA?.items) ? MAGIC_DATA.items : [];
    for (const it of items) {
      const r = (it.rarity || "varies").toLowerCase();
      if (buckets[r]) buckets[r].push(it);
      else buckets.varies.push(it);
    }
    // Treat "varies" as uncommon by default for rolling
    if (buckets.varies.length) buckets.uncommon = buckets.uncommon.concat(buckets.varies);
    return buckets;
  }

  // 5e-ish rarity weights per treasure band (tunable)
  const RARITY_WEIGHTS = {
    low: [
      { v: "common",     w: 20 },
      { v: "uncommon",   w: 70 },
      { v: "rare",       w: 10 }
    ],
    mid: [
      { v: "uncommon",   w: 40 },
      { v: "rare",       w: 45 },
      { v: "very rare",  w: 15 }
    ],
    high: [
      { v: "rare",       w: 45 },
      { v: "very rare",  w: 40 },
      { v: "legendary",  w: 15 }
    ],
    epic: [
      { v: "very rare",  w: 45 },
      { v: "legendary",  w: 45 },
      { v: "artifact",   w: 10 }
    ]
  };

  // Coin/gem counts per band (simple but serviceable)
  const COIN_BANDS = {
    low:  { gp:[5,30],  sp:[20,120], cp:[50,200] },
    mid:  { gp:[50,150], sp:[100,300], cp:[200,600] },
    high: { gp:[200,600], sp:[300,900], cp:[500,1500] },
    epic: { gp:[800,2000], sp:[1200,3000], cp:[2000,6000] }
  };
  const GEM_TABLE = ["agate","hematite","obsidian","garnet","pearl","amethyst","topaz","emerald shard","ruby sliver","sapphire chip","diamond shard"];

  function rollMagicItemsForBand(band, count){
    const buckets = getBuckets();
    const rar = pickWeighted(RARITY_WEIGHTS[band] || RARITY_WEIGHTS.mid);
    const pool = buckets[rar] && buckets[rar].length ? buckets[rar] : [].concat(
      buckets.uncommon, buckets.rare, buckets["very rare"], buckets.legendary, buckets.artifact
    );
    const out = [];
    for (let i=0; i<count; i++){
      out.push(pick(pool)?.name || "mystery item");
    }
    return out;
  }

  function rollTreasure(mode, band) {
    // Individual: just coins (5e style), no magic rolls
    if (mode === "individual") {
      const gp = randint(2,12), sp = randint(5,30), cp = randint(10,60);
      return { mode, band, coins: `${gp} gp, ${sp} sp, ${cp} cp`, gems: [], magic: [] };
    }

    // Hoard
    const c = COIN_BANDS[band] || COIN_BANDS.mid;
    const gp = randint(c.gp[0], c.gp[1]);
    const sp = randint(c.sp[0], c.sp[1]);
    const cp = randint(c.cp[0], c.cp[1]);

    // Simple gem count scaling by band
    const gemCount = band === "low" ? randint(0,1) :
                     band === "mid" ? randint(1,3) :
                     band === "high" ? randint(2,6) : randint(4,10);
    const gems = Array.from({length: gemCount}, () => pick(GEM_TABLE));

    // Magic item count per band (lightweight 5e-ish feel)
    const magicCount = band === "low" ? randint(0,1) :
                       band === "mid" ? randint(0,2) :
                       band === "high" ? randint(1,3) : randint(2,4);
    const magic = magicCount > 0 && Array.isArray(MAGIC_DATA?.items) && MAGIC_DATA.items.length
      ? rollMagicItemsForBand(band, magicCount)
      : [];

    const coinStr = `${gp} gp, ${sp} sp, ${cp} cp`;
    return { mode:"hoard", band, coins: coinStr, gems, magic };
  }

  function renderTreasure(t) {
    if (!t) return "—";
    if (t.mode === "individual") {
      return `<div><strong>Individual</strong>: ${t.coins}</div>`;
    }
    const gems = t.gems?.length ? `<div>Gems: ${t.gems.join(", ")}</div>` : "";
    const magic = t.magic?.length ? `<div>Magic: ${t.magic.join(", ")}</div>` : "";
    return `<div><strong>Hoard</strong> (${t.band}): ${t.coins}${gems}${magic}</div>`;
  }

  // ======================================================
  // Other generators (kept compact so page works end-to-end)
  // ======================================================
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
    return `<div><strong>${ucfirst(tech)}</strong> ${complexity} trap in a ${env}: ${effect}. Trigger: ${trigger}. Countermeasure: ${counter}. Lethality: ${lvl}.</div>`;
  }

  function rollTravel(terrain, season) {
    const travelEvents = {
      plains:["open fields","rolling grass","herds in the distance","dusty road"],
      forest:["dense trees","birdsong","patchy light","sporey undergrowth"],
      hills:["rocky rises","loose scree","hidden gullies","sheer cuts"],
      mountains:["snowy passes","ice ledges","howling winds","narrow ledges"],
      swamp:["sucking mud","stagnant pools","biting insects","rotting logs"],
      desert:["blazing sun","mirage haze","sand stings","dry wadis"],
      tundra:["bitter winds","ice crust","drifted snow","frozen rivers"],
      coast:["salt spray","slick rocks","gulls overhead","kelp tangles"],
      jungle:["thick vines","humid haze","riot of color","sudden squalls"],
      urban:["crowded streets","market noise","patrol routes","narrow alleys"]
    };
    const seasonTwists = {
      spring:["muddy ground","nesting beasts","bursting blooms"],
      summer:["heat haze","thunderclouds","overgrowth"],
      autumn:["fallen leaves","early frost","migrant flocks"],
      winter:["ice patches","short daylight","snowfall"]
    };
    return `${ucfirst(terrain)} in ${season}: ${pick(travelEvents[terrain]||travelEvents.plains)}; ${pick(seasonTwists[season]||seasonTwists.autumn)}; ${pick(["easy going","slow going","hazardous footing"])}.`;
  }

  function rollRoad(type, time) {
    const features = {
      civilized:["waystones","farm carts","militia patrol","roadside shrine"],
      frontier:["trapper camp","bridge out","fallen tree","closed toll"],
      wild:["ambush blind","washed-out ford","ancient marker","beast tracks"]
    };
    const risks = time==="night" ? ["poor visibility","noisy travel","predators active"]
                                 : ["crowded segments","watchful eyes","tolls collected"];
    return `${ucfirst(type)} road by ${time}: ${pick(features[type]||features.frontier)}; ${pick(risks)}.`;
  }

  function rollNames(type, culture, count) {
    const bank = {
      person_any:["Tamsin","Corin","Avel","Jarek","Mira","Rook","Selene","Brann","Kaia","Doran"],
      inn:["The Golden Stag","The Crooked Spoon","The Drunken Drake","The Lantern & Lute","The Sleeping Fox"],
      boat:["Sea Wren","Storm Dancer","Aurora","Black Gull","River Song"],
      band:["Iron Comet","Gallows Laugh","The Ember Ring","Wolfshead Company","The Verdant Blades"]
    };
    const out = [];
    for (let i=0;i<count;i++) out.push(pick(bank[type]||bank.person_any));
    return out.join(", ");
  }

  function rollTavern(mood, wealth) {
    const drinks = { poor:["small beer","thin wine","turnip stew"], average:["ale","hearty stew","mead","meat pie"], fine:["spiced wine","venison pie","imported brandy"] };
    const scene = pick(["quiet conversation","rowdy dice game","tense standoff","bards tuning up","merchants haggling"]);
    return `${ucfirst(wealth)} tavern, ${mood}: ${scene}; specialty: ${pick(drinks[wealth]||drinks.average)}.`;
  }

  // ===========================================
  // Unified click listener
  // ===========================================
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

      // Travel
      case "rollTravel": {
        const t = get("#travTerrain")?.value || "plains";
        const s = get("#travSeason")?.value || "autumn";
        setText("#travelResult", rollTravel(t, s));
        break;
      }
      case "randTravel": {
        const terrains = ["plains","forest","hills","mountains","swamp","desert","tundra","coast","jungle","urban"];
        const seasons = ["spring","summer","autumn","winter"];
        const t = pick(terrains), s = pick(seasons);
        setVal("#travTerrain", t); setVal("#travSeason", s);
        setText("#travelResult", rollTravel(t, s));
        break;
      }

      // Road
      case "rollRoad": {
        const r = get("#roadType")?.value || "civilized";
        const t = get("#roadTime")?.value || "day";
        setText("#roadResult", rollRoad(r, t));
        break;
      }
      case "randRoad": {
        const r = pick(["civilized","frontier","wild"]);
        const t = pick(["day","night"]);
        setVal("#roadType", r); setVal("#roadTime", t);
        setText("#roadResult", rollRoad(r, t));
        break;
      }

      // Traps (append DC + damage; base generator unchanged)
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

      // Names
      case "rollName": {
        const type = get("#nameType")?.value || "person_any";
        const culture = get("#nameCulture")?.value || "common";
        const count = Math.max(1, Math.min(10, parseInt(get("#nameCount")?.value || "3", 10)));
        setText("#nameResult", rollNames(type, culture, count));
        break;
      }
      case "randName": {
        const type = pick(["person_any","inn","boat","band"]);
        const culture = pick(["common","calarium","kuthan","dargav","oldkaijistan","northlands"]);
        const count = randint(1,5);
        setVal("#nameType", type); setVal("#nameCulture", culture); setVal("#nameCount", String(count));
        setText("#nameResult", rollNames(type, culture, count));
        break;
      }

      // Tavern
      case "rollTavern": {
        const mood = get("#tavernMood")?.value || "quiet";
        const wealth = get("#tavernWealth")?.value || "average";
        setText("#tavernResult", rollTavern(mood, wealth));
        break;
      }
      case "randTavern": {
        const mood = pick(["quiet","rowdy","tense"]);
        const wealth = pick(["poor","average","fine"]);
        setVal("#tavernMood", mood); setVal("#tavernWealth", wealth);
        setText("#tavernResult", rollTavern(mood, wealth));
        break;
      }

      // Treasure (JSON-driven magic via /data/magic-items.json)
      case "rollTreasure": {
        await MAGIC_READY; // ensure items are loaded
        const mode = get("#treasureMode")?.value || "hoard";
        const band = get("#treasureBand")?.value || "mid";
        const t = rollTreasure(mode, band);
        const outEl = get("#treasureResult");
        if (outEl) outEl.innerHTML = renderTreasure(t);
        break;
      }
      case "randTreasure": {
        await MAGIC_READY;
        const mode = pick(["hoard","individual"]);
        const band = pick(["low","mid","high","epic"]);
        setVal("#treasureMode", mode); setVal("#treasureBand", band);
        const t = rollTreasure(mode, band);
        const outEl = get("#treasureResult");
        if (outEl) outEl.innerHTML = renderTreasure(t);
        break;
      }
    }
  });
})();
