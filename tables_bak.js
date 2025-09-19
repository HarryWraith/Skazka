/* tables.js — JSON-driven generators
   Generators kept: Weather, Traps (v3), Treasure, Names, Encounters (v3)
   Removed: Travel, Road, Tavern (to be rebuilt later)
*/
(function () {
  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITIES (shared)
  // ─────────────────────────────────────────────────────────────────────────────
  const randint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[randint(0, arr.length - 1)];

  // Generic weighted picker: array of { v, w } or { type, w }. Returns a value.
  // NOTE: Used for treasure rarity too (weights may be > 20 there), so no clamping.
  function pickWeighted(items) {
    const total = items.reduce((n, it) => n + (Number(it.w) || 0), 0);
    if (!total)
      return items.length ? items[0].v ?? items[0].type ?? items[0] : null;
    let r = Math.random() * total;
    for (const it of items) {
      r -= Number(it.w) || 0;
      if (r <= 0) return it.v ?? it.type ?? it;
    }
    const last = items[items.length - 1];
    return last.v ?? last.type ?? last;
  }

  const ucfirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const get = (sel) => document.querySelector(sel);
  const setText = (sel, txt) => {
    const o = get(sel);
    if (o) o.textContent = txt;
  };
  const setHTML = (sel, html) => {
    const o = get(sel);
    if (o) o.innerHTML = html;
  };
  const setVal = (sel, val) => {
    const el = get(sel);
    if (el) el.value = val;
  };
  const rollBetween = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  // ─────────────────────────────────────────────────────────────────────────────
  // WEATHER  (data: /data/weather.json)
  // ─────────────────────────────────────────────────────────────────────────────
  const WEATHER_PATH = "/data/weather.json";
  let WEATHER_DATA = null,
    WEATHER_READY = null;

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
          zones: ["centre"],
          seasons: ["autumn"],
          temperature: { centre: { autumn: { min: 5, max: 12 } } },
          conditions: { centre: { autumn: [{ v: "overcast", w: 1 }] } },
        };
      }
    })();
    return WEATHER_READY;
  }
  loadWeatherData();

  function rollWeather(zone, season) {
    if (!WEATHER_DATA) return "Weather loading…";
    const z = WEATHER_DATA.temperature[zone] ? zone : WEATHER_DATA.zones[0];
    const s = WEATHER_DATA.temperature[z][season]
      ? season
      : WEATHER_DATA.seasons[0];
    const tband = WEATHER_DATA.temperature[z][s];
    const temp = rollBetween(tband.min, tband.max);
    const condition = pickWeighted(WEATHER_DATA.conditions[z][s]);
    return `${ucfirst(condition)}. High around ${temp}°C.`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TRAPS v3  (data: /data/traps.json)
  //   - trap types: mechanical, magical, environmental
  //   - split DCs: detect, disarm, save
  //   - areas, status effects (riders), utility (non-damage) traps
  //   - triggers + countermeasures + reset + clues
  //   - alarms, env bias, weighted damage distributions per type
  // ─────────────────────────────────────────────────────────────────────────────
  const TRAPS_PATH = "/data/traps.json";
  let TRAPS_DATA = null,
    TRAPS_READY = null;

  function loadTrapsData() {
    if (TRAPS_READY) return TRAPS_READY;
    TRAPS_READY = (async () => {
      try {
        const res = await fetch(TRAPS_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`Fetch ${TRAPS_PATH} → ${res.status}`);
        TRAPS_DATA = await res.json();
      } catch (err) {
        console.error("Failed to load traps.json:", err);
        // Minimal sensible fallback to keep UI working
        TRAPS_DATA = {
          schema: "traps.v3",
          trap_types: ["mechanical", "magical", "environmental"],
          dc_brackets: {
            detect: { medium: { min: 15, max: 19 } },
            disarm: { medium: { min: 15, max: 19 } },
            save: { medium: { min: 15, max: 19 } },
          },
          damage_by_lethality: { low: ["1d6"], medium: ["2d6"], high: ["4d6"] },
          default_damage_type_by_type: {
            mechanical: "bludgeoning",
            magical: "fire",
            environmental: "bludgeoning",
          },
          damage_type_distribution_by_type: {
            mechanical: [{ type: "bludgeoning", w: 1 }],
            magical: [{ type: "fire", w: 1 }],
            environmental: [{ type: "bludgeoning", w: 1 }],
          },
          damage_type_keywords: [
            { type: "bludgeoning", keywords: ["crush", "block", "falling"] },
          ],
          save_types: ["DEX"],
          areas: [{ v: "single target", w: 1 }],
          status_effects: [],
          triggers: [
            { v: "pressure plate", w: 1, counter: ["careful stepping"] },
          ],
          reset_modes: [{ v: "manual reset only", w: 1 }],
          clues: ["hairline seam"],
          alarm: {
            chance_by_type: {
              mechanical: 0.25,
              magical: 0.35,
              environmental: 0.2,
            },
            effects: [{ v: "bells ring", w: 1 }],
          },
          utility_effects: [
            {
              t: "dense **smoke** fills the space ({area})",
              tags: ["environmental", "CON"],
            },
          ],
          effects_by_type: {
            mechanical: [
              { t: "a **block** falls ({area})", tags: ["bludgeoning", "DEX"] },
            ],
          },
          env_tags: {},
        };
      }
    })();
    return TRAPS_READY;
  }
  loadTrapsData();

  // ——— v3 Helpers ————————————————————————————————————————————————
  const pickAlt = (s) => (s && s.includes("|") ? pick(s.split("|")) : s);

  function pickDC(cat = "save", bracketKey = "medium") {
    const b = TRAPS_DATA?.dc_brackets?.[cat]?.[bracketKey] ||
      TRAPS_DATA?.dc_brackets?.save?.medium || { min: 15, max: 19 };
    return randint(b.min, b.max);
  }
  function pickTrapDamageDice(lethality) {
    const t = TRAPS_DATA?.damage_by_lethality?.[lethality] ||
      TRAPS_DATA?.damage_by_lethality?.medium || ["2d6"];
    return pick(t);
  }
  function pickArea() {
    const a = pickWeighted(TRAPS_DATA.areas);
    return a?.v ?? a;
  }
  function pickStatusEffect(key) {
    const pool = TRAPS_DATA.status_effects || [];
    if (!pool.length) return null;
    const k = String(key || "").toLowerCase();
    const weighted = pool.map((r) => {
      const tags = new Set((r.tags || []).map((t) => String(t).toLowerCase()));
      return { v: r.v, w: (r.w || 1) + (tags.has(k) ? 2 : 0) };
    });
    return pickWeighted(weighted);
  }
  function pickTriggerAndCounter() {
    const t = pickWeighted(TRAPS_DATA.triggers);
    const counter = pick(t.counter || ["careful work"]);
    return { trigger: t.v ?? t, counter };
  }
  function envBiasSet(env) {
    const tags = TRAPS_DATA.env_tags?.[env] || [];
    return new Set(tags.map((s) => s.toLowerCase()));
  }
  // Updated to v3 defaults (uses default_damage_type_by_type)
  function inferTrapDamageType(htmlOrText, trapType) {
    const s = String(htmlOrText).toLowerCase();
    for (const row of TRAPS_DATA?.damage_type_keywords || []) {
      for (const kw of row.keywords)
        if (s.includes(String(kw).toLowerCase())) return row.type;
    }
    return TRAPS_DATA?.default_damage_type_by_type?.[trapType] || "bludgeoning";
  }
  function chooseDamageType({ trapType, effectTag, env, effectText }) {
    // 1) template tag wins
    const tagged =
      effectTag &&
      (effectTag.includes("|") ? pick(effectTag.split("|")) : effectTag);
    if (tagged) return tagged;

    // 2) type distribution, nudged by env tags
    const bias = envBiasSet(env);
    const dist = TRAPS_DATA.damage_type_distribution_by_type?.[trapType];
    if (Array.isArray(dist) && dist.length) {
      const weighted = dist.map((row) => {
        const t = (row.type || row.v || "").toLowerCase();
        const bonus = bias.has(t) ? 2 : 0;
        return { v: row.type || row.v, w: (row.w || 1) + bonus };
      });
      return pickWeighted(weighted);
    }

    // 3) keyword inference from composed text
    const inferred = inferTrapDamageType(effectText || "", trapType);
    if (inferred) return inferred;

    // 4) fallback
    return "bludgeoning";
  }
  function normalizeTrapType(input) {
    const x = String(input || "").toLowerCase();
    if (["clockwork", "mechanical"].includes(x)) return "mechanical";
    if (["arcane", "magical", "magic"].includes(x)) return "magical";
    if (["nature", "environment", "environmental"].includes(x))
      return "environmental";
    return "mechanical";
  }

  // ——— v3 Core generator + renderer ————————————————————————————————
  function rollTrapV3({ type, lethality, env, dcBracket = "medium" }) {
    const trapType = normalizeTrapType(type);

    const utilityChance =
      lethality === "low" ? 0.25 : lethality === "medium" ? 0.12 : 0.08;
    const isUtility = Math.random() < utilityChance;

    const table = isUtility
      ? TRAPS_DATA.utility_effects || []
      : TRAPS_DATA.effects_by_type?.[trapType] ||
        TRAPS_DATA.effects_by_type?.mechanical ||
        [];

    const chosen = pick(table);
    const area = pickArea();

    const tag0 = (chosen.tags && chosen.tags[0]) || ""; // damage tag(s)
    const tag1 = (chosen.tags && chosen.tags[1]) || "DEX"; // save tag(s)

    // Damage type (skip for utility)
    let dtype = null;
    if (!isUtility) {
      const effectPreview = (chosen.t || "").replace("{area}", area);
      dtype = chooseDamageType({
        trapType,
        effectTag: tag0,
        env,
        effectText: effectPreview,
      });
    }

    const save = pickAlt(tag1);

    // Trigger/counter, reset, clue
    const { trigger, counter } = pickTriggerAndCounter();
    const resetPick = pickWeighted(TRAPS_DATA.reset_modes);
    const reset = resetPick?.v ?? resetPick;
    const clue = pick(TRAPS_DATA.clues || []);

    // Damage dice & optional status
    const dice = !isUtility ? pickTrapDamageDice(lethality) : null;

    let status = null;
    if (isUtility || Math.random() < 0.5) {
      const s = pickStatusEffect(dtype || trapType);
      status = s ? s.v || s : null;
    }

    // DCs
    const dcs = {
      detect: pickDC("detect", dcBracket),
      disarm: pickDC("disarm", dcBracket),
      save: pickDC("save", dcBracket),
    };

    // Alarm
    const alarmChance = TRAPS_DATA.alarm?.chance_by_type?.[trapType] ?? 0.25;
    const alarmed = Math.random() < alarmChance;
    const aPick = alarmed ? pickWeighted(TRAPS_DATA.alarm.effects) : null;
    const alarm_text = aPick ? aPick.v ?? aPick : null;

    // Effect text
    const effectText = (chosen.t || "")
      .replace("{area}", area)
      .replace("{dtype}", dtype || "");

    return {
      type: trapType,
      env,
      lethality,
      isUtility,
      effect: effectText,
      area,
      damage: !isUtility && dtype && dice ? { dice, type: dtype } : null,
      status,
      save,
      trigger,
      countermeasure: counter,
      reset,
      clue,
      dcs,
      alarmed,
      alarm_text,
    };
  }

  function renderTrapV3(t) {
    const parts = [];
    const savePart = t.save ? ` (${t.save})` : "";

    parts.push(
      `<div><b>${ucfirst(t.type)} ${t.lethality} trap in a ${t.env}</b>: ${
        t.effect
      }.</div>`
    );
    parts.push(`<div><b>Area</b>: ${t.area}.</div>`);
    parts.push(`<div><b>Trigger</b>: ${t.trigger}.</div>`);
    parts.push(`<div><b>Clue</b>: ${t.clue}.</div>`);
    parts.push(`<div><b>Countermeasure</b>: ${t.countermeasure}.</div>`);
    parts.push(`<div><b>Reset</b>: ${t.reset}.</div>`);
    if (t.damage)
      parts.push(
        `<div><b>On hit</b>: <strong>${t.damage.dice} ${t.damage.type}</strong>.</div>`
      );
    if (t.status) parts.push(`<div><b>Effect</b>: ${t.status}.</div>`);

    // — New: three separate lines with your exact labels —
    parts.push(`<div><b>Avoid save DC</b>: ${t.dcs.save}${savePart}</div>`);
    parts.push(`<div><b>Detection DC</b>: ${t.dcs.detect}</div>`);
    parts.push(`<div><b>Disarm DC</b>: ${t.dcs.disarm}</div>`);

    if (t.alarmed)
      parts.push(
        `<div><b>Alarmed</b>: ${t.alarm_text || "an alarm is triggered"}.</div>`
      );
    return parts.join("");
  }

  //shop helpers
  function clampShopResult(maxRows = 10) {
    const out = document.querySelector("#shopResult");
    const table = out?.querySelector("table");
    if (!out || !table) return;

    // Wait for layout to settle (fonts, etc.)
    requestAnimationFrame(() => {
      const theadH = table.tHead
        ? table.tHead.getBoundingClientRect().height
        : 0;
      const firstRow = table.tBodies?.[0]?.rows?.[0];
      let rowH = firstRow ? firstRow.getBoundingClientRect().height : 0;

      // Fallback estimate if we couldn't measure a row
      if (!rowH) {
        const fs = parseFloat(getComputedStyle(table).fontSize) || 14;
        rowH = fs * 2.4;
      }

      const borderH = 2; // tiny buffer
      const max = Math.round(theadH + rowH * maxRows + borderH);
      out.style.setProperty("--shop-max", `${max}px`);
      out.style.overflow = "auto";
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOORS (data: /data/doors.json)
  // ─────────────────────────────────────────────────────────────────────────────
  const DOORS_PATH = "/data/doors.json";
  let DOORS_DATA = null,
    DOORS_READY = null;

  function loadDoorsData() {
    if (DOORS_READY) return DOORS_READY;
    DOORS_READY = (async () => {
      try {
        const res = await fetch(DOORS_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`Fetch ${DOORS_PATH} → ${res.status}`);
        DOORS_DATA = await res.json();
      } catch (err) {
        console.error("Failed to load doors.json:", err);
        // Minimal fallback so UI still works
        DOORS_DATA = {
          schema: "doors.v1",
          dc_brackets: {
            very_easy: { min: 5, max: 9 },
            easy: { min: 10, max: 14 },
            medium: { min: 15, max: 19 },
            hard: { min: 20, max: 24 },
          },
          lock_types: [
            { v: "std door key", w: 1 },
            { v: "no lock", w: 1 },
          ],
          lock_qualities: [{ v: "common", w: 1 }],
          locked_weights_by_type: {
            "std door key": [
              { v: true, w: 1 },
              { v: false, w: 1 },
            ],
            "no lock": [{ v: "", w: 1 }],
          },
          locked_from_weights: [
            { v: "this side", w: 7 },
            { v: "other side", w: 3 },
          ],
          lockpick_possible_weights_by_quality: { common: [{ v: true, w: 1 }] },
          lockpick_dc_by_quality: { common: "easy" },
          materials: [{ v: "softwood", hp: [10, 14], break_dc: "easy" }],
          trap_chance: { true: 10, false: 90 },
          damage_effect: { hp_multiplier: 0.5, dc_modifier: -3 },
          obstruction_examples: ["furniture shoved against it"],
        };
      }
    })();
    return DOORS_READY;
  }

  function doorPickDC(bracketKey) {
    const b = DOORS_DATA?.dc_brackets?.[bracketKey] || { min: 15, max: 19 };
    return randint(b.min, b.max);
  }

  function pickWeightedObj(items) {
    const total = items.reduce((n, it) => n + (Number(it.w) || 0), 0);
    if (!total) return items[0];
    let r = Math.random() * total;
    for (const it of items) {
      r -= Number(it.w) || 0;
      if (r <= 0) return it; // return full object
    }
    return items[items.length - 1];
  }

  function rollDoor() {
    // 1) Lock type
    const lockTypePick = pickWeighted(DOORS_DATA.lock_types);
    const lockType = lockTypePick.v ?? lockTypePick;

    // 2) Material → base HP & Break DC (use object-preserving picker)
    const matObj = pickWeightedObj(DOORS_DATA.materials);
    const material = matObj.v ?? matObj;
    const baseHP = randint(matObj.hp[0], matObj.hp[1]);
    let hp = baseHP;
    let breakDC = doorPickDC(matObj.break_dc);

    // 3) Damage state (10/90). If damaged: half HP and -3 to DCs.
    const isDamaged = pickWeighted([
      { v: true, w: 10 },
      { v: false, w: 90 },
    ]);
    if (isDamaged) {
      const mult = DOORS_DATA.damage_effect?.hp_multiplier ?? 0.5;
      const mod = DOORS_DATA.damage_effect?.dc_modifier ?? -3;
      hp = Math.max(1, Math.floor(hp * mult));
      breakDC = Math.max(0, breakDC + mod);
    }

    // 4) Trapped? (uses trap_chance)
    const isTrapped = pickWeighted([
      { v: true, w: DOORS_DATA.trap_chance?.true ?? 10 },
      { v: false, w: DOORS_DATA.trap_chance?.false ?? 90 },
    ]);

    // 5) Locked / quality / pickable
    const hasLock = lockType !== "no lock" && lockType !== "obstruction";

    // Locked?
    const lockedWeights = DOORS_DATA.locked_weights_by_type?.[lockType] || [
      { v: hasLock ? true : "", w: 1 },
    ];
    const locked = pickWeighted(lockedWeights); // true | false | "" (blank when no lock/obstruction)

    // Locked from (70/30) — blank if not locked
    let lockedFrom = "";
    if (locked === true) {
      const lfPick = pickWeighted(DOORS_DATA.locked_from_weights);
      lockedFrom = lfPick.v ?? lfPick; // "this side" | "other side"
    }

    // Lock quality (blank if no lock/obstruction)
    let lockQuality = "";
    if (hasLock) {
      const lqPick = pickWeighted(DOORS_DATA.lock_qualities);
      lockQuality = lqPick.v ?? lqPick;
    }

    // Lockpick possible (boolean)
    let lockpickPossible = false;
    if (hasLock) {
      const lpW = DOORS_DATA.lockpick_possible_weights_by_quality?.[
        lockQuality
      ] || [{ v: true, w: 1 }];
      const lpPick = pickWeighted(lpW);
      lockpickPossible = !!(lpPick.v ?? lpPick);
    }

    // Lockpick DC (blank if no lock / not pickable)
    let lockpickDC = "";
    if (hasLock && lockpickPossible) {
      const bracket =
        DOORS_DATA.lockpick_dc_by_quality?.[lockQuality] || "medium";
      lockpickDC = doorPickDC(bracket);

      // Apply damage modifier (if any)
      if (isDamaged) {
        lockpickDC = Math.max(
          0,
          lockpickDC + (DOORS_DATA.damage_effect?.dc_modifier ?? -3)
        );
      }

      // NEW: harder to pick if locked from OTHER SIDE
      if (locked === true && lockedFrom === "other side") {
        const otherSideMod = DOORS_DATA.other_side_lockpick_modifier ?? 3; // configurable; defaults to +3
        lockpickDC = Math.max(0, lockpickDC + otherSideMod);
      }
    }

    // 6) Obstruction note
    let obstructionNote = "";
    if (lockType === "obstruction") {
      obstructionNote = pick(DOORS_DATA.obstruction_examples || []);
    }

    return {
      lock_type: lockType,
      locked,
      locked_from: lockedFrom || "",
      lock_quality: hasLock ? lockQuality : "",
      material,
      hp,
      break_dc: breakDC,
      lockpick_possible: hasLock ? lockpickPossible : false,
      lockpick_dc: hasLock && lockpickPossible ? lockpickDC : "",
      is_trapped: isTrapped,
      is_damaged: isDamaged,
      notes: obstructionNote,
    };
  }

  function renderDoor(d) {
    const lines = [];
    lines.push(`<div>material: ${ucfirst(d.material)}</div>`);
    lines.push(`<div>lock type: ${d.lock_type || ""}</div>`);
    lines.push(`<div>locked: ${d.locked === "" ? "" : d.locked}</div>`);
    lines.push(
      `<div>locked from: ${d.locked === true ? d.locked_from || "" : ""}</div>`
    );
    lines.push(`<div>lock quality: ${d.lock_quality || ""}</div>`);
    lines.push(`<div>hp: ${d.hp}</div>`);
    lines.push(`<div>break dc: ${d.break_dc}</div>`);
    lines.push(
      `<div>lockpick possible: ${d.lockpick_possible ? "true" : "false"}</div>`
    );
    lines.push(`<div>lockpick dc: ${d.lockpick_dc || ""}</div>`);
    lines.push(`<div>is trapped: ${d.is_trapped ? "true" : "false"}</div>`);
    lines.push(`<div>is damaged: ${d.is_damaged ? "true" : "false"}</div>`);
    if (d.lock_type === "obstruction" && d.notes) {
      lines.push(`<div>obstruction: ${d.notes}</div>`);
    }
    return lines.join("");
  }

  // Allow console/debug access
  window.doors = { load: loadDoorsData, roll: rollDoor, render: renderDoor };

  // ──────────────────────────────────────────────────────────────
  // SHOP (complete replacement, with privacy slider + SRD/homebrew gate)
  // ──────────────────────────────────────────────────────────────
  (function ShopUI() {
    "use strict";

    // ---------- tiny DOM helpers ----------
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const setHTML = (selOrEl, html) => {
      const el = typeof selOrEl === "string" ? $(selOrEl) : selOrEl;
      if (el) el.innerHTML = html;
    };
    const escapeHtml = (str) =>
      String(str).replace(
        /[&<>"']/g,
        (ch) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          }[ch])
      );

    // ---------- config & state ----------
    const SHOP_PATH = window.SHOP_PATH || "/data/shop.json";
    const DEMAND = {
      normal: 1.0,
      low_stock_high_demand: 1.15,
      overstock_low_demand: 0.85,
    };
    const REP = { disfavoured: 1.25, neutral: 1.0, favoured: 0.9 };

    const PUBLIC_PUBLICATIONS = new Set(["srd", "homebrew"]);
    const PRIV_KEY = "tb_shop_privacy_mode"; // "public" | "private"
    const PRIV_PASSWORD = "harrywraith";

    const state = {
      data: null, // sanitized data
      ready: null, // loading promise
      results: [], // filtered+adjusted list (last render)
      selectedIdx: 0, // selected row index within results
      hagglePct: 0, // 0 / 5 / 10 / 15
    };

    // ---------- utils ----------
    const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
    const fmtGp = (gp) => `${(Number(gp) || 0).toFixed(2)} gp`;
    const cap = (s) =>
      s == null
        ? s
        : String(s)
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
    const setText = (sel, txt) => {
      const o = $(sel);
      if (o) o.textContent = txt;
    };
    const setVal = (sel, val) => {
      const el = $(sel);
      if (el) el.value = val;
    };

    function coinsBreakdown(gp) {
      const totalCp = Math.round((Number(gp) || 0) * 100); // 1 gp = 10 sp = 100 cp
      const gpWhole = Math.floor(totalCp / 100);
      const sp = Math.floor((totalCp % 100) / 10);
      const cp = totalCp % 10;
      const parts = [];
      if (gpWhole) parts.push(`${gpWhole} gp`);
      if (sp) parts.push(`${sp} sp`);
      if (cp) parts.push(`${cp} cp`);
      return parts.join(" ") || "0 gp";
    }
    function slugifyId(s) {
      return String(s || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\w]+/g, "_")
        .replace(/^_+|_+$/g, "");
    }

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

    // ---------- sanitize data (preserves useful extra fields, incl. publication) ----------
    function sanitizeShopData(data) {
      const out = {
        schema: String(data?.schema || "shop.v1"),
        categories: [],
        items: [],
      };
      const catMap = new Map();

      // categories
      for (const c of data?.categories || []) {
        const id = slugifyId(c?.id || c?.label);
        if (!id) continue;
        const label = (
          c?.label ? String(c.label).trim() : id.replace(/_/g, " ")
        ).replace(/\b\w/g, (ch) => ch.toUpperCase());
        if (!catMap.has(id)) catMap.set(id, label);
      }

      // items
      const itemMap = new Map();
      for (const raw of data?.items || []) {
        const name = String(raw?.name || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!name) continue;
        let catId = slugifyId(raw?.category || raw?.cat || "misc") || "misc";

        let price = parsePriceGP(raw?.price_gp ?? raw?.price ?? raw?.gp);
        if (!isFinite(price)) {
          const sp = parsePriceGP(raw?.price_sp ?? raw?.sp);
          const cp = parsePriceGP(raw?.price_cp ?? raw?.cp);
          price = (isFinite(sp) ? sp / 10 : 0) + (isFinite(cp) ? cp / 100 : 0);
        }
        if (!isFinite(price) || price < 0) continue;

        if (!catMap.has(catId)) {
          const label = catId
            .replace(/_/g, " ")
            .replace(/\b\w/g, (ch) => ch.toUpperCase());
          catMap.set(catId, label);
        }

        // keep selected extra fields (added publication here)
        const keep = {};
        for (const k of [
          "rarity",
          "consumable",
          "tags",
          "source",
          "delivery",
          "save",
          "notes",
          "unit",
          "description",
          "legal_status",
          "availability",
          "aliases",
          "weight_lb",
          "stock",
          "publication", // <-- important
        ]) {
          if (raw[k] !== undefined) keep[k] = raw[k];
        }

        const key = name.toLowerCase() + "::" + catId;
        if (itemMap.has(key)) continue;
        itemMap.set(key, {
          id: slugifyId(raw?.id || name),
          name,
          category: catId,
          price_gp: round2(price),
          publication: raw?.publication || "homebrew", // default for safety
          ...keep,
        });
      }

      out.categories = [...catMap].map(([id, label]) => ({ id, label }));
      out.items = [...itemMap.values()];
      return out;
    }

    // ---------- load ----------
    function loadShopData() {
      if (state.ready) return state.ready;
      state.ready = (async () => {
        try {
          const res = await fetch(SHOP_PATH, { cache: "no-store" });
          if (!res.ok) throw new Error(`Fetch ${SHOP_PATH} → ${res.status}`);
          state.data = sanitizeShopData(await res.json());
        } catch (err) {
          console.error("Failed to load shop.json:", err);
          // minimal fallback
          state.data = sanitizeShopData({
            categories: [{ id: "black_market", label: "Black Market" }],
            items: [
              {
                name: "Sunmote Elixir",
                category: "black_market",
                price_gp: 50,
                tags: ["illegal", "narcotic"],
                notes: "Stimulant",
                description:
                  "Brief pick-me-up favored by carters and dockhands.",
                legal_status: "restricted",
                availability: "uncommon",
                publication: "homebrew",
              },
            ],
          });
        }
      })();
      return state.ready;
    }
    loadShopData(); // prefetch

    // ---------- privacy (Public ⇄ Private slider) ----------
    function getPrivacyMode() {
      const v = sessionStorage.getItem(PRIV_KEY);
      return v === "private" ? "private" : "public";
    }
    function setPrivacyMode(mode) {
      const m = mode === "private" ? "private" : "public";
      sessionStorage.setItem(PRIV_KEY, m);
      const status = $("#shopPrivacyStatus");
      if (status) status.textContent = m === "private" ? "Private" : "Public";
      const slider = $("#privacySlider");
      if (slider) slider.value = m === "private" ? "1" : "0";
    }
    function isItemVisibleByPrivacy(it) {
      const mode = getPrivacyMode();
      if (mode === "private") return true;
      const pub = String(it.publication || "homebrew").toLowerCase();
      return PUBLIC_PUBLICATIONS.has(pub);
    }

    // Create/inject the slider UI if your HTML doesn't have it
    function ensurePrivacySlider() {
      if ($("#privacySlider")) {
        setPrivacyMode(getPrivacyMode()); // sync initial
        return;
      }
      // Prefer to mount next to #shopSort or #shopCategory; else put at the top of main
      const anchor =
        $("#shopSort")?.parentElement ||
        $("#shopCategory")?.parentElement ||
        $("main") ||
        document.body;
      const wrap = document.createElement("div");
      wrap.className = "tb-privacy";
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = ".5rem";
      wrap.innerHTML = `
      <span class="tb-privacy-label" style="font-size:.9rem;opacity:.8">Public</span>
      <input id="privacySlider" class="tb-privacy-slider" type="range" min="0" max="1" step="1" value="0"
             aria-label="Privacy mode slider: 0=Public, 1=Private"
             style="width:72px;height:28px;appearance:none;background:transparent">
      <span class="tb-privacy-label" style="font-size:.9rem;opacity:.8">Private</span>
      <small id="shopPrivacyStatus" class="tb-privacy-status" style="margin-left:.5rem;opacity:.75">Public</small>
    `;
      anchor.prepend(wrap);

      // Minimal inline styles for track/thumb (webkit + moz)
      const style = document.createElement("style");
      style.textContent = `
      .tb-privacy-slider::-webkit-slider-runnable-track {
        height: 28px; border-radius: 999px;
        background: linear-gradient(90deg, #3aa655 0 50%, #a33 50% 100%);
      }
      .tb-privacy-slider::-moz-range-track {
        height: 28px; border-radius: 999px;
        background: linear-gradient(90deg, #3aa655 0 50%, #a33 50% 100%);
      }
      .tb-privacy-slider::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 26px; height: 26px; border-radius: 50%;
        background: #fff; border: 2px solid rgba(0,0,0,.15);
        margin-top: 1px; box-shadow: 0 1px 2px rgba(0,0,0,.2);
      }
      .tb-privacy-slider::-moz-range-thumb {
        width: 26px; height: 26px; border-radius: 50%;
        background: #fff; border: 2px solid rgba(0,0,0,.15);
        box-shadow: 0 1px 2px rgba(0,0,0,.2);
      }
      .tb-privacy-slider:focus-visible { outline: 2px solid #4a90e2; outline-offset: 2px; }
    `;
      document.head.appendChild(style);

      setPrivacyMode(getPrivacyMode());
    }

    // ---------- categories ----------
    function shopCategories() {
      const explicit = state.data?.categories;
      if (Array.isArray(explicit) && explicit.length) return explicit;
      const map = new Map();
      for (const it of state.data?.items || []) {
        const id = it.category || "misc";
        if (!map.has(id)) {
          const label = id
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          map.set(id, { id, label });
        }
      }
      return [...map.values()];
    }
    function hydrateShopCategorySelect() {
      const sel = $("#shopCategory");
      if (!sel || !state.data) return;
      const cats = shopCategories();
      const current = sel.value;
      sel.innerHTML = [
        `<option value="__all__">All categories</option>`,
        ...cats.map(
          (c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`
        ),
      ].join("");
      if (cats.some((c) => c.id === current)) sel.value = current;
    }

    // ---------- pricing ----------
    function adjustedPrice(base) {
      const demandKey = $("#shopDemand")?.value || "normal";
      const repKey = $("#shopRep")?.value || "neutral";
      const m =
        (DEMAND[demandKey] ?? 1) *
        (REP[repKey] ?? 1) *
        (1 - state.hagglePct / 100);
      return (Number(base) || 0) * m;
    }

    // ---------- filter/sort + table render ----------
    function filterAndSort(items, { cat, q, sort }) {
      let list = items;
      if (cat && cat !== "__all__")
        list = list.filter((it) => it.category === cat);
      if (q) {
        const s = String(q).trim().toLowerCase();
        if (s) {
          list = list.filter(
            (it) =>
              it.name.toLowerCase().includes(s) ||
              (Array.isArray(it.tags) &&
                it.tags.join(" ").toLowerCase().includes(s)) ||
              (it.notes && String(it.notes).toLowerCase().includes(s)) ||
              (it.description &&
                String(it.description).toLowerCase().includes(s)) ||
              (it.legal_status &&
                String(it.legal_status).toLowerCase().includes(s)) ||
              (it.availability &&
                String(it.availability).toLowerCase().includes(s))
          );
        }
      }
      switch (sort) {
        case "price_asc":
          list.sort((a, b) => a._adj - b._adj);
          break;
        case "price_desc":
          list.sort((a, b) => b._adj - a._adj);
          break;
        default:
          list.sort((a, b) => a.name.localeCompare(b.name));
      }
      return list;
    }

    function renderShopTable() {
      const q = $("#shopSearch")?.value || "";
      const cat = $("#shopCategory")?.value || "__all__";
      const sort = $("#shopSort")?.value || "name";
      const showCoins = !!$("#shopCoins")?.checked;

      const items = (state.data?.items || []).map((it) => ({
        ...it,
        _adj: round2(adjustedPrice(it.price_gp)),
      }));
      // Privacy gate first
      const privacyFiltered = items.filter(isItemVisibleByPrivacy);
      const list = filterAndSort(privacyFiltered, { cat, q, sort });
      state.results = list;

      if (!list.length) return `<div>No items match your filters.</div>`;

      const catMap = new Map(shopCategories().map((c) => [c.id, c.label]));
      const rows = list
        .map((it, idx) => {
          const base = fmtGp(it.price_gp);
          const adj = showCoins ? coinsBreakdown(it._adj) : fmtGp(it._adj);
          const catLabel = catMap.get(it.category) || it.category;
          const sel = idx === state.selectedIdx ? " is-selected" : "";
          return `<tr class="js-shop-row${sel}" data-idx="${idx}" tabindex="0">
        <td>${escapeHtml(it.name)}</td>
        <td>${escapeHtml(catLabel)}</td>
        <td>${base}</td>
        <td>${adj}</td>
      </tr>`;
        })
        .join("");

      return `<table class="tb-table">
      <thead><tr><th>Item</th><th>Category</th><th>Base</th><th>Adjusted</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
    }

    // ---------- details panel ----------
    function ensureDetailPane() {
      const preferred =
        document.querySelector("main.grid-even > article.shop_view") ||
        document.querySelector("main.grid-even > article:nth-of-type(2)") ||
        document.querySelector("main.grid-even > article");

      if (!preferred) return null;

      const allPanels = Array.from(
        document.querySelectorAll("#shopDetailPanel")
      );
      let panel = allPanels.find((p) => preferred.contains(p)) || allPanels[0];

      if (!panel) {
        panel = document.createElement("section");
        panel.className = "tb-panel";
        panel.id = "shopDetailPanel";
        panel.innerHTML = `
        <h2 class="tb-title">Selected Item Details</h2>
        <output id="shopDetail" class="tb-result" aria-live="polite">
          Click an item on the left (or press Show) to see details.
        </output>`;
        preferred.appendChild(panel);
      } else if (!preferred.contains(panel)) {
        preferred.appendChild(panel);
      }
      allPanels.forEach((p) => {
        if (p !== panel) p.remove();
      });

      let out = panel.querySelector("#shopDetail");
      if (!out) {
        out = document.createElement("output");
        out.id = "shopDetail";
        out.className = "tb-result";
        out.setAttribute("aria-live", "polite");
        out.textContent =
          "Click an item on the left (or press Show) to see details.";
        panel.appendChild(out);
      }
      Array.from(document.querySelectorAll("#shopDetail")).forEach((n) => {
        if (n !== out) n.remove();
      });

      return panel;
    }

    function formatVal(v) {
      if (v == null || v === "") return "—";
      if (typeof v === "boolean") return v ? "True" : "False";
      if (Array.isArray(v)) return v.join(", ");
      if (typeof v === "object") {
        try {
          return JSON.stringify(v);
        } catch {
          return String(v);
        }
      }
      return String(v);
    }

    function renderDetail(idx) {
      ensureDetailPane();
      const box = $("#shopDetail");
      const item = state.results[idx];
      if (!box || !item) return;

      const catMap = new Map(shopCategories().map((c) => [c.id, c.label]));
      const cat = catMap.get(item.category) || item.category || "—";
      const showCoins = !!$("#shopCoins")?.checked;
      const adj = round2(item._adj ?? item.price_gp ?? 0);
      const coins = showCoins ? coinsBreakdown(adj) : null;

      const rows = [
        ["Category", cat],
        [
          "Availability",
          item.availability != null ? cap(item.availability) : null,
        ],
        [
          "Legal status",
          item.legal_status != null ? cap(item.legal_status) : null,
        ],
        ["Base price (gp)", item.price_gp != null ? item.price_gp : "—"],
        ["Adjusted price (gp)", adj != null ? adj : "—"],
        ...(coins ? [["Adjusted (coins)", coins]] : []),
        ["Rarity", item.rarity != null ? cap(item.rarity) : null],
        ["Consumable", item.consumable ?? null],
        ["Tags", item.tags ?? null],
        ["Source", item.source ?? null],
        ["Unit", item.unit ?? null],
        ["Notes", item.notes ?? null],
        ["Publication", item.publication ?? null],
        ["ID", item.id ?? null],
      ].filter(([, v]) => v != null && String(v) !== "");

      setHTML(
        box,
        `
      <div class="tb-detail">
        <div class="tb-detail-header">
          <div class="tb-detail-name">${escapeHtml(item.name)}</div>
          <div class="tb-badges">
            ${
              item.rarity
                ? `<span class="tb-badge">${escapeHtml(
                    cap(item.rarity)
                  )}</span>`
                : ""
            }
            ${item.consumable ? `<span class="tb-badge">Consumable</span>` : ""}
            ${
              (Array.isArray(item.tags) && item.tags.includes("illegal")) ||
              String(item.legal_status || "").toLowerCase() === "illegal"
                ? `<span class="tb-badge tb-badge-warn">Black Market</span>`
                : ""
            }
          </div>
        </div>
        ${
          item.description
            ? `<p class="tb-detail-desc">${escapeHtml(
                String(item.description)
              )}</p>`
            : ""
        }
        <div class="tb-kv">
          ${rows
            .map(
              ([k, v]) => `
            <div class="tb-kv-row">
              <div class="tb-kv-key">${escapeHtml(k)}</div>
              <div class="tb-kv-val">${escapeHtml(formatVal(v))}</div>
            </div>`
            )
            .join("")}
        </div>
      </div>
    `
      );
    }

    // ---------- delegated row handlers (click + keyboard) ----------
    function bindDelegatedRowHandlers() {
      const container = $("#shopResult");
      if (!container || container.__delegated) return;
      container.__delegated = true;

      const activateRow = (row) => {
        if (!row || !container.contains(row)) return;
        ensureDetailPane();
        state.selectedIdx = Number(row.dataset.idx ?? -1);
        if (state.selectedIdx < 0) return;

        $$("#shopResult tbody tr.js-shop-row").forEach((r) =>
          r.classList.toggle("is-selected", r === row)
        );
        row.scrollIntoView({ block: "nearest" });
        renderDetail(state.selectedIdx);
      };

      container.addEventListener("click", (e) => {
        const row = e.target.closest("tr.js-shop-row");
        activateRow(row);
      });

      container.addEventListener("keydown", (e) => {
        const row = e.target.closest("tr.js-shop-row");
        if (!row || !container.contains(row)) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activateRow(row);
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const rows = $$("#shopResult tbody tr.js-shop-row");
          let i = rows.indexOf(row);
          i += e.key === "ArrowDown" ? 1 : -1;
          i = (i + rows.length) % rows.length;
          rows[i].focus();
          activateRow(rows[i]);
        }
      });
    }

    // ---------- render + wire ----------
    function clampShopResult(maxRows = 10) {
      const out = document.querySelector("#shopResult");
      const table = out?.querySelector("table");
      if (!out || !table) return;
      requestAnimationFrame(() => {
        const theadH = table.tHead
          ? table.tHead.getBoundingClientRect().height
          : 0;
        const firstRow = table.tBodies?.[0]?.rows?.[0];
        let rowH = firstRow ? firstRow.getBoundingClientRect().height : 0;
        if (!rowH) {
          const fs = parseFloat(getComputedStyle(table).fontSize) || 14;
          rowH = fs * 2.4;
        }
        const max = Math.round(theadH + rowH * maxRows + 2);
        out.style.setProperty("--shop-max", `${max}px`);
        out.style.overflow = "auto";
      });
    }

    async function renderNow(autoSelect) {
      await (state.ready || loadShopData());
      if (state.selectedIdx >= state.results.length) state.selectedIdx = 0;

      setHTML("#shopResult", renderShopTable());
      bindDelegatedRowHandlers();
      clampShopResult(10);

      if (autoSelect && state.results.length) {
        state.selectedIdx = 0;
        renderDetail(0);
        const first = $("#shopResult tbody tr.js-shop-row");
        if (first) first.classList.add("is-selected");
      }
    }

    function wireControls() {
      // Mount/inject slider UI (if not present)
      ensurePrivacySlider();

      // Change/select controls
      [
        "#shopDemand",
        "#shopRep",
        "#shopSort",
        "#shopCoins",
        "#shopCategory",
      ].forEach((sel) => {
        $(sel)?.addEventListener("change", () => renderNow(false));
      });

      // Privacy slider (0=Public, 1=Private) + password prompt
      const privacySlider = $("#privacySlider");
      if (privacySlider) {
        // Init from session (default public)
        setPrivacyMode(getPrivacyMode());

        privacySlider.addEventListener("change", () => {
          const wantPrivate = privacySlider.value === "1";
          if (wantPrivate) {
            const pw = window.prompt("Enter password to switch to Private:");
            if (pw === PRIV_PASSWORD) {
              setPrivacyMode("private");
            } else {
              setPrivacyMode("public");
              alert("Incorrect password. Staying in Public mode.");
            }
          } else {
            setPrivacyMode("public");
          }
          renderNow(false);
        });
      } else {
        setPrivacyMode("public");
      }

      // Search (debounced)
      const s = $("#shopSearch");
      if (s) {
        s.addEventListener("input", () => {
          clearTimeout(s.__t);
          s.__t = setTimeout(() => renderNow(false), 150);
        });
      }

      // Buttons
      $("#rollShop")?.addEventListener("click", (e) => {
        e.stopPropagation();
        renderNow(true);
      });
      $("#exportShop")?.addEventListener("click", (e) => {
        e.stopPropagation();
        exportCSV();
      });

      // Haggle buttons (segment toggle)
      const setPressed = () => {
        ["haggle5", "haggle10", "haggle15"].forEach((id) => {
          const b = $("#" + id);
          if (!b) return;
          const p = Number(b.dataset.disc || 0);
          b.setAttribute(
            "aria-pressed",
            state.hagglePct === p ? "true" : "false"
          );
        });
        $("#persuasionOutcome") &&
          ($("#persuasionOutcome").textContent = state.hagglePct
            ? `Persuasion discount: ${state.hagglePct}%`
            : "No discount.");
      };
      ["haggle5", "haggle10", "haggle15"].forEach((id) => {
        $("#" + id)?.addEventListener("click", (e) => {
          e.stopPropagation();
          const pct = Number($("#" + id).dataset.disc || 0);
          state.hagglePct = state.hagglePct === pct ? 0 : pct; // toggle off if same
          setPressed();
          renderNow(false);
        });
      });
      setPressed();
    }

    function exportCSV() {
      const lines = [
        ["Item", "Category", "Base (gp)", "Adjusted (gp)"],
        ...state.results.map((it) => [
          it.name,
          it.category,
          (+it.price_gp || 0).toFixed(2),
          (+it._adj || 0).toFixed(2),
        ]),
      ]
        .map((row) =>
          row.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");

      const blob = new Blob([lines], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "shop.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    // ---------- init ----------
    document.addEventListener("DOMContentLoaded", () => {
      loadShopData().then(() => {
        // Ensure slider is present + in sync before first render
        ensurePrivacySlider();
        setPrivacyMode(getPrivacyMode());

        hydrateShopCategorySelect();
        ensureDetailPane(); // mount/move details panel into <article class="shop_view">
        wireControls();
        // re-calc scroll height when viewport changes
        window.addEventListener("resize", () => clampShopResult(10));
      });
    });
  })();

  // ─────────────────────────────────────────────────────────────────────────────
  // NAMES (people-only)  (data: /data/names.json)
  // ─────────────────────────────────────────────────────────────────────────────
  const NAMES_PATH = "/data/names.json";
  let NAMES_DATA = null,
    NAMES_READY = null;

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
            human_sken: {
              male: ["Arno", "Berrin", "Corvin"],
              female: ["Mira", "Talia", "Vessa"],
            },
          },
        };
      }
    })();
    return NAMES_READY;
  }
  loadNamesData();

  function pickMany(arr, n) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    if (n >= arr.length)
      return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
    const out = new Set();
    while (out.size < n) out.add(pick(arr));
    return [...out];
  }

  function rollNamesPeople(species, gender, count = 3) {
    const people = NAMES_DATA?.people || {};
    const sp = people[species] ? species : Object.keys(people)[0];
    const g = gender === "female" || gender === "male" ? gender : "male";
    const pool = people[sp]?.[g] || [];
    const names = pickMany(pool, count);
    return names.join(", ");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TREASURE  (data: /data/magic-items.json)
  // ─────────────────────────────────────────────────────────────────────────────
  const MAGIC_PATH = "/data/magic-items.json";
  let MAGIC_DATA = null;
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

  function getBuckets() {
    const buckets = {
      common: [],
      uncommon: [],
      rare: [],
      "very rare": [],
      legendary: [],
      artifact: [],
    };
    const items = Array.isArray(MAGIC_DATA?.items) ? MAGIC_DATA.items : [];
    for (const it of items) {
      const r = (it.rarity || "").toLowerCase();
      if (r === "varies") continue;
      if (buckets[r]) buckets[r].push(it);
    }
    return buckets;
  }

  const RARITY_BY_LEVEL = {
    levelNone: null,
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
  const RARITY_WEIGHTS = RARITY_BY_LEVEL.levelNormal;

  const COIN_BANDS = {
    low: { gp: [50, 200], sp: [100, 400], cp: [0, 200] },
    mid: { gp: [200, 800], sp: [200, 800], cp: [0, 200] },
    high: { gp: [800, 3000], sp: [500, 2000], cp: [0, 100] },
    epic: { gp: [3000, 10000], sp: [0, 3000], cp: [0, 0] },
  };
  const GEM_TABLE = [
    "agate",
    "hematite",
    "obsidian",
    "garnet",
    "pearl",
    "amethyst",
    "topaz",
    "emerald shard",
    "ruby sliver",
    "sapphire chip",
    "diamond shard",
  ];
  const GEM_COUNTS = { low: [0, 1], mid: [1, 4], high: [3, 8], epic: [6, 12] };
  const MAGIC_COUNTS = { low: [0, 1], mid: [1, 2], high: [2, 4], epic: [3, 6] };

  function rollMagicItemsForBand(band, count, levelKey = "levelNormal") {
    const weights = RARITY_BY_LEVEL[levelKey] || RARITY_WEIGHTS;
    if (!weights) return []; // levelNone → no magic
    const b = getBuckets();
    const out = [];
    for (let i = 0; i < count; i++) {
      let rarity = pickWeighted(weights[band] || weights.mid);
      let pool = b[rarity] || [];
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
      out.push(pick(pool)?.name || "mystery item");
    }
    return out;
  }

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

  function formatCoins(co) {
    const parts = [];
    if (co.gp) parts.push(`${co.gp} gp`);
    if (co.sp) parts.push(`${co.sp} sp`);
    if (co.cp) parts.push(`${co.cp} cp`);
    if (co.pp) parts.push(`${co.pp} pp`);
    return parts.join(", ") || "—";
  }

  function rollTreasure(mode, band, levelKey = "levelNormal") {
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
        magic =
          n > 0 && MAGIC_DATA?.items?.length
            ? rollMagicItemsForBand(band, n, levelKey)
            : [];
      }
      return { mode, band, coins: formatCoins(coinsObj), gems: [], magic };
    }

    const c = COIN_BANDS[band] || COIN_BANDS.mid;
    const gp = randint(c.gp[0], c.gp[1]);
    const sp = randint(c.sp[0], c.sp[1]);
    const cp = randint(c.cp[0], c.cp[1]);
    const coins = `${gp} gp${sp ? `, ${sp} sp` : ""}${cp ? `, ${cp} cp` : ""}`;

    const [gMin, gMax] = GEM_COUNTS[band] || GEM_COUNTS.mid;
    const gemCount = randint(gMin, gMax);
    const gems = Array.from({ length: gemCount }, () => pick(GEM_TABLE));

    let magic = [];
    if (levelKey !== "levelNone") {
      const [mMin, mMax] = MAGIC_COUNTS[band] || MAGIC_COUNTS.mid;
      const magicCount = randint(mMin, mMax);
      magic =
        magicCount > 0 && MAGIC_DATA?.items?.length
          ? rollMagicItemsForBand(band, magicCount, levelKey)
          : [];
    }

    return { mode: "hoard", band, coins, gems, magic };
  }

  function renderTreasure(t) {
    if (!t) return "—";
    if (t.mode === "individual") {
      const magic = t.magic?.length
        ? ` <em>Magic:</em> ${t.magic.join(", ")}`
        : "";
      return `<div><strong>Individual</strong>: ${t.coins}${magic}</div>`;
    }
    const gems = t.gems?.length ? `<div>Gems: ${t.gems.join(", ")}</div>` : "";
    const magic = t.magic?.length
      ? `<div>Magic: ${t.magic.join(", ")}</div>`
      : "";
    return `<div><strong>Hoard</strong> (${t.band}): ${t.coins}${gems}${magic}</div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ENCOUNTERS (data: /data/encounters.json) — v3 (zones + risks, entries = {v,w})
  // ─────────────────────────────────────────────────────────────────────────────
  const ENCOUNTERS_PATH = "/data/encounters.json";
  let ENCOUNTERS_DATA = null,
    ENCOUNTERS_READY = null;

  function loadEncountersData() {
    if (ENCOUNTERS_READY) return ENCOUNTERS_READY;
    ENCOUNTERS_READY = (async () => {
      try {
        const res = await fetch(ENCOUNTERS_PATH, { cache: "no-store" });
        if (!res.ok)
          throw new Error(`Fetch ${ENCOUNTERS_PATH} → ${res.status}`);
        ENCOUNTERS_DATA = await res.json();
      } catch (err) {
        console.error("Failed to load encounters.json:", err);
        ENCOUNTERS_DATA = {
          schema: "encounters.v3",
          risks: ["safe", "low", "moderate", "high", "deadly"],
          zones: [
            "forest",
            "plains",
            "mountains",
            "desert",
            "swamp",
            "coast",
            "underground",
            "ruins",
            "arctic",
            "populated_city",
            "populated_village",
            "populated_frontier",
          ],
          encounters: {},
        };
      }
    })();
    return ENCOUNTERS_READY;
  }
  loadEncountersData();

  function getEncounterZones() {
    const zones = ENCOUNTERS_DATA?.zones;
    if (Array.isArray(zones) && zones.length) return zones;
    return Object.keys(ENCOUNTERS_DATA?.encounters || {});
  }

  function rollEncounter(zone, risk) {
    if (!ENCOUNTERS_DATA) return "Encounters loading…";

    const zones = getEncounterZones();
    const z = zones.includes(zone) ? zone : zones[0];
    const risks = ENCOUNTERS_DATA?.risks || [
      "safe",
      "low",
      "moderate",
      "high",
      "deadly",
    ];
    const r = risks.includes(risk) ? risk : risks[0];

    const list = ENCOUNTERS_DATA?.encounters?.[z]?.[r];
    if (!Array.isArray(list) || !list.length) {
      const labelZ =
        z?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
      const labelR =
        r?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
      return `No encounters found for <em>${labelZ}</em> › <em>${labelR}</em>.`;
    }

    const value = pickWeighted(list); // returns encounter .v based on weights
    const labelZ = z
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const labelR = r
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return `<div><strong>${labelZ} • ${labelR}</strong></div><div style="margin-top:.5em">${value}</div>`;
  }

  // Hydrate the Zone <select> based on JSON so it stays in sync
  function initEncounterZoneSelect() {
    const sel = get("#encounterZone");
    if (!sel || !ENCOUNTERS_DATA) return;
    const zones = getEncounterZones();
    if (!zones.length) return;
    const current = sel.value;
    sel.innerHTML = zones
      .map((z) => {
        const label = z
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return `<option value="${z}">${label}</option>`;
      })
      .join("");
    if (zones.includes(current)) sel.value = current;
  }
  document.addEventListener("DOMContentLoaded", () => {
    (ENCOUNTERS_READY || loadEncountersData()).then(initEncounterZoneSelect);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DEBUG HELPERS (Weather, Traps v3, Names, Treasure, Encounters)
  // ─────────────────────────────────────────────────────────────────────────────
  window.weatherDebug = () =>
    (WEATHER_READY || Promise.resolve()).then(() => {
      const z = WEATHER_DATA?.zones?.[0] || "centre";
      const s = WEATHER_DATA?.seasons?.[0] || "autumn";
      return {
        path: WEATHER_PATH,
        zones: WEATHER_DATA?.zones || [],
        seasons: WEATHER_DATA?.seasons || [],
        sample: rollWeather(z, s),
      };
    });

  window.doorsDebug = () =>
    (DOORS_READY || loadDoorsData()).then(() => {
      const sample = rollDoor();
      return {
        path: DOORS_PATH,
        sampleObj: sample,
        sampleHtml: renderDoor(sample),
      };
    });

  window.trapsDebug = () =>
    (TRAPS_READY || Promise.resolve()).then(() => {
      const type = TRAPS_DATA?.trap_types?.[0] || "mechanical";
      const env =
        Object.keys(TRAPS_DATA?.env_tags || { dungeon: [] })[0] || "dungeon";
      const sample = rollTrapV3({
        type,
        lethality: "medium",
        env,
        dcBracket: "medium",
      });
      return {
        path: TRAPS_PATH,
        trap_types: TRAPS_DATA?.trap_types || [],
        hasSplitDCs: !!TRAPS_DATA?.dc_brackets?.detect,
        sampleHtml: renderTrapV3(sample),
      };
    });

  window.namesDebug = () =>
    (NAMES_READY || Promise.resolve()).then(() => ({
      path: NAMES_PATH,
      species: Object.keys(NAMES_DATA?.people || {}),
      sample: rollNamesPeople(
        Object.keys(NAMES_DATA?.people || { human_sken: 1 })[0],
        "male",
        3
      ),
    }));

  window.magicDebug = () =>
    (MAGIC_READY || Promise.resolve()).then(() => ({
      path: MAGIC_PATH,
      count: MAGIC_DATA?.items?.length || 0,
      sample: MAGIC_DATA?.items?.[0]?.name || null,
    }));

  window.encountersDebug = () =>
    (ENCOUNTERS_READY || Promise.resolve()).then(() => {
      const zones = getEncounterZones();
      const risks = ENCOUNTERS_DATA?.risks || [
        "safe",
        "low",
        "moderate",
        "high",
        "deadly",
      ];
      const z = zones[0] || "forest";
      const r = risks[1] || "low";
      return {
        path: ENCOUNTERS_PATH,
        zones,
        risks,
        sample: rollEncounter(z, r),
      };
    });

  // ─────────────────────────────────────────────────────────────────────────────
  // CLICK HANDLER (Weather, Traps v3, Names, Treasure, Encounters)
  // ─────────────────────────────────────────────────────────────────────────────
  document.addEventListener("click", async function (e) {
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
        const zones = ["far_north", "north", "centre", "south", "far_south"];
        const seasons = ["spring", "summer", "autumn", "winter"];
        const z = pick(zones),
          s = pick(seasons);
        setVal("#zone", z);
        setVal("#season", s);
        setText("#weatherResult", rollWeather(z, s));
        break;
      }

      // Doors
      case "rollDoor": {
        await loadDoorsData();
        const d = rollDoor();
        setHTML("#doorResult", renderDoor(d));
        break;
      }

      // Traps v3
      case "rollTrap": {
        await loadTrapsData();
        const typeInput = get("#trapTech")?.value || "mechanical"; // backward-compatible select
        const lvl = get("#trapLevel")?.value || "medium";
        const env = get("#trapEnv")?.value || "dungeon";
        const dcKey = get("#trapDcBracket")?.value || "medium";
        const t = rollTrapV3({
          type: typeInput,
          lethality: lvl,
          env,
          dcBracket: dcKey,
        });
        setHTML("#trapResult", renderTrapV3(t));
        break;
      }
      case "randTrap": {
        await loadTrapsData();
        const typeInput = pick(
          TRAPS_DATA.trap_types || ["mechanical", "magical", "environmental"]
        );
        const lvl = pick(["low", "medium", "high"]);
        const env = pick([
          "dungeon",
          "tomb",
          "sewer",
          "forest",
          "ruin",
          "lair",
          "temple",
          "arctic",
        ]);
        setVal("#trapTech", typeInput);
        setVal("#trapLevel", lvl);
        setVal("#trapEnv", env);

        const keys = TRAPS_DATA?.dc_brackets?.save
          ? Object.keys(TRAPS_DATA.dc_brackets.save)
          : ["medium"];
        const dcKey = pick(keys);
        if (get("#trapDcBracket")) setVal("#trapDcBracket", dcKey);

        const t = rollTrapV3({
          type: typeInput,
          lethality: lvl,
          env,
          dcBracket: dcKey,
        });
        setHTML("#trapResult", renderTrapV3(t));
        break;
      }

      // Names (people only, always 3)
      case "rollName": {
        await loadNamesData();
        const species = get("#nameSpecies")?.value || "human_sken";
        const gender = get("#nameGender")?.value || "male";
        setText("#nameResult", rollNamesPeople(species, gender, 3));
        break;
      }
      case "randName": {
        await loadNamesData();
        const speciesList = Object.keys(
          NAMES_DATA?.people || { human_sken: 1 }
        );
        const species = pick(speciesList.length ? speciesList : ["human_sken"]);
        const gender = pick(["male", "female"]);
        setVal("#nameSpecies", species);
        setVal("#nameGender", gender);
        setText("#nameResult", rollNamesPeople(species, gender, 3));
        break;
      }

      // Treasure
      case "rollTreasure": {
        await MAGIC_READY;
        const mode = get("#treasureMode")?.value || "hoard";
        const band = get("#treasureBand")?.value || "mid";
        const level = get("#treasureLevel")?.value || "levelNormal";
        const t = rollTreasure(mode, band, level);
        setHTML("#treasureResult", renderTreasure(t));
        break;
      }
      case "randTreasure": {
        await MAGIC_READY;
        const mode = pick(["hoard", "individual"]);
        const band = pick(["low", "mid", "high", "epic"]);
        setVal("#treasureMode", mode);
        setVal("#treasureBand", band);
        const level = get("#treasureLevel")?.value || "levelNormal";
        const t = rollTreasure(mode, band, level);
        setHTML("#treasureResult", renderTreasure(t));
        break;
      }

      // Encounters (v3)
      case "rollEncounter": {
        await loadEncountersData();
        const zone = get("#encounterZone")?.value || "forest";
        const risk = get("#encounterRisk")?.value || "safe";
        setHTML("#encounterResult", rollEncounter(zone, risk));
        break;
      }
      case "randEncounter": {
        await loadEncountersData();
        // Prefer zones from data; fallback to labels in HTML if any
        const zones =
          ENCOUNTERS_DATA?.zones && ENCOUNTERS_DATA.zones.length
            ? ENCOUNTERS_DATA.zones
            : Array.from(get("#encounterZone")?.options || []).map(
                (o) => o.value
              );
        const risks = ENCOUNTERS_DATA?.risks || [
          "safe",
          "low",
          "moderate",
          "high",
          "deadly",
        ];

        const zone = zones.length ? pick(zones) : "forest";
        const risk = pick(risks);

        setVal("#encounterZone", zone);
        setVal("#encounterRisk", risk);

        setHTML("#encounterResult", rollEncounter(zone, risk));
        break;
      }
    }
  });
})();
