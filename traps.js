// traps.js — v3.1 scaling + variety updates (clean version)
import { randint, pick, pickWeighted, ucfirst } from "./utils.js";
import { badgeHtml, titleCase } from "./badges.js";

export const TRAPS_PATH = "/data/traps.json";
let TRAPS_DATA = null;
let TRAPS_READY = null;

export async function loadTrapsData() {
  if (TRAPS_READY) return TRAPS_READY;
  TRAPS_READY = (async () => {
    try {
      const res = await fetch(TRAPS_PATH, { cache: "no-store" });
      if (!res.ok) throw new Error(`Fetch ${TRAPS_PATH} → ${res.status}`);
      TRAPS_DATA = await res.json();
    } catch (err) {
      console.error("Failed to load traps.json:", err);
      TRAPS_DATA = TRAPS_DATA || { schema: "traps.v3.1" }; // minimal fallback
    }
  })();
  return TRAPS_READY;
}
loadTrapsData();

// ---------- helpers
const pickAlt = (s) => (s && s.includes("|") ? pick(s.split("|")) : s);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function dcToneClass(n) {
  const v = clamp(Math.round(Number(n) || 0), 8, 30);
  const step = Math.min(26, Math.max(8, Math.round(v / 2) * 2));
  return `dcv-${step}`;
}

function pickDC(cat = "save", bracketKey = "medium") {
  const b =
    TRAPS_DATA?.dc_brackets?.[cat]?.[bracketKey] ||
    TRAPS_DATA?.dc_brackets?.save?.medium || { min: 15, max: 19 };
  return randint(b.min, b.max);
}

function chooseDCBracketsForLethality(lethality) {
  const k = String(lethality || "medium").toLowerCase();
  if (k === "low") {
    return { detect: "easy", disarm: "easy", save: "medium" };
  }
  if (k === "high") {
    const savePick = pickWeighted([
      { v: "hard", w: 6 },
      { v: "very_hard", w: 3 },
      { v: "nearly_impossible", w: 1 },
    ]);
    return { detect: "medium", disarm: "hard", save: savePick?.v ?? savePick };
  }
  return { detect: "medium", disarm: "medium", save: "hard" };
}

function pickTrapDamageDice(lethality) {
  const t =
    TRAPS_DATA?.damage_by_lethality?.[lethality] ||
    TRAPS_DATA?.damage_by_lethality?.medium ||
    ["2d6"];
  if (t.length && typeof t[0] === "object") {
    const chosen = pickWeighted(
      t.map((r) => ({ v: r.dice || r.v, w: r.w || 1 }))
    );
    return chosen?.v ?? chosen;
  }
  return pick(t);
}

function pickArea() {
  const a = pickWeighted(TRAPS_DATA.areas);
  return a?.v ?? a;
}

function pickStatusEffect(key) {
  const pool = TRAPS_DATA?.status_effects || [];
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
  const tags = TRAPS_DATA?.env_tags?.[env] || [];
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
  const tagged =
    effectTag && (effectTag.includes("|") ? pick(effectTag.split("|")) : effectTag);
  if (tagged) return tagged;

  const bias = envBiasSet(env);
  const dist = TRAPS_DATA?.damage_type_distribution_by_type?.[trapType];
  if (Array.isArray(dist) && dist.length) {
    const weighted = dist.map((row) => {
      const t = (row.type || row.v || "").toLowerCase();
      const bonus = bias.has(t) ? 2 : 0;
      return { v: row.type || row.v, w: (row.w || 1) + bonus };
    });
    const pickDt = pickWeighted(weighted);
    return pickDt?.v ?? pickDt;
  }

  const inferred = inferTrapDamageType(effectText || "", trapType);
  if (inferred) return inferred;

  return "bludgeoning";
}

function normalizeTrapType(input) {
  const x = String(input || "").toLowerCase();
  if (["clockwork", "mechanical"].includes(x)) return "mechanical";
  if (["arcane", "magical", "magic"].includes(x)) return "magical";
  if (["nature", "environment", "environmental"].includes(x)) return "environmental";
  if (["illusion", "illusory"].includes(x)) return "illusory";
  return "mechanical";
}

function normalizeLethality(x) {
  const k = String(x || "").trim().toLowerCase();
  if (k === "moderate") return "medium";
  return k || "medium";
}

// --- badge helpers
function pillTrapType(t) {
  const k = String(t || "").toLowerCase();
  return badgeHtml(`trap-type type-${k}`, titleCase(k));
}
function pillLethality(x) {
  const k = normalizeLethality(x);
  return badgeHtml(`trap-lethality lethality-${k}`, titleCase(k));
}
function pillEnv(env) {
  const k = String(env || "").toLowerCase().replace(/\s+/g, "-");
  return badgeHtml(`trap-env env-${k}`, titleCase(env || ""));
}
function pillDamageType(dt) {
  if (!dt) return "";
  const k = String(dt || "").toLowerCase().replace(/\s+/g, "-");
  return badgeHtml(`trap-dmg dmg-${k}`, titleCase(dt));
}
function pillSave(save) {
  if (!save) return "";
  const k = String(save || "").toUpperCase();
  return badgeHtml(`trap-save save-${k}`, `${k} Save`);
}
function pillArea(a) {
  if (!a) return "";
  const k = String(a || "").toLowerCase().replace(/\s+/g, "-");
  return badgeHtml(`trap-area area-${k}`, titleCase(a));
}
function pillAlarm(alarmed) {
  return alarmed ? badgeHtml("trap-alarm tb-badge-warn", "Alarmed") : "";
}
function pillUtility(isUtility) {
  return isUtility
    ? badgeHtml("trap-utility", "Utility")
    : badgeHtml("trap-utility", "Damaging");
}
function dcPill(n, kind) {
  if (!n) return "";
  const k = (kind || "dc").toLowerCase();
  const label = `${titleCase(k)} DC ${n}`;
  return badgeHtml(`trap-dc dc-${k}`, label);
}
function dcOnlyPill(n, kind) {
  if (!n) return "";
  const k = (kind || "").toLowerCase();
  const cls = k ? `trap-dc dc-${k}` : "trap-dc";
  return badgeHtml(`${cls} ${dcToneClass(n)}`, `DC ${n}`);
}

// ---------- generator + renderer
export function rollTrapV3({ type, lethality, env, dcBracket } = {}) {
  const trapType = normalizeTrapType(type);
  const leth = normalizeLethality(lethality);

  const utilityChance = leth === "low" ? 0.25 : leth === "medium" ? 0.12 : 0.06;
  const isUtility = Math.random() < utilityChance;

  const table = isUtility
    ? TRAPS_DATA?.utility_effects || []
    : TRAPS_DATA?.effects_by_type?.[trapType] ||
      TRAPS_DATA?.effects_by_type?.mechanical ||
      [];

  const chosen = pick(table);
  const area = pickArea();

  const tag0 = (chosen?.tags && chosen.tags[0]) || ""; // damage tag(s)
  const tag1 = (chosen?.tags && chosen.tags[1]) || "DEX"; // save tag(s)

  let dtype = null;
  let effectPreview = String(chosen?.t || "").replace("{area}", area);
  if (!isUtility) {
    dtype = chooseDamageType({ trapType, effectTag: tag0, env, effectText: effectPreview });
    effectPreview = effectPreview.replace("{dtype}", dtype || "");
  } else {
    effectPreview = effectPreview.replace("{dtype}", "");
  }

  const save = pickAlt(tag1);

  const { trigger, counter } = pickTriggerAndCounter();
  const resetPick = pickWeighted(TRAPS_DATA?.reset_modes || []);
  const reset = resetPick?.v ?? resetPick;
  const clue = pick(TRAPS_DATA?.clues || []);

  const dice = !isUtility ? pickTrapDamageDice(leth) : null;

  let status = null;
  if (isUtility || Math.random() < 0.5) {
    const s = pickStatusEffect(dtype || trapType);
    status = s ? s.v || s : null;
  }

  const b = dcBracket
    ? { detect: dcBracket, disarm: dcBracket, save: dcBracket }
    : chooseDCBracketsForLethality(leth);

  const dcs = {
    detect: pickDC("detect", b.detect),
    disarm: pickDC("disarm", b.disarm),
    save: pickDC("save", b.save),
  };

  const alarmChance = TRAPS_DATA?.alarm?.chance_by_type?.[trapType] ?? 0.25;
  const alarmed = Math.random() < alarmChance;
  const aPick = alarmed ? pickWeighted(TRAPS_DATA?.alarm?.effects || []) : null;
  const alarm_text = aPick ? aPick.v ?? aPick : null;

  const effectText = effectPreview;

  return {
    type: trapType,
    env,
    lethality: leth,
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
  function line(label, textHtml = "", pillsArr = []) {
    const pills = pillsArr.filter(Boolean).join(" ");
    const text = textHtml ? ` ${textHtml}` : "";
    const pillsHtml = pills ? ` <span class="line-pills">${pills}</span>` : "";
    return `<div class="trap-line"><b>${label}:</b>${text}${pillsHtml}</div>`;
  }

  const out = [];
  if (t.effect) out.push(line("Description", `${t.effect}.`));
  if (t.status) out.push(line("Effect", `${t.status}.`));
  if (t.damage && t.damage.dice) {
    out.push(line("Damage", `<strong>${t.damage.dice}</strong>`, [pillDamageType(t.damage.type)]));
  }
  if (t.dcs && t.dcs.detect) out.push(line("Detect", "", [dcOnlyPill(t.dcs.detect, "detect")]));
  if (t.trigger) out.push(line("Trigger", `${t.trigger}.`));
  if (t.dcs && t.dcs.disarm) out.push(line("Disarm", "", [dcOnlyPill(t.dcs.disarm, "disarm")]));
  if (t.save || (t.dcs && t.dcs.save)) {
    const save = pillSave(t.save);
    const dc = t.dcs && t.dcs.save ? dcOnlyPill(t.dcs.save, "avoid") : "";
    out.push(line("Avoid", "", [save, dc]));
  }
  if (t.reset) out.push(line("Reset", `${t.reset}.`));
  if (t.clue) out.push(line("Clue", `${t.clue}.`));

  const footer = [
    pillTrapType(t.type),
    pillLethality(t.lethality),
    pillEnv(t.env),
    pillArea(t.area),
    pillUtility(t.isUtility),
  ]
    .filter(Boolean)
    .join(" ");
  if (footer) out.push(`<div class="trap-footer-pills">${footer}</div>`);

  return out.join("");
}
