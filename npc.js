import * as names from "./names.js";
import { badge, alignClass, titleCase } from "./badges.js";

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const roll = (d, n = 3, add = 0) =>
  Array.from({ length: n }, () => 1 + Math.floor(Math.random() * d)).reduce(
    (s, x) => s + x,
    add
  );

const SPECIES = [
  "human",
  "elf",
  "dwarf",
  "halfling",
  "gnome",
  "half-elf",
  "half-orc",
  "tiefling",
  "dragonborn",
];
const GENDERS = ["female", "male"];
const ALIGN = ["LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE"];
const DEMEANOR = [
  "stoic",
  "cheery",
  "nervous",
  "boastful",
  "kindly",
  "cynical",
  "brutal",
  "scholarly",
  "devout",
  "secretive",
  "flirtatious",
  "suspicious",
];
const QUIRKS = [
  "hums sea shanties",
  "collects bottle caps",
  "fear of cats",
  "quotes obscure poets",
  "bad liar",
  "always hungry",
  "loves riddles",
  "superstitious",
  "never makes eye contact",
  "embroidered gloves",
  "keeps a lucky coin",
  "hates dwarven ale",
];

function genName(species = "human", gender = "") {
  try {
    const raw = names?.rollNamesPeople?.(species, gender, 1);
    if (typeof raw === "string") {
      const part = raw.split(/[\n,;]+/)[0].trim();
      if (part) return part;
    }
  } catch {}
  const F1 = [
    "Ari",
    "Bryn",
    "Cara",
    "Dane",
    "Edda",
    "Fenn",
    "Garr",
    "Hale",
    "Isla",
    "Jora",
    "Kellan",
    "Lysa",
    "Mira",
    "Nerin",
    "Odo",
    "Petra",
    "Quin",
    "Rook",
    "Sera",
    "Toma",
  ];
  const L1 = [
    "Ash",
    "Vale",
    "Fletcher",
    "Lantern",
    "Marsh",
    "Pike",
    "Stone",
    "Thorn",
    "Ridge",
    "Harbor",
    "Field",
    "Cross",
    "Hollow",
    "Gale",
    "Kettle",
  ];
  return `${pick(F1)} ${pick(L1)}`;
}

export function createNPC({
  role = "Commoner",
  species = pick(SPECIES),
  gender = pick(GENDERS),
  vibe = "", // optional hint (e.g., inn vibe)
  alignment = pick(ALIGN),
  ageYears = 16 + Math.floor(Math.random() * 50),
} = {}) {
  const name = genName(species, gender);
  const stats = {
    STR: roll(6),
    DEX: roll(6),
    CON: roll(6),
    INT: roll(6),
    WIS: roll(6),
    CHA: roll(6),
  };
  const demeanor = pick(DEMEANOR);
  const quirk = pick(QUIRKS);
  return {
    name,
    role,
    species,
    gender,
    alignment,
    ageYears,
    demeanor,
    quirk,
    stats,
    vibe,
  };
}

/* ---------- UI helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const pill = badge;

export function renderNPCBadges(npc) {
  const wrap = document.createElement("span");
  wrap.className = "tb-badges";
  wrap.append(
    pill("npc-role", npc.role),
    pill(`npc-align ${alignClass(npc.alignment)}`, npc.alignment),
    pill(`npc-gender ${String(npc.gender).toLowerCase()}`, npc.gender),
    pill(
      `npc-race ${String(npc.species).toLowerCase()}`,
      titleCase(npc.species)
    )
  );
  return wrap;
}

function renderNPC(npc) {
  const wrap = document.createElement("div");
  wrap.className = "tb-section";

  const head = document.createElement("div");
  head.className = "tb-row tb-row-head";
  const title = document.createElement("div");
  title.className = "tb-title";
  title.textContent = npc.name;
  const badges = renderNPCBadges(npc);
  head.append(title, document.createTextNode(" "), badges);
  wrap.append(head);

  const meta = document.createElement("div");
  meta.className = "tb-meta";
  meta.textContent = `${npc.species} ${
    npc.gender !== "unspecified" ? `(${npc.gender})` : ""
  } — age ${npc.ageYears}, ${npc.demeanor}; quirk: ${npc.quirk}`;
  wrap.append(meta);

  const ul = document.createElement("ul");
  ul.className = "tb-list tb-compact";
  const mk = (k, v) => {
    const li = document.createElement("li");
    li.className = "tb-row";
    const c = document.createElement("div");
    c.className = "tb-cell tb-grow";
    c.innerHTML = `<strong>${k}</strong> ${v}`;
    li.append(c);
    return li;
  };
  ul.append(
    mk("STR", npc.stats.STR),
    mk("DEX", npc.stats.DEX),
    mk("CON", npc.stats.CON),
    mk("INT", npc.stats.INT),
    mk("WIS", npc.stats.WIS),
    mk("CHA", npc.stats.CHA)
  );
  wrap.append(ul);

  return wrap;
}

/* ---------- data loader ---------- */
async function loadNpcData() {
  const url = new URL("./data/npc.json", import.meta.url).toString(); // single, canonical path
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  return res.json();
}

/* ---------- main: init UI (self-gating) ---------- */
export async function initNPC() {
  // match main.js expectations: only run when an NPC mount exists
  const mount = document.querySelector("#npc-panel, #npc, [data-npc]");
  if (!mount) return false;
  if (mount.dataset.bound === "1") return true;
  mount.dataset.bound = "1";

  const contextSel = $("#npcContext", mount);
  const occSel = $("#npcOccupation", mount);
  const rerollBtn = $("#npc-reroll", mount);
  const copyBtn = $("#npc-copy-text", mount);
  const debugSpan = $("#npc-debug", mount);
  const result =
    $("#npc-pretty", mount) ||
    mount.appendChild(
      Object.assign(document.createElement("div"), {
        id: "npc-pretty",
        className: "tb-result",
      })
    );

  // Load JSON (contexts & occupations)
  let data;
  try {
    data = await loadNpcData();
  } catch (err) {
    console.error(err);
    result.textContent = "Failed to load NPC data.";
    return true;
  }

  const contexts = Array.isArray(data?.tables?.contexts)
    ? data.tables.contexts
    : [];
  const occupations = Array.isArray(data?.tables?.occupations)
    ? data.tables.occupations
    : Array.isArray(data?.occupations)
    ? data.occupations
    : [];

  // Map: context label -> tags[]
  const ctxTags = {};
  contexts.forEach((c) => {
    if (c?.label) ctxTags[c.label] = Array.isArray(c.tags) ? c.tags : [];
  });

  // If the page's HTML didn't include options, hydrate Locale from data
  if (contextSel && contextSel.options.length <= 1) {
    const frag = document.createDocumentFragment();
    if (!contextSel.value) {
      const opt = new Option("— Select locale —", "", true, true);
      opt.disabled = true;
      frag.append(opt);
    }
    contexts.forEach((c) => frag.append(new Option(c.label, c.label)));
    contextSel.append(frag);
  }

  function populateOccupationsForContext() {
    if (!occSel) return;
    const ctxLabel = contextSel?.value || "";
    const tags = ctxTags[ctxLabel] || [];

    occSel.innerHTML = "";
    const prompt = new Option("— Select occupation —", "", true, true);
    prompt.disabled = true;
    occSel.append(prompt);

    const filtered = tags.length
      ? occupations.filter(
          (o) =>
            Array.isArray(o?.requiresAny) &&
            o.requiresAny.some((t) => tags.includes(t))
        )
      : occupations.slice();

    filtered.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    for (const o of filtered) occSel.append(new Option(o.label, o.label));

    occSel.disabled = filtered.length === 0;
  }

  contextSel?.addEventListener("change", populateOccupationsForContext);

  // Choose a sensible default Locale if none is set (prefers City → Town → Village / Rural)
  if (contextSel && (!contextSel.value || contextSel.value === "")) {
    const prefer = ["City", "Town", "Village / Rural"];
    const found = Array.from(contextSel.options).find((opt) =>
      prefer.includes(opt.value)
    );
    if (found) contextSel.value = found.value;
  }

  // Initial fill
  populateOccupationsForContext();

  // Reroll button — generate & render
  rerollBtn?.addEventListener("click", () => {
    const occ = occSel?.value || "Commoner";
    result.textContent = "Generating…";
    const npc = createNPC({ role: occ });
    result.innerHTML = "";
    result.append(renderNPC(npc));
    if (debugSpan) {
      debugSpan.textContent = `Locale: ${
        contextSel?.value || "—"
      }, Occupation: ${occ}`;
    }
  });

  // Copy button — copy visible text
  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(result.innerText || "");
      if (debugSpan) {
        debugSpan.textContent = "Copied!";
        setTimeout(() => (debugSpan.textContent = ""), 1200);
      }
    } catch (err) {
      console.error("Copy failed", err);
    }
  });

  // Optionally auto-generate one NPC if an occupation is already selectable
  if (occSel && !occSel.disabled) {
    // pick first real option if none selected yet
    const firstOcc = Array.from(occSel.options).find((o) => o.value);
    if (firstOcc && !occSel.value) occSel.value = firstOcc.value;
    if (occSel.value) rerollBtn?.click();
  }

  return true;
}

/* ---------- auto-init when markup present ---------- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initNPC(), {
    once: true,
  });
} else {
  initNPC();
}

export default initNPC;
