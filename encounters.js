import { pickWeighted } from "./utils.js";

export const ENCOUNTERS_PATH = "/data/encounters.json";
let ENCOUNTERS_DATA = null,
  ENCOUNTERS_READY = null;

export async function loadEncountersData() {
  if (ENCOUNTERS_READY) return ENCOUNTERS_READY;
  ENCOUNTERS_READY = (async () => {
    try {
      const res = await fetch(ENCOUNTERS_PATH, { cache: "no-store" });
      if (!res.ok) throw new Error(`Fetch ${ENCOUNTERS_PATH} → ${res.status}`);
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

export function rollEncounter(zone, risk) {
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
  const labelZ = z.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const labelR = r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `<div><strong>${labelZ} • ${labelR}</strong></div><div style="margin-top:.5em">${value}</div>`;
}
