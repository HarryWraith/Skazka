import { pick } from "./utils.js";

export const NAMES_PATH = "/data/names.json";
let NAMES_DATA = null,
  NAMES_READY = null;

export async function loadNamesData() {
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

export function rollNamesPeople(species, gender, count = 3) {
  const people = NAMES_DATA?.people || {};
  const sp = people[species] ? species : Object.keys(people)[0];
  const g = gender === "female" || gender === "male" ? gender : "male";

  const pool = people[sp]?.[g] || [];
  const names = pickMany(pool, count);
  return names.join(", ");
}
