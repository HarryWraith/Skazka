/* ===========================================
   tables.js — Skazka RPG Generators
   Weather • Travel • Road • Traps • Names • Tavern • Treasure
=========================================== */
(function () {
  // ---------- Utilities ----------
  const randint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[randint(0, arr.length - 1)];
  function pickWeighted(items) {
    const total = items.reduce((n, it) => n + (it.w || 0), 0);
    let r = Math.random() * total;
    for (const it of items) { r -= (it.w || 0); if (r <= 0) return it.v; }
    return items[items.length - 1].v;
  }
  const ucfirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const get = (sel) => document.querySelector(sel);
  const setText = (sel, txt) => { const o = get(sel); if (o) o.textContent = txt; };
  const setVal  = (sel, val) => { const el = get(sel); if (el) el.value = val; };

  // =========================================================
  // MAGIC ITEMS LOADER (JSON-driven)
  // =========================================================
  let MAGIC = { items: [], quirks: {} };
  let INDEX = {
    byRarity: new Map(),
    byType: new Map(),
    byRarityType: new Map(),
  };

  // normalizers so lookups are consistent
  function normType(t = 'wondrous') {
    t = String(t).toLowerCase().trim();
    if (t === 'wondrous item') t = 'wondrous';
    if (t === 'ammunition') t = 'ammo';
    return t;
  }
  function normRarity(r = 'uncommon') { return String(r).toLowerCase().trim(); }

  function indexMagic() {
    INDEX = { byRarity: new Map(), byType: new Map(), byRarityType: new Map() };
    for (const raw of MAGIC.items || []) {
      const it = {
        ...raw,
        type: normType(raw.type),
        rarity: normRarity(raw.rarity),
        attunement: !!raw.attunement,
      };
      Object.assign(raw, it); // keep normalized fields visible to callers

      if (!INDEX.byRarity.has(it.rarity)) INDEX.byRarity.set(it.rarity, []);
      INDEX.byRarity.get(it.rarity).push(raw);

      if (!INDEX.byType.has(it.type)) INDEX.byType.set(it.type, []);
      INDEX.byType.get(it.type).push(raw);

      const key = `${it.rarity}|${it.type}`;
      if (!INDEX.byRarityType.has(key)) INDEX.byRarityType.set(key, []);
      INDEX.byRarityType.get(key).push(raw);
    }
  }

  let MAGIC_READY;
  async function loadMagic() {
    const PATHS = ['data/magic-items.json', 'data/magic-items.json']; // prefer /data
    for (const url of PATHS) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        MAGIC = await res.json();
        indexMagic();
        return true;
      } catch (_e) { /* try next path */ }
    }
    console.warn('[magic] no magic-items.json found; proceeding with empty catalog');
    MAGIC = { items: [], quirks: {} };
    indexMagic();
    return false;
  }
  MAGIC_READY = loadMagic();

  // helpers to pick items from the catalog
  function pickMagicItem({ rarity, types }) {
    const rar = normRarity(rarity || 'uncommon');
    const tlist = (types && types.length) ? types.map(normType) : null;

    if (tlist) {
      let pools = [];
      for (const t of tlist) {
        const arr = INDEX.byRarityType.get(`${rar}|${t}`);
        if (arr && arr.length) pools = pools.concat(arr);
      }
      if (pools.length) return pick(pools);
    }
    const byR = INDEX.byRarity.get(rar) || [];
    if (byR.length) return pick(byR);
    return (MAGIC.items && MAGIC.items.length) ? pick(MAGIC.items) : null;
  }

  function quirkFor(item) {
    const t = normType(item?.type || 'generic');
    const pool = (MAGIC.quirks && (MAGIC.quirks[t] || MAGIC.quirks.generic)) || [];
    return pool.length ? pick(pool) : null;
  }

  // =========================================================
  // WEATHER
  // =========================================================
  const TEMP_RANGES_C = {
    far_north: { winter: [-35,-10], spring: [-15,3],  summer: [0,12],   autumn: [-20,2] },
    north:     { winter: [-15,3],   spring: [0,12],   summer: [12,25],  autumn: [2,12] },
    centre:    { winter: [2,12],    spring: [8,20],   summer: [20,32],  autumn: [10,22] },
    south:     { winter: [8,16],    spring: [15,25],  summer: [26,36],  autumn: [16,26] },
    far_south: { winter: [24,33],   spring: [25,34],  summer: [26,35],  autumn: [25,34] },
  };
  function rollTemp(zone, season){
    const range = TEMP_RANGES_C[zone]?.[season] || [10, 20];
    return randint(range[0], range[1]);
  }
  function tempTokenFromC(tC) {
    if (tC <= -20) return "very cold";
    if (tC <= -5)  return "cold";
    if (tC <= 3)   return "chilly";
    if (tC <= 12)  return "cool";
    if (tC <= 19)  return "mild";
    if (tC <= 27)  return "warm";
    if (tC <= 34)  return "hot";
    return "very hot";
  }
  const SKY = {
    far_north: {
      spring: [["overcast",4],["mist",2],["partly",1]],
      summer: [["clear",3],["partly",3],["hazy",1],["overcast",1],["mist",1]],
      autumn: [["overcast",4],["partly",2],["mist",2]],
      winter: [["overcast",5],["fog",1],["mist",2]],
    },
    north: {
      spring: [["partly",3],["overcast",2],["mist",1]],
      summer: [["sunny",3],["partly",3],["hazy",1],["overcast",1]],
      autumn: [["overcast",3],["partly",2],["mist",1]],
      winter: [["overcast",4],["fog",1],["mist",2]],
    },
    centre: {
      spring: [["partly",3],["sunny",2],["overcast",1]],
      summer: [["sunny",5],["hazy",2],["partly",2],["overcast",1]],
      autumn: [["partly",2],["overcast",3],["mist",1]],
      winter: [["overcast",3],["partly",2],["fog",1]],
    },
    south: {
      spring: [["sunny",3],["partly",2],["hazy",1]],
      summer: [["sunny",6],["hazy",2],["partly",1]],
      autumn: [["partly",2],["sunny",2],["overcast",1]],
      winter: [["overcast",2],["partly",2],["sunny",1],["mist",1]],
    },
    far_south: {
      spring: [["sunny",3],["hazy",2],["partly",1]],
      summer: [["overcast",2],["partly",2],["hazy",1]],
      autumn: [["overcast",2],["partly",2],["hazy",1]],
      winter: [["sunny",3],["hazy",2],["partly",1]],
    },
  };
  const PRECIP = {
    far_north: {
      spring: [["light_snow",2],["sleet",2],["light_rain",2],["showers",1],["none",1]],
      summer: [["none",4],["drizzle",2],["showers",2],["light_rain",1]],
      autumn: [["light_rain",3],["showers",3],["sleet",2],["light_snow",1],["none",1]],
      winter: [["snow",4],["light_snow",3],["blizzard",1],["sleet",2]],
    },
    north: {
      spring: [["showers",3],["light_rain",2],["none",2]],
      summer: [["none",4],["showers",2],["light_rain",1],["thunder",1]],
      autumn: [["light_rain",3],["showers",3],["none",1]],
      winter: [["light_snow",3],["snow",2],["sleet",2],["light_rain",1]],
    },
    centre: {
      spring: [["showers",3],["light_rain",2],["none",2]],
      summer: [["none",5],["showers",2],["thunder",1],["light_rain",1]],
      autumn: [["light_rain",3],["showers",3],["none",1]],
      winter: [["light_rain",3],["showers",2],["drizzle",1],["none",2]],
    },
    south: {
      spring: [["showers",2],["none",3],["light_rain",1]],
      summer: [["none",6],["showers",1],["thunder",1]],
      autumn: [["showers",2],["thunder",2],["none",2],["light_rain",1]],
      winter: [["light_rain",3],["showers",2],["none",2]],
    },
    far_south: {
      spring: [["none",4],["showers",2],["light_rain",1]],
      summer: [["downpour",2],["thunder",3],["showers",2],["rain",1]],
      autumn: [["downpour",2],["thunder",3],["showers",2],["rain",1]],
      winter: [["none",4],["showers",2],["light_rain",1]],
    },
  };
  const WIND = {
    far_north: {
      spring: [["windy",3],["breezy",3],["light",1]],
      summer: [["breezy",3],["light",3],["windy",1]],
      autumn: [["windy",3],["breezy",3],["light",1]],
      winter: [["windy",3],["gale",1],["breezy",2]],
    },
    north: {
      spring: [["breezy",3],["light",2],["windy",1]],
      summer: [["light",3],["breezy",3],["windy",1]],
      autumn: [["breezy",3],["windy",2],["light",1]],
      winter: [["windy",2],["breezy",3],["light",1]],
    },
    centre: {
      spring: [["breezy",2],["light",3],["windy",1]],
      summer: [["light",3],["breezy",3],["windy",1]],
      autumn: [["breezy",2],["light",3],["windy",1]],
      winter: [["light",3],["breezy",2],["windy",1]],
    },
    south: {
      spring: [["light",3],["breezy",2],["windy",1]],
      summer: [["light",3],["breezy",3],["windy",1]],
      autumn: [["breezy",2],["light",3],["windy",1]],
      winter: [["windy",2],["breezy",2],["light",2]],
    },
    far_south: {
      spring: [["light",3],["breezy",2],["windy",1]],
      summer: [["breezy",2],["windy",2],["light",2]],
      autumn: [["breezy",2],["windy",2],["light",2]],
      winter: [["light",3],["breezy",2],["windy",1]],
    },
  };
  function adjustPrecipForTemp(precip, tC){
    if (precip === "none") return "none";
    if (tC <= -12 && (precip === "snow" || precip === "light_snow") && Math.random()<0.2) return "blizzard";
    if (tC <= -2){
      if (["rain","light_rain","drizzle","showers"].includes(precip)) return "light_snow";
      return precip;
    }
    if (tC > -2 && tC <= 1){
      if (["rain","light_rain","drizzle","showers"].includes(precip)) return "sleet";
      return precip;
    }
    if (tC >= 2 && ["light_snow","snow","blizzard"].includes(precip)) return "light_rain";
    return precip;
  }
  function rollWeather(zone, season){
    const tC = rollTemp(zone, season);
    let sky = pickWeighted(SKY[zone][season].map(([v,w])=>({v,w})));
    let precip = pickWeighted(PRECIP[zone][season].map(([v,w])=>({v,w})));
    let wind = pickWeighted(WIND[zone][season].map(([v,w])=>({v,w})));
    precip = adjustPrecipForTemp(precip, tC);
    if (precip !== "none" && (sky === "sunny" || sky === "clear")) sky = "overcast";
    const desc = tempTokenFromC(tC);
    const skyMap = {clear:"clear skies",sunny:"bright sun",hazy:"hazy sunshine",partly:"partial cloud",overcast:"overcast",mist:"mist in the air",fog:"thick fog"};
    const prMap  = {none:"",drizzle:"light drizzle",light_rain:"light rain",showers:"the odd shower",rain:"steady rain",downpour:"a heavy downpour",thunder:"thunderstorms",light_snow:"light snow",snow:"snow",blizzard:"blizzard conditions",sleet:"sleet"};
    const windMap= {calm:"calm",light:"a light breeze",breezy:"breezy",windy:"windy",gale:"gale-force winds"};
    const skyTxt = skyMap[sky]||"";
    const prTxt  = prMap[precip]||"";
    const windTxt= windMap[wind]||"";
    let core;
    if (prTxt){
      const lead = [desc, windTxt && windTxt!=="calm" ? `and ${windTxt}`:""].filter(Boolean).join(" ");
      core = `${lead} with ${prTxt}`;
    } else {
      core = [desc, skyTxt?`with ${skyTxt}`:"", windTxt && windTxt!=="calm"?`and ${windTxt}`:""].filter(Boolean).join(" ");
    }
    core = core.replace(/\s+/g," ").trim();
    return `Today: ${tC}°C — ${ucfirst(core)}.`;
  }

  // =========================================================
  // TRAVEL COMPLICATIONS
  // =========================================================
  const TRAVEL_BASE = {
    plains: ["a washed-out ford stalls wagons","crosswinds make riding tiring","dust devils harry the column","wide detour around a noble’s hunt","waypost burned; no fresh water here","freshly ploughed field blocks the track","migrating herd churns the ground to mud","torn pennant on a mile-stone—someone warns of bandits","stretch of rutted road snaps an axle unless slowed","carpet of thistles shreds boots"],
    forest: ["fallen oak blocks the path; cutting through costs hours","boar-wallows; mud sucks at wheels","fey lights mislead; a Wisdom (Survival) check avoids a loop","gnarled roots trip mounts; riders must dismount","wolf prints and a reek of musk; detour recommended","bridge of woven vines sways alarmingly","carpet of mushrooms stains boots and stinks","sap-gnats bite; exposed skin welts and itches","old hunter snares tug at ankles","deadfall creaks above the way"],
    hills: ["sodden slope; carts must be lightened","sheer chalk face collapses underfoot","sheep flock floods the trail, blocking passage","hidden sinkhole drops a mule to the chest","loess dust blinds for a minute on the ridge","narrow terrace forces single-file for an hour","way cairns are scattered; route-finding slows","boggy clay pan ahead; skirt wide or risk wheels","looters picked clean a way shrine; locals angry","fresh landslip scars the hillside"],
    mountains: ["rockslide scours the path; rubble knee-deep","cornice threatens an avalanche—keep wide","rope bridge missing planks; cross one at a time","thin air saps strength; frequent rests needed","hand-span ledge: one wrong step is a fall","angry goats refuse to yield the path","black ice lingers in shadowed switchbacks","snow tunnel collapsed; cut stairs through","thunder echoes; loose stones tumble","mossy slab tilts under weight—cart nearly tips"],
    swamp: ["peaty mire swallows a wheel to the hub","leeches infest the shallows; stop to salt them off","boardwalk rotted through; rebuild or wade","miasma thickens; masks or scarves advised","hidden channel; footing vanishes suddenly","sedge cuts at ankles; blood draws insects","plank ferry is on the far side—bang a gong to summon","dead trees lean; one collapses across the trail","drift of pollen chokes; sneezing fit slows all","rumble of distant thunder; water rises visibly"],
    desert: ["shimmering heat haze hides a bend in the dunes","sand crust breaks; cart bogs to the axle","whispering dust steals voices; signals only","stinging grit flays faces; scarves required","dry well; last mark on map was wrong","mirage lake lures off-course","scorpion colony under a flat stone at camp","wind carves dune over the old marker","sun-baked bones mark a bad route","night chill demands cloaks; exhausted mounts shiver"],
    tundra: ["drifted snow covers crevasses; probe or risk a fall","whiteout; rope up or lose each other","ice fog crusts lashes; visibility is yards only","sastrugi rips at boot soles","pack pin breaks in the cold; lash with rawhide","polar fox trails the party yapping","sea ice booms; cracks spiderweb outward","dead-flat light hides ridges; move slowly","aurora distracts mounts; they balk","wind-carved snow masks cairns"],
    coast: ["tide floods the causeway; wait or risk a swim","slick weed on rocks; a fall drenches gear","sea-mist soaks fletching; bows underperform","cliff path is half-fallen; crawl or find a goat track","gulls mob the camp; food loss unless covered","fisher’s net sprawled over the path snags ankles","fresh cliff-fall blocks the underpath","storm surge flings driftwood across the road","brackish pool hides urchins; step carefully","salty spray corrodes buckles and mail"],
    jungle: ["lianas snag packs; progress is halved","downpour sheets; vision is a few yards","ants swarm boots; stop to brush or take bites","rotting log bridge sags into a stream","steaming air exhausts quickly; extra water required","flowering tree showers choking pollen","leopard scat on trail; singing recommended","leeched stream crossing adds blood loss","thorn curtains bar the intended route","fruit falls like stones; one dents a helm"],
    urban: ["market day jams the streets; an hour to cross","procession blocks the square; detour through alleys","new toll at the bridge demands coin or paperwork","paving torn up for repairs; carts must be hand-carried","watch checkpoint searches packs","festival streamers tangle in gear","street brawl spills across your way","rival crews fight over a bottleneck","open sewer trench forces a stink-filled detour","cobblestones slick with night rain"]
  };
  const TRAVEL_SEASON_OVERLAYS = {
    spring: ["meltwater swells every ford","mud sucks at boots; progress is slow","showers turn tracks into slick clay","unseasonal hail peppers the road"],
    summer: ["heat demands frequent rests","biting flies harry the slow","distant thunder hints at a sudden storm","dust coats tongues and tempers"],
    autumn: ["fallen leaves hide holes and snare feet","gales buffet the exposed","early dusk shortens safe travel","cold rain sours spirits"],
    winter: ["ice crusts puddles; hooves slip","drifts hide the roadside","breath freezes at whiskers and lashes","black ice patches threaten a tumble"]
  };
  function rollTravel(terrain, season){
    const base = TRAVEL_BASE[terrain] || TRAVEL_BASE.plains;
    const overlay = TRAVEL_SEASON_OVERLAYS[season] || [];
    const a = pick(base), b = Math.random()<0.6 ? ` Also, ${pick(overlay)}.` : "";
    return ucfirst(`${a}${b}`) + (b ? "" : ".");
  }

  // =========================================================
  // ROAD EVENTS
  // =========================================================
  const ROAD_EVENTS = {
    civilized: ["tax collectors argue over tariffs; step in or slip by","merchant caravan with a broken axle seeks help","patrol inspects travel papers and asks a few questions","pilgrims sing a hymn and offer bread","street performers draw a crowd that blocks your way","press-gang eyes strong arms for ‘city service’","local lord’s hunt crosses the road—halt or be fined","wagon overturned; crates of pottery everywhere","tollgate demands coin; the writ looks forged","grieving procession passes; hats off or be scowled at"],
    frontier:  ["refugees trudge past; rumors of raiders","burned coach; tracks vanish into scrub","scouts warn of wolves shadowing the road","traders share stew in exchange for news","shrine keeper requests a candle be lit","bridge planks missing; someone sabotaged it","rumbling cart of ore groans down a hill","smoke column on the horizon; a homestead aflame","bandit lookout stone with scratched warnings","strange footprints cross the road—three-toed, deep"],
    wild:      ["dead horse picked clean; buzzards watch","standing stones hum; hair rises on arms","abandoned campsite with still-warm ashes","ambush site: piled rocks and good cover","sudden silence—predator near","a rain of frogs spatters the path","two crows follow, cawing at junctions","freshly felled tree exactly blocks the way","old gallows tree creaks; a charm dangles","glow-worms sketch a word along the ditch"]
  };
  function rollRoad(roadType, time){
    let scene = pick(ROAD_EVENTS[roadType] || ROAD_EVENTS.civilized);
    if (time === "night"){
      const nightTwists = ["lanterns gutter in a cold gust","someone whistles twice from the dark","distant howl interrupts the talk","shapes move beyond the hedgerow","a lone lamp bobs, then goes out"];
      scene += ` At night: ${pick(nightTwists)}.`;
    } else {
      scene += ".";
    }
    return ucfirst(scene);
  }

  // =========================================================
  // TRAPS (multiline output)
  // =========================================================
  const TRIGGER = {
    clockwork: ["pressure plate clicks","tripwire goes taut","false tread drops","magnet latch releases","weight sensor under chest lid engages"],
    arcane:    ["inscribed glyph flares","whispered word completes a ward","invisible rune is crossed","eye-sigil blinks open","silence field breaks like glass"],
    nature:    ["snare loop tightens","deadfall releases","thornvine whip is tugged","camouflaged pit mouth gives way","spore puff erupts"]
  };
  const TELL = {
    clockwork: ["hairline seams around a tile","faint ticking behind the panel","scratches where wire saws have bitten","dust-free square on the floor","grease smear near a hinge"],
    arcane:    ["sootless stones amid soot-stained floor","ozone tang on the air","chalky scrawl half-rubbed out","faint glimmer under angled light","a whisper that repeats the last word said"],
    nature:    ["freshly cut sapling stump","disturbed leaf-litter in a ring","unnatural stillness of birds","twisted cord half-buried under moss","fine sand sprinkled across a patch"]
  };
  const EFFECT = {
    clockwork: { low:["poison needle prick","ankle-biter spikes","dart stings from the wall"], medium:["swinging scythe blade","bolt launcher hisses","spring-spear jabs the ribs"], high:["crushing wall segment","spike-bed drop","triple-bolt burst to the chest"] },
    arcane:    { low:["sleep gas mist","gluey restraint","blinding flash"], medium:["thunder clap in a cone","freezing blast","binding rune shackles ankles"], high:["fire gout down the corridor","necrotic pulse","banishing shove into a warded cell"] },
    nature:    { low:["thorn lash to shins","stinging nettle cascade","sticky sap that hardens"], medium:["pit drop onto roots","deadfall log slam","snare hoist hangs upside down"], high:["spike pit with infected stakes","rolling boulder from a chute","crushing cage of woven trunks"] }
  };
  const DISARM = {
    clockwork: ["jam the mechanism with a piton","wedge a coin to hold the latch","cut the tripwire close to anchor","unscrew the faceplate carefully","weight the plate with sandbags first"],
    arcane:    ["scrub or break the rune line","counter-word softly spoken","ground the sigil with iron filings","dispel or cover with wet canvas","pour salt in a ring to contain it"],
    nature:    ["cut the snare above the knot","brace the deadfall with a stout branch","fill the pit mouth with brush then cross","trim the trigger twig; do not pull","burn off the sap with a quick flame"]
  };
  function rollTrap(tech, level, env){
    const trig = pick(TRIGGER[tech] || TRIGGER.clockwork);
    const tell = pick(TELL[tech] || TELL.clockwork);
    const eSet = EFFECT[tech] && EFFECT[tech][level] ? EFFECT[tech][level] : EFFECT.clockwork.medium;
    const effect = pick(eSet);
    const fix = pick(DISARM[tech] || DISARM.clockwork);
    const envTwist = {
      tomb: " Bones rattle when disturbed.",
      sewer: " The air is foul; failed checks risk sickness.",
      forest: " Birds explode from cover when it springs.",
      ruin: " Dust clouds mark where it’s bitten before.",
      lair: " Gnawed scraps lie nearby.",
      temple: " A sanctum bell rings when triggered."
    }[env] || "";
    return [
      `<div class="tb-line"><span class="tb-label">Type:</span>${ucfirst(tech)}</div>`,
      `<div class="tb-line"><span class="tb-label">Trigger:</span>${trig}.</div>`,
      `<div class="tb-line"><span class="tb-label">Tell:</span>${tell}.</div>`,
      `<div class="tb-line"><span class="tb-label">Effect:</span>${effect}.</div>`,
      `<div class="tb-line"><span class="tb-label">Disarm:</span>${fix}.${envTwist}</div>`
    ].join("");
  }

  // =========================================================
  // NAMES
  // =========================================================
  const NAME_PARTS = {
    common: {
      first: ["Sable","Ilya","Marek","Anya","Piotr","Brina","Doran","Elka","Tomas","Vera","Yurii","Kasia","Silas","Luka","Mira","Nadia","Radan","Sorcha","Viktor","Yana","Petra","Rurik","Ilse","Gregor","Sera","Talia","Ivan","Oksana","Milos","Rhea","Karina","Galen","Soren","Lyra","Iskra","Kaz","Danica","Andrej","Darya","Havel","Nikol","Raisa","Stefan"],
      lastA: ["Black","Crow","Frost","Grave","Iron","Mire","Night","Raven","Stone","Thorn","Winter","Ash","Storm","Wolf","Oak","Gold","Dust","Grim","Hearth","Hollow","Vetch","Moss","Reed","Vale"],
      lastB: ["born","hand","holt","song","ward","kin","field","ridge","wood","fall","mark","bane","water","forge","watch","keep","well","barrow","bloom","salt"],
      innAdj: ["Black","Gilded","Crooked","Sunken","Sleeping","Prancing","Three","Silver","Copper","Laughing","Bleeding","Wyrm’s","Cursed","Quiet","Raven’s","Golden","Blue","Dusty","Broken","Howling"],
      innNoun:["Stag","Crown","Lantern","Cauldron","Gull","Bell","Hearth","Pig","Star","Rose","Sword","Swan","Moth","Anvil","Thistle","Hound","Witch","Anchor","Kettle","Wheel"],
      boatAdj:["Grey","Swift","Northern","Drowned","Star","Brine","Storm","Pale","River","Sea","Salt","Low","High","Lucky","Bold","Black"],
      boatNoun:["Gull","Eel","Otter","Marten","Seal","Maiden","Lark","Pike","Kestrel","Skiff","Dawn","Serpent","Comet","Heron","Voyager","Nymph"],
      bandAdj:["Red","Grey","Iron","Free","Silent","Merry","Grim","Wandering","Oathbound","Seven","Lantern"],
      bandNoun:["Blades","Hands","Company","Sisters","Pilgrims","Crows","Wardens","Dogs","Knives","Lanterns","Spears"]
    },
    calarium: {
      first: ["Aelius","Marcia","Cassian","Lucia","Severin","Flavia","Tavian","Sabina","Octavian","Livia","Quint","Vesta","Remus","Daria","Juno","Valen","Maelia","Corvin","Serra","Aquila"],
      lastA: ["Amber","River","Gold","Marble","Falcon","Laurel","Sun","Vine","Candle","Bell"],
      lastB: ["crest","gate","galli","vale","reach","mar","port","dom","heart","walk"]
    },
    kuthan: {
      first: ["Zorya","Milan","Radek","Ivana","Bozha","Stanimir","Mira","Dragomir","Eliska","Mileva","Zdena","Mirko","Tatiana","Boleslav","Petar","Milena","Svetla","Radan","Vlado","Bela"],
      lastA: ["Snow","Grim","Crow","Ash","Bog","Moon","Witch","Thunder","Gray","Hollow"],
      lastB: ["vich","ova","ska","nik","ov","enko","ova","ic","ovich","ska"]
    },
    dargav: {
      first: ["Oleg","Marta","Yegor","Vasilisa","Bogdan","Raisa","Fyodor","Anfisa","Timur","Galina","Nikolai","Katya","Stas","Varya","Sasha","Polina","Ivan","Irina","Lada","Rurik"],
      lastA: ["Grave","Cairn","Mourn","Crow","Bone","Skull","Pine","Raven","Frost","Ash"],
      lastB: ["walker","keep","cairn","watch","born","ward","stone","fall","mark","song"]
    },
    oldkaijistan: {
      first: ["Jahan","Sahir","Leila","Parvin","Azar","Soraya","Rostam","Anahita","Kaveh","Dara","Yasmin","Bahram","Farah","Shirin","Arman","Cyrus","Ramin","Laleh","Naveed","Kian"],
      lastA: ["Jade","Saffron","Opal","Ivory","Cedar","Desert","Falcon","Moon","Star","Silk"],
      lastB: ["bazar","vand","far","ani","pour","zadeh","nar","yar","zade","shah"]
    },
    northlands: {
      first: ["Egil","Astrid","Leif","Sigrid","Torvald","Inga","Rurik","Yrsa","Halvar","Solveig","Bjorn","Freya","Ivar","Ingrid","Hakon","Kari","Sten","Liv","Gunnar","Runa"],
      lastA: ["Ice","Bear","Rime","Storm","Dark","Wolf","Snow","Sea","Stone","Fjord"],
      lastB: ["son","sdottir","ward","mark","helm","watch","bloom","fell","fjord","strand"]
    }
  };
  const makeSurname = (culture) => {
    const set = NAME_PARTS[culture] || NAME_PARTS.common;
    return pick(set.lastA) + pick(set.lastB);
  };
  const makeFirst = (culture) => (NAME_PARTS[culture] || NAME_PARTS.common).first[randint(0, (NAME_PARTS[culture] || NAME_PARTS.common).first.length - 1)];
  const makePerson = (culture) => `${makeFirst(culture)} ${makeSurname(culture)}`;
  const makeInn = (culture)=>{ const s = NAME_PARTS[culture] || NAME_PARTS.common; return `${pick(s.innAdj)} ${pick(s.innNoun)}`; };
  const makeBoat = (culture)=>{ const s = NAME_PARTS[culture] || NAME_PARTS.common; return (Math.random()<0.4?`The `:``) + `${pick(s.boatAdj)} ${pick(s.boatNoun)}`; };
  const makeBand = (culture)=>{ const s = NAME_PARTS[culture] || NAME_PARTS.common; return `${pick(s.bandAdj)} ${pick(s.bandNoun)}`; };
  function rollNames(type, culture, count){
    const out = [];
    for (let i=0;i<count;i++){
      out.push(type==="inn" ? makeInn(culture)
        : type==="boat"    ? makeBoat(culture)
        : type==="band"    ? makeBand(culture)
        : makePerson(culture));
    }
    return out.join("\n");
  }

  // =========================================================
  // TAVERN (mood + wealth overlays)
  // =========================================================
  const TAVERN = {
    base: [
      "dice clatter; a cheer goes up from a back table",
      "a minstrel starts a melancholy ballad",
      "a traveling merchant opens a case of curios",
      "the hearth pops; a log tumbles out, scattering sparks",
      "a server spills ale; tempers flare then cool",
      "a hooded patron studies you over a chipped cup",
      "a stray dog noses under tables for scraps",
      "someone passes a hat for a sick child",
      "two farmers argue about a boundary stone",
      "a toast to the local lord meets mixed response",
      "the brewer himself delivers a fresh barrel",
      "a card sharp invites newcomers to sit ‘for small stakes’",
      "rain starts hammering the shutters",
      "a courier arrives breathless, looking for ‘any sellswords’",
      "the innkeep hangs a new notice on the post",
      "a traveling priest blesses the room with salt and smoke",
      "birthday cake is cut; a slice is pressed into your hands",
      "someone lost a ring; a reward is offered for a finder",
      "a street peddler sells charms ‘guaranteed against curses’",
      "a ragged minstrel offers a tale for coin",
      "barmaids practice a clapped rhythm; the room joins in",
      "a child chases a goose right through the taproom",
      "the stew runs out; the chef improvises a second pot",
      "a sleepy cat claims your chair the moment you stand"
    ],
    mood: {
      quiet: ["low talk and nods from regulars","cards slap gently on wood","the fire is the loudest thing here","mugs clink; the hour stretches"],
      rowdy: ["a brawl brews over a crooked game","someone starts a drinking song—off-key, loud","a knife thunks into the bar to silence an argument","the watch peeks in, then moves on quickly"],
      tense: ["hushed argument stalls as you enter","hoods up; too many eyes watch the door","a back-room meeting breaks up abruptly","someone checks the shutters twice"]
    },
    wealth: {
      poor: ["ale is thin but warm","potato stew again—generous but plain","patched cloaks and rough hands fill the room"],
      average: ["roast smells drift from the kitchen","fresh bread arrives; steam fogs the panes","a fiddler saws out a local reel"],
      fine: ["silver cups ring softly on the table","spiced wine perfumes the air","a well-dressed duelist laughs too loud"]
    },
    hooks: [
      "An anxious patron offers coin to find a missing mule.",
      "A sealed letter must reach the next town by dawn.",
      "A cellar rat ‘the size of a dog’ keeps stealing loaves.",
      "Someone saw lights in the barrow field—investigate tonight?",
      "The innkeep suspects a thief among the staff.",
      "A caravan seeks guards for a dawn departure.",
      "Rumor: the bridge is out; a hidden ford might still be passable.",
      "A crestfallen bard begs help recovering a stolen lute.",
      "A gambler owes the wrong people; needs an escort to pay up.",
      "A ‘ghost’ rings the tavern bell each midnight."
    ]
  };
  function rollTavern(mood, wealth) {
    const pools = [TAVERN.base];
    if (TAVERN.mood[mood]) pools.push(TAVERN.mood[mood]);
    if (TAVERN.wealth[wealth]) pools.push(TAVERN.wealth[wealth]);
    const bits = [];
    bits.push(pick(pools[randint(0, pools.length-1)]));
    if (Math.random() < 0.55) bits.push(pick(pools[randint(0, pools.length-1)]));
    const scene = ucfirst(bits.filter(Boolean).join(". ") + ".");
    const hook = Math.random() < 0.4 ? " Hook: " + pick(TAVERN.hooks) : "";
    return scene + hook;
  }

  // =========================================================
  // TREASURE (coins • valuables • magic from magic-items.json)
  // =========================================================
  const GEM_NAMES = ["agate","carnelian","amber","jade","turquoise","malachite","moonstone","bloodstone","onyx","quartz","amethyst","garnet","pearl","opal","topaz","sapphire","emerald","ruby"];
  const ART_OBJECTS = [
    "silver-chased goblet","engraved signet ring","golden brooch with enamel petals","ivory statuette","fine silk tapestry","jeweled circlet","carved jade mask","etched mirror in silver frame","vellum manuscript with illuminations","ornate reliquary"
  ];

  function rollCoins(mode, band){
    const mult = { low:1, mid:2, high:4, epic:7 }[band] || 1;
    if (mode === 'individual'){
      const cp = randint(2, 12) * mult;
      const sp = randint(3, 18) * mult;
      const gp = randint(1, 8) * mult;
      const pp = Math.random()<0.15 ? randint(1, 4) * (mult>1?mult-1:0) : 0;
      return { cp, sp, gp, pp };
    } else {
      const cp = randint(20, 200) * mult;
      const sp = randint(50, 600) * mult;
      const gp = randint(80, 1200) * mult;
      const pp = randint(0, 60) * Math.max(1, Math.floor(mult/2));
      return { cp, sp, gp, pp };
    }
  }

  function rollValuables(mode, band){
    const rolls = (mode === 'individual')
      ? randint(0, {low:1, mid:2, high:2, epic:3}[band] || 1)
      : randint({low:1, mid:2, high:3, epic:4}[band] || 1, {low:2, mid:4, high:6, epic:8}[band] || 2);

    const out = [];
    for (let i=0; i<rolls; i++){
      if (Math.random() < 0.6) {
        const name = pick(GEM_NAMES);
        const v = {low:[10,50], mid:[25,100], high:[100,500], epic:[250,1000]}[band] || [10,50];
        const val = randint(v[0], v[1]);
        out.push(`${ucfirst(name)} (${val} gp)`);
      } else {
        const obj = pick(ART_OBJECTS);
        const v = {low:[25,100], mid:[100,250], high:[250,750], epic:[500,2500]}[band] || [25,100];
        const val = randint(v[0], v[1]);
        out.push(`${ucfirst(obj)} (${val} gp)`);
      }
    }
    return out;
  }

  function pickRarityForBand(band){
    const map = {
      low:  [{v:'common', w:70},{v:'uncommon', w:30}],
      mid:  [{v:'uncommon', w:60},{v:'rare', w:40}],
      high: [{v:'rare', w:70},{v:'very rare', w:30}],
      epic: [{v:'very rare', w:70},{v:'legendary', w:30}]
    };
    return pickWeighted(map[band] || map.mid);
  }

  function typesForBand(band){
    switch (band){
      case 'low':  return ['potion','scroll','wondrous','weapon'];
      case 'mid':  return ['potion','scroll','wondrous','ring','weapon','armor','rod','staff','wand'];
      case 'high': return ['wondrous','ring','weapon','armor','rod','staff','wand','scroll'];
      case 'epic': return ['wondrous','ring','weapon','armor','rod','staff','wand'];
      default:     return ['wondrous','potion','scroll'];
    }
  }

  function rollMagic(mode, band){
    let count = 0;
    if (mode === 'individual') {
      const p = {low:0.12, mid:0.25, high:0.33, epic:0.4}[band] || 0.25;
      if (Math.random() < p) count = 1;
    } else {
      const ranges = { low:[0,2], mid:[1,3], high:[2,4], epic:[3,5] };
      const [a,b] = ranges[band] || [1,3];
      count = randint(a,b);
    }

    const items = [];
    for (let i=0; i<count; i++){
      const rarity = pickRarityForBand(band);
      const types = typesForBand(band);
      const item = pickMagicItem({ rarity, types });
      if (item) {
        const q = quirkFor(item);
        items.push({ item, quirk: q });
      }
    }
    return items;
  }

  function renderTreasure(t){
    const coins = [];
    if (t.coins.cp) coins.push(`${t.coins.cp} cp`);
    if (t.coins.sp) coins.push(`${t.coins.sp} sp`);
    if (t.coins.gp) coins.push(`${t.coins.gp} gp`);
    if (t.coins.pp) coins.push(`${t.coins.pp} pp`);

    const lines = [];
    lines.push(`<div class="tb-line"><span class="tb-label">Coins:</span>${coins.length ? coins.join(", ") : "—"}</div>`);

    if (t.valuables && t.valuables.length){
      lines.push(`<div class="tb-line"><span class="tb-label">Valuables:</span>${t.valuables.join("; ")}</div>`);
    } else {
      lines.push(`<div class="tb-line"><span class="tb-label">Valuables:</span>—</div>`);
    }

    if (t.magic && t.magic.length){
      const rendered = t.magic.map(({item, quirk})=>{
        const attn = item.attunement ? " (attunement)" : "";
        const qtxt = quirk ? ` — <em>${quirk}</em>` : "";
        return `${item.name} — ${ucfirst(item.rarity)} ${ucfirst(item.type)}${attn}${qtxt}`;
      });
      lines.push(`<div class="tb-line"><span class="tb-label">Magic:</span>${rendered.join("<br>")}</div>`);
    } else {
      lines.push(`<div class="tb-line"><span class="tb-label">Magic:</span>—</div>`);
    }

    return lines.join("");
  }

  function rollTreasure(mode, band){
    const coins = rollCoins(mode, band);
    const valuables = rollValuables(mode, band);
    const magic = rollMagic(mode, band);
    return { coins, valuables, magic };
  }

  // =========================================================
  // EVENT DELEGATION — one listener for the whole page
  // =========================================================
  document.addEventListener("click", async function(e){
    const btn = e.target.closest("button");
    if (!btn) return;

    switch (btn.id) {
      // Weather
      case "rollWeather": {
        const zone = get("#zone")?.value || "centre";
        const season = get("#season")?.value || "autumn";
        setText("#weatherResult", rollWeather(zone, season));
        break;
      }
      case "randWeather": {
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

      // Traps
      case "rollTrap": {
        const tech = get("#trapTech")?.value || "clockwork";
        const lvl  = get("#trapLevel")?.value || "medium";
        const env  = get("#trapEnv")?.value || "dungeon";
        const outEl = get("#trapResult");
        if (outEl) outEl.innerHTML = rollTrap(tech, lvl, env);
        break;
      }
      case "randTrap": {
        const tech = pick(["clockwork","arcane","nature"]);
        const lvl  = pick(["low","medium","high"]);
        const env  = pick(["dungeon","tomb","sewer","forest","ruin","lair","temple"]);
        setVal("#trapTech", tech);
        setVal("#trapLevel", lvl);
        setVal("#trapEnv",   env);
        const outEl = get("#trapResult");
        if (outEl) outEl.innerHTML = rollTrap(tech, lvl, env);
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

      // Treasure — wait for magic-items.json to be loaded
      case "rollTreasure": {
        await MAGIC_READY;
        const mode = get("#treasureMode")?.value || "hoard";
        const band = get("#treasureBand")?.value || "mid";
        const t = rollTreasure(mode, band);
        const out = renderTreasure(t);
        const outEl = get("#treasureResult");
        if (outEl) outEl.innerHTML = out;
        break;
      }
      case "randTreasure": {
        await MAGIC_READY;
        const mode = pick(["hoard","individual"]);
        const band = pick(["low","mid","high","epic"]);
        setVal("#treasureMode", mode); setVal("#treasureBand", band);
        const t = rollTreasure(mode, band);
        const out = renderTreasure(t);
        const outEl = get("#treasureResult");
        if (outEl) outEl.innerHTML = out;
        break;
      }
    }
  });

  // (no extra loadMagic() call here; MAGIC_READY already kicked off)

})();
