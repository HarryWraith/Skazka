import { randint, pickWeighted, ucfirst } from "./utils.js";

export const DOORS_PATH = "/data/doors.json";
let DOORS_DATA = null,
  DOORS_READY = null;

export async function loadDoorsData() {
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
loadDoorsData();

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
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function rollDoor() {
  // 1) Lock type
  const lockTypePick = pickWeighted(DOORS_DATA.lock_types);
  const lockType = lockTypePick.v ?? lockTypePick;

  // 2) Material → base HP & Break DC
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

  // 4) Trapped?
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
  const locked = pickWeighted(lockedWeights);

  // Locked from (70/30) — blank if not locked
  let lockedFrom = "";
  if (locked === true) {
    const lfPick = pickWeighted(DOORS_DATA.locked_from_weights);
    lockedFrom = lfPick.v ?? lfPick;
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

    // Harder to pick if locked from OTHER SIDE
    if (locked === true && lockedFrom === "other side") {
      const otherSideMod = DOORS_DATA.other_side_lockpick_modifier ?? 3;
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
    locked_from: locked === true ? lockedFrom : "",
    lock_quality: hasLock ? lockQuality : "",
    material,
    hp,
    break_dc: breakDC,
    lockpick_possible: hasLock ? lockpickPossible : false,
    lockpick_dc: hasLock && lockpickPossible ? lockpickDC : "",
    is_trapped: isTrapped === true,
    is_damaged: isDamaged === true,
    notes: obstructionNote,
  };
}

export function renderDoor(d) {
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
