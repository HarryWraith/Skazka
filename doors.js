// doors.js — v5 (no fallbacks; situational pickability; challenge affects DC; reroll to avoid identical output)
//
// Rules implemented:
// - Door state shown first; normalized so "Closed Locked" only when a lock exists.
// - Break DC = material bracket (+ quality mod) + challenge dc_mod_all, clamped.
// - Pick DC = by lock TYPE bracket + small QUALITY add (magical +0) + challenge dc_mod_all.
// - Pickability is SITUATIONAL (quality does NOT decide):
//     • Unpickable if: (locks_from === "other side" AND lock_type ∈ {padlock, puzzle lock}) OR lock is broken.
//     • Magical/Arcane locks can NEVER be "broken". (But they can still be pickable/unpickable depending on situation.)
//     • No lock => Pick line blank.
// - "Locks from": only for padlock/deadbolt/puzzle lock; blank otherwise.
// - Damaged condition halves HP.
// - Small reroll loop prevents consecutive identical renders (no main.js changes).
//
// Requirements in ./data/doors.json:
// - challenge_bias includes keys (e.g., very_easy/easy/medium/hard/very_hard) with dc_mod_all numbers.
// - dc_brackets with ranges.
// - materials, qualities, lock_types, lock_qualities, locked_weights_by_type, locked_from_weights, door_states, hinges.
// - Optional: "lock_broken": { "base_pct": 5, "if_damaged_pct": 25 }

import { randint, pick, pickWeighted } from "./utils.js";
import { badgeHtml, titleCase } from "./badges.js";

export const DOORS_PATH = "./data/doors.json";
let DOORS_DATA = null;
let DOORS_ERROR = "";

// Remember last visible result so clicks always look responsive
let LAST_SIG = null;
function doorSignature(d) {
  return [
    d.door_state,
    d.material,
    d.hp,
    d.break_dc,
    d.lock_type,
    d.lock_quality,
    d.locks_from,
    d.lock_unpickable ? "U" : "P",
    d.lock_unpickable_broken ? "B" : "-",
    d.lockpick_possible === null ? "NL" : d.lockpick_possible ? "Y" : "N",
    d.lockpick_dc ?? "",
    d.hinges_noise,
    d.hinges_open_fail_pct,
    d.is_trapped ? "T" : "NT",
    d.is_damaged ? "D" : "I",
  ].join("|");
}

/* ---------------- load data (no fallback) ---------------- */
export async function loadDoorsData() {
  try {
    const res = await fetch(DOORS_PATH, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    DOORS_DATA = await res.json();
  } catch (e) {
    DOORS_ERROR = `Door data failed to load from ${DOORS_PATH}: ${e.message}`;
    DOORS_DATA = null;
  }
}
await loadDoorsData();

/* ---------------- helpers ---------------- */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const rbool = (pct) => randint(1, 100) <= pct;
const asInt = (n) => (Number.isFinite(+n) ? Math.floor(+n) : 0);

function dcFromBracket(data, name) {
  const b = data?.dc_brackets?.[name];
  if (!b) return 10;
  return randint(asInt(b.min), asInt(b.max));
}
function randFromRange(val) {
  if (Array.isArray(val) && val.length >= 2)
    return randint(asInt(val[0]), asInt(val[1]));
  return asInt(val);
}
function pickRow(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const sel = pickWeighted(list);
  if (sel && typeof sel === "object" && "v" in sel) return sel;
  return (
    list.find((o) => o && typeof o === "object" && o.v === sel) ||
    (sel ? { v: sel } : null)
  );
}
function weightMerge(baseArr, overrides = {}) {
  if (!Array.isArray(baseArr)) return [];
  const byName = Object.fromEntries(baseArr.map((o) => [o.v, o.w || 1]));
  for (const [k, v] of Object.entries(overrides || {})) {
    if (byName[k] == null) continue;
    byName[k] = Math.max(0, (byName[k] || 0) + (v - 1));
  }
  return Object.entries(byName).map(([v, w]) => ({ v, w }));
}
function normalizeState(stateText, lockType, locked) {
  const st = (stateText || "").toLowerCase();
  if (st === "open" || st === "ajar" || st === "obstructed")
    return titleCase(st);
  const lt = (lockType || "").toLowerCase();
  if (lt === "no lock" || lt === "obstruction") return "Closed Unlocked";
  return locked ? "Closed Locked" : "Closed Unlocked";
}
function hingeChips(hingeRow) {
  if (!hingeRow) return [];
  const chips = [];
  const n = (hingeRow.noise || "").toLowerCase();
  chips.push(n === "silent" ? "Silent" : "Noisy");
  if (hingeRow.jammed) chips.push("Jammed");
  if (Number(hingeRow.open_fail_pct || 0) > 0) chips.push("Breaks on Open");
  return chips;
}

/* --- Lock type difficulty & quality DC add (magical adds 0) --- */
const TYPE_DC_BRACKET = {
  "std door key": "easy",
  padlock: "medium",
  "puzzle lock": "hard",
  deadbolt: "hard",
  "arcane seal": "nearly_impossible",
};
const QUALITY_DC_ADD = {
  common: 0,
  sturdy: 1,
  fine: 2,
  exquisite: 3,
  magical: 0, // magical never increases DC; type already accounts for it
};

/* ---------------- core ---------------- */
export function rollDoor(opts) {
  if (DOORS_ERROR || !DOORS_DATA) {
    return { _error: DOORS_ERROR || "Door data not loaded." };
  }
  const data = DOORS_DATA;

  // Try a handful of times to avoid an identical repeat
  const MAX_TRIES = 6;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const d = generateOnce(data, opts);
    if (d._error) return d;

    const sig = doorSignature(d);
    if (sig !== LAST_SIG || attempt === MAX_TRIES - 1) {
      LAST_SIG = sig;
      return d;
    }
  }
}

function generateOnce(data, opts) {
  const challenge =
    typeof opts === "string" ? opts : opts?.challenge || "medium";
  const bias =
    data.challenge_bias?.[challenge] || data.challenge_bias?.medium || {};
  const dcModAll = Number(bias.dc_mod_all || 0);

  // 1) Material + Quality
  const materialRow = pickRow(data.materials);
  const qualityRow = pickRow(data.qualities);
  if (!materialRow || !qualityRow)
    return { _error: "Door data incomplete: materials/qualities missing." };

  let hp = Math.max(
    1,
    Math.floor(
      randFromRange(materialRow.hp) *
        (qualityRow.hp_multiplier ?? qualityRow.hp_mult ?? 1)
    )
  );

  let breakDC =
    (typeof materialRow.break_dc === "string"
      ? dcFromBracket(data, materialRow.break_dc)
      : asInt(materialRow.break_dc)) +
    (qualityRow.dc_modifier ?? qualityRow.dc_mod ?? 0);

  // apply challenge mod to Break DC and clamp
  breakDC = clamp(
    breakDC + dcModAll,
    data.dc_brackets.very_easy.min,
    data.dc_brackets.nearly_impossible.max
  );

  // 2) Hinges
  const hingeRow = pickRow(data.hinges);

  // 3) Door state (raw)
  const stateRow = pickRow(data.door_states);
  if (!stateRow)
    return { _error: "Door data incomplete: door_states missing." };

  // 4) Lock type + quality (+ bias)
  const ltRow = pickRow(data.lock_types);
  if (!ltRow) return { _error: "Door data incomplete: lock_types missing." };
  const type = ltRow.v || "no lock";

  const biasedQuals = weightMerge(
    data.lock_qualities,
    bias.lock_quality_weight || {}
  );
  const lqRow = pickRow(biasedQuals);
  if (!lqRow)
    return { _error: "Door data incomplete: lock_qualities missing." };
  let quality = lqRow.v;

  // Arcane seal => force magical quality (but NOT inherently unpickable)
  if ((type || "").toLowerCase() === "arcane seal") quality = "magical";

  // Locked?
  let locked = false;
  if (stateRow.locks_allowed && type !== "no lock") {
    const pool = data.locked_weights_by_type?.[type];
    if (!pool)
      return {
        _error: `Door data incomplete: locked_weights_by_type["${type}"] missing.`,
      };
    locked = pickWeighted(pool) === true;
  }

  // Normalize state against lock presence
  const doorState = normalizeState(stateRow.v, type, locked);

  // Locks from: only for padlock / deadbolt / puzzle lock
  const eligibleTypes = new Set(["padlock", "deadbolt", "puzzle lock"]);
  const locks_from = eligibleTypes.has((type || "").toLowerCase())
    ? pickRow(data.locked_from_weights)?.v || ""
    : "";

  // 5) Traps (challenge-aware yes/no)
  const trapChance = Number.isFinite(bias.trap_chance_pct)
    ? bias.trap_chance_pct
    : 20;
  const is_trapped = rbool(trapChance);

  // 6) Door condition: damaged halves HP
  const is_damaged = rbool(8);
  if (is_damaged) hp = Math.max(1, Math.floor(hp / 2));

  // 7) Pickability & DC — situational rules only (no quality-based chance)
  let lock_unpickable = false;
  let lock_unpickable_broken = false;
  let lockpick_possible = null; // null => no lock
  let lockpick_dc = null;

  const hasLock = (type || "").toLowerCase() !== "no lock";
  if (hasLock) {
    // Broken lock? (magical/arcane cannot be broken)
    const isMagical =
      (quality || "").toLowerCase() === "magical" ||
      (type || "").toLowerCase() === "arcane seal";
    const cfg = data.lock_broken || {};
    const basePct = Number(cfg.base_pct ?? 5);
    const dmgPct = Number(cfg.if_damaged_pct ?? 25);
    const brokenRollPct = is_damaged ? dmgPct : basePct;
    const lock_broken = !isMagical && rbool(Math.max(0, brokenRollPct));

    // Unpickable because it locks from the other side (padlock/puzzle lock only)
    const sideLocks = new Set(["padlock", "puzzle lock"]);
    const unpickableOtherSide =
      sideLocks.has((type || "").toLowerCase()) &&
      (locks_from || "").toLowerCase() === "other side";

    if (lock_broken || unpickableOtherSide) {
      lock_unpickable = true;
      lock_unpickable_broken = lock_broken; // mark only if broken is the reason
      lockpick_possible = false;
      lockpick_dc = null;
    } else {
      // Pickable → compute DC from lock type + quality + challenge (quality adds small bump, magical adds 0)
      lockpick_possible = true;
      const baseBracket =
        TYPE_DC_BRACKET[(type || "").toLowerCase()] || "medium";
      const baseDC = dcFromBracket(data, baseBracket);
      const add = QUALITY_DC_ADD[(quality || "").toLowerCase()] ?? 0;
      lockpick_dc = clamp(
        baseDC + add + dcModAll,
        data.dc_brackets.very_easy.min,
        data.dc_brackets.nearly_impossible.max
      );
    }
  }

  // 8) Notes (if you use "obstruction" as a lock type)
  let notes = "";
  if ((type || "").toLowerCase() === "obstruction") {
    notes = pick(data.obstruction_examples || []) || "";
  }

  return {
    // top-line status
    door_state: doorState,

    // door stats
    material: materialRow.v,
    hp,
    break_dc: breakDC,

    // lock bundle
    lock_type: type,
    lock_quality: (type || "").toLowerCase() === "no lock" ? "" : quality,
    locks_from, // only for padlock/deadbolt/puzzle lock

    // pickability (situational)
    lock_unpickable,
    lock_unpickable_broken, // true only if "broken" is the reason
    lockpick_possible, // null when no lock; true/false otherwise
    lockpick_dc, // number when pickable; null when unpickable or no lock

    // traps & condition
    is_trapped,
    is_damaged, // HP already halved above

    // hinges summary
    hinges_name: hingeRow?.v || "",
    hinges_noise: hingeRow?.noise || "",
    hinges_open_fail_pct: hingeRow?.open_fail_pct || 0,

    // optional flavor (e.g., obstruction note)
    notes,
  };
}

/* ---------------- rendering ---------------- */
export function renderDoor(d) {
  if (!d || d._error) {
    const msg = d?._error || DOORS_ERROR || "Door data not loaded.";
    return `<div class="door-vertical">
      <div class="door-line"><b>Door Generator:</b> ${badgeHtml(
        "tb-badge-warn",
        "Error"
      )}</div>
      <div class="door-line"><em>${msg}</em></div>
    </div>`;
  }

  const pills = (arr) => arr.filter(Boolean).join(" ");
  const cap = (v) => titleCase(String(v ?? ""));

  // Door state FIRST
  const stateSlug = String(d.door_state ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const lineState = `<div class="door-line"><b>Door state:</b> ${badgeHtml(
    `door-state state-${stateSlug}`,
    titleCase(d.door_state)
  )}</div>`;

  // Door material
  const lineMaterial = `<div class="door-line"><b>Door material:</b> ${badgeHtml(
    "door-mat",
    cap(d.material)
  )}</div>`;

  // Hardness (HP)
  const lineHardness = `<div class="door-line"><b>Hardness:</b> ${badgeHtml(
    "door-hp",
    `HP ${d.hp}`
  )}</div>`;

  // Toughness (Break DC)
  const lineToughness = `<div class="door-line"><b>Toughness:</b> ${badgeHtml(
    `door-breakdc dcv-${d.break_dc}`,
    `Break DC ${d.break_dc}`
  )}</div>`;

  // Lock: [type] | [quality] (hide quality for no lock)
  const lockTypeP = badgeHtml("door-lock", cap(d.lock_type || "no lock"));
  const lockQualP = d.lock_quality
    ? badgeHtml("door-lockq", cap(d.lock_quality))
    : "";
  const lineLock = `<div class="door-line"><b>Lock:</b> ${pills([
    lockTypeP,
    lockQualP,
  ])}</div>`;

  // Locks from (blank unless eligible type)
  const lineLocksFrom = `<div class="door-line"><b>Locks from:</b> ${
    d.locks_from ? badgeHtml("door-side", cap(d.locks_from)) : ""
  }</div>`;

  // Pick (blank if no lock)
  let pickHTML = "";
  const hasLock = (d.lock_type || "").toLowerCase() !== "no lock";
  if (hasLock) {
    if (d.lock_unpickable) {
      // Reason-based label
      const label = d.lock_unpickable_broken
        ? "Unpickable - broken"
        : "Unpickable";
      pickHTML = badgeHtml("door-pickdc pick-impossible", label);
    } else if (d.lockpick_possible && d.lockpick_dc) {
      pickHTML = [
        badgeHtml("door-pick ok", "Pickable"),
        badgeHtml(
          `door-pickdc dcv-${d.lockpick_dc}`,
          `Pick DC ${d.lockpick_dc}`
        ),
      ].join(" ");
    } else {
      pickHTML = ""; // neutral blank if something is missing
    }
  }
  const linePick = `<div class="door-line"><b>Pick:</b> ${pickHTML}</div>`;

  // Trapped
  const trapP = d.is_trapped
    ? badgeHtml("door-trap trap-yes tb-badge-warn", "Trapped")
    : badgeHtml("door-trap trap-no", "No Trap");
  const lineTrapped = `<div class="door-line"><b>Trapped:</b> ${trapP}</div>`;

  // Hinges
  const hingeBits = hingeChips({
    noise: d.hinges_noise,
    open_fail_pct: d.hinges_open_fail_pct,
    jammed: (d.hinges_name || "").toLowerCase() === "jammed",
  }).map((t) => badgeHtml("door-hingechip", t));
  const lineHinges = `<div class="door-line"><b>Hinges:</b> ${pills(
    hingeBits
  )}</div>`;

  // Door condition (damaged halves HP already applied)
  const condP = d.is_damaged
    ? badgeHtml("door-damage dmg-yes", "Damaged")
    : badgeHtml("door-damage dmg-no", "Intact");
  const lineCondition = `<div class="door-line"><b>Door condition:</b> ${condP}</div>`;

  // Optional notes
  const lineNotes = d.notes
    ? `<div class="door-line"><b>Notes:</b> <em>${d.notes}</em></div>`
    : "";

  return `<div class="door-vertical">${[
    lineState,
    lineMaterial,
    lineHardness,
    lineToughness,
    lineLock,
    lineLocksFrom,
    linePick,
    lineTrapped,
    lineHinges,
    lineCondition,
    lineNotes,
  ].join("")}</div>`;
}
