// encounters.js — unified replacement (v3.1)
// - Single loader (no extra patch fetches)
// - Uses badges.js for all pills (always `.tb-badge ...`)
// - Adds time-of-day + tag biasing, optional complications/hooks
import { pick, pickWeighted } from "./utils.js";
import { badgeHtml, titleCase } from "./badges.js";

export const ENCOUNTERS_PATH = "/data/encounters.json";
let ENCOUNTERS_DATA = null;
let ENCOUNTERS_READY = null;

export async function loadEncountersData() {
  if (ENCOUNTERS_READY) return ENCOUNTERS_READY;
  ENCOUNTERS_READY = (async () => {
    try {
      const res = await fetch(ENCOUNTERS_PATH, { cache: "no-store" });
      if (!res.ok) throw new Error(`Fetch ${ENCOUNTERS_PATH} → ${res.status}`);
      ENCOUNTERS_DATA = await res.json();
    } catch (err) {
      console.error("Failed to load encounters.json:", err);
      ENCOUNTERS_DATA = ENCOUNTERS_DATA || {
        schema: "encounters.v3.1",
        encounters: {},
      };
    }
  })();
  return ENCOUNTERS_READY;
}
loadEncountersData();

// ---------- helpers
function cssSafe(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unwrapPick(v) {
  return v && typeof v === "object" && "v" in v ? v.v : v;
}

function pickWeightedUnwrap(list) {
  const p = pickWeighted(list);
  return unwrapPick(p);
}

function zoneList() {
  const zones = ENCOUNTERS_DATA?.zones;
  if (Array.isArray(zones) && zones.length) return zones;
  return Object.keys(ENCOUNTERS_DATA?.encounters || {});
}
function riskList() {
  return (
    ENCOUNTERS_DATA?.risks || ["safe", "low", "moderate", "high", "deadly"]
  );
}
function weightedByTime(zone, items, timeOfDay) {
  if (!timeOfDay) return items;
  const bias =
    ENCOUNTERS_DATA?.time_bias_by_zone?.[zone]?.[
      String(timeOfDay).toLowerCase()
    ];
  if (!Array.isArray(bias) || !bias.length) return items;
  return items.map((row) => {
    const tags = new Set((row?.tags || []).map((t) => String(t).toLowerCase()));
    const bonus = bias.reduce(
      (acc, b) =>
        acc + (tags.has(String(b.hasTag).toLowerCase()) ? b.bonus || 0 : 0),
      0
    );
    return row && typeof row === "object"
      ? { ...row, w: (row.w || 1) + bonus }
      : row;
  });
}
function applyTagBias(items, desiredTags) {
  if (!desiredTags || !desiredTags.length) return items;
  const want = new Set(desiredTags.map((t) => String(t).toLowerCase()));
  return items.map((row) => {
    const tags = new Set((row?.tags || []).map((t) => String(t).toLowerCase()));
    const overlap = [...want].filter((t) => tags.has(t)).length;
    const bonus = overlap > 0 ? 2 * overlap : 0;
    return row && typeof row === "object"
      ? { ...row, w: (row.w || 1) + bonus }
      : row;
  });
}

// ---------- core API
export function rollEncounterV31({
  zone,
  risk,
  timeOfDay,
  tags = [],
  withComplication = true,
} = {}) {
  if (!ENCOUNTERS_DATA) return { html: "Encounters loading…", raw: null };

  const zones = zoneList();
  const risks = riskList();
  const z = zones.includes(zone) ? zone : zones[0];
  const r = risks.includes(risk) ? risk : risks[0];

  let list = ENCOUNTERS_DATA?.encounters?.[z]?.[r];
  if (!Array.isArray(list) || !list.length) {
    const labelZ = titleCase(z || "—");
    const labelR = titleCase(r || "—");
    return {
      html: `No encounters found for <em>${labelZ}</em> › <em>${labelR}</em>.`,
      raw: null,
    };
  }

  // Biasing passes
  let biased = list.slice();
  biased = weightedByTime(z, biased, timeOfDay);
  biased = applyTagBias(biased, tags);

  const chosen = pickWeighted(biased);
  const text = unwrapPick(chosen) || "";
  const encounterText =
    chosen && typeof chosen === "object" && chosen.t ? chosen.t : text;
  const encounterTags =
    chosen && typeof chosen === "object" && chosen.tags ? chosen.tags : [];

  // Optional complication by risk
  let comp = null;
  if (withComplication && ENCOUNTERS_DATA?.complications?.[r]?.length) {
    const compList = weightedByTime(
      z,
      ENCOUNTERS_DATA.complications[r],
      timeOfDay
    );
    comp = pickWeightedUnwrap(compList);
  }

  // Optional flavor hook
  let hook = null;
  if (Array.isArray(ENCOUNTERS_DATA?.flavor_hooks) && Math.random() < 0.35) {
    hook = pick(ENCOUNTERS_DATA.flavor_hooks);
  }

  // Pills — all via badges.js (always `.tb-badge ...`)
  const pills = [
    badgeHtml(`enc-zone zone-${cssSafe(z)}`, titleCase(z)),
    badgeHtml(`enc-risk risk-${cssSafe(r)}`, titleCase(r)),
    timeOfDay
      ? badgeHtml(`enc-time time-${cssSafe(timeOfDay)}`, titleCase(timeOfDay))
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tagsHtml = (encounterTags || [])
    .map((t) => badgeHtml(`enc-tag tag-${cssSafe(t)}`, titleCase(t)))
    .join(" ");

  let body = `<div class="enc-header-pills" aria-label="${titleCase(
    z
  )} ${titleCase(r)}">${pills}</div>`;
  body += `<div style="margin-top:.5em">${encounterText}</div>`;
  if (tagsHtml) body += `<div style="margin-top:.35em">${tagsHtml}</div>`;
  if (comp)
    body += `<div class="enc-complication" style="margin-top:.5em"><em>Complication:</em> ${comp}</div>`;
  if (hook)
    body += `<div class="enc-hook" style="margin-top:.35em"><em>Hook:</em> ${hook}</div>`;

  return {
    html: body,
    raw: {
      zone: z,
      risk: r,
      text: encounterText,
      tags: encounterTags,
      complication: comp,
      hook,
    },
  };
}

// Back-compat wrapper returning HTML only
export function rollEncounter(zone, risk) {
  const { html } = rollEncounterV31({ zone, risk });
  return html;
}
