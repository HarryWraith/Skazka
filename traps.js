import { randint, pick, pickWeighted, ucfirst } from "./utils.js";

export const TRAPS_PATH = "/data/traps.json";
let TRAPS_DATA = null,
  TRAPS_READY = null;

export async function loadTrapsData() {
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

// Helper functions for Traps v3
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

function inferTrapDamageType(htmlOrText, trapType) {
  const s = String(htmlOrText).toLowerCase();
  for (const row of TRAPS_DATA?.damage_type_keywords || []) {
    for (const kw of row.keywords) {
      if (s.includes(String(kw).toLowerCase())) return row.type;
    }
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

// v3 Core generator + renderer
export function rollTrapV3({ type, lethality, env, dcBracket = "medium" }) {
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

export function renderTrapV3(t) {
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

  // DCs
  parts.push(`<div><b>Avoid save DC</b>: ${t.dcs.save}${savePart}</div>`);
  parts.push(`<div><b>Detection DC</b>: ${t.dcs.detect}</div>`);
  parts.push(`<div><b>Disarm DC</b>: ${t.dcs.disarm}</div>`);

  if (t.alarmed)
    parts.push(
      `<div><b>Alarmed</b>: ${t.alarm_text || "an alarm is triggered"}.</div>`
    );
  return parts.join("");
}
