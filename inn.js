/* =========================
   inn.js — Tavern/Inn generator (data-driven)
   - Uses ./data/inn.json for structure + wordbanks
   - Uses services.js for menu items + coin chips
   - Uses npc-core.js for staff (names via names.js internally)
   - Renders Quirks/Hooks as clean bullet lists
   ========================= */

import { loadServicesData } from "./services.js";
import { createNPC } from "./npc.js";

/* ---------- config ---------- */
const INN_DATA_URL = "./data/inn.json";

/* ---------- tiny utils ---------- */
const r = (n) => Math.floor(Math.random() * n);
const choice = (arr) => arr[r(arr.length)];
const randint = (min, max) => min + r(Math.max(0, max - min + 1));
const title = (s) => String(s || "").replace(/\b\w/g, (c) => c.toUpperCase());
const shuffle = (a) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = r(i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/* ---------- weighted pick (used for species, vibe, type) ---------- */
function weightedPick(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return null;
  const total = entries.reduce((s, [, w]) => s + (w || 0), 0);
  let roll = Math.random() * total;
  for (const [k, w] of entries) {
    roll -= w || 0;
    if (roll <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

/* ---------- species weights for staff (common > rare) ---------- */
const SPECIES_WEIGHTS = {
  human: 20,
  elf: 8,
  dwarf: 8,
  halfling: 5,
  gnome: 3,
  "half-elf": 5,
  "half-orc": 3,
  tiefling: 2,
  dragonborn: 2,
  kenku: 1,
};

/* ---------- data loader ---------- */
let innCache = null,
  innCacheUrl = null;
async function loadInnData(url = INN_DATA_URL) {
  if (!innCache || innCacheUrl !== url) {
    innCacheUrl = url;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    innCache = await res.json();
  }
  return innCache;
}

/* ---------- badges & chips ---------- */
function pill(cls, text) {
  const el = document.createElement("span");
  el.className = `tb-badge ${cls}`;
  el.textContent = text;
  return el;
}
const typePill = (key, label) => pill(`kind kind-${key}`, label || key);
const vibePill = (key) => pill(`tone tone-${key}`, title(key));
const tagPill = (key, label) => pill(`inn-tag tag-${key}`, label || key);

function qualityPill(q) {
  const cls = String(q || "").replace(/_/g, "-");
  return pill(
    `quality quality-${cls}`,
    title(String(q || "").replace(/_/g, " "))
  );
}
function modelPill(model) {
  const cls = String(model || "").replace(/_/g, "-");
  const label = MODEL_LABEL[model] || model;
  return pill(`model model-${cls}`, label);
}
function illicitPill(is) {
  return is ? pill("illicit tb-badge-warn", "Illicit") : null;
}

function coinChips(price) {
  const wrap = document.createElement("span");
  wrap.className = "coins";
  for (const k of ["pp", "gp", "sp", "cp"]) {
    const v = price?.[k];
    if (!v) continue;
    const el = document.createElement("span");
    el.className = `coin coin-${k}`;
    el.textContent = `${v}${k}`;
    wrap.append(el);
  }
  if (!wrap.childElementCount) wrap.textContent = "—";
  return wrap;
}
const MODEL_LABEL = {
  flat: "flat fee",
  per_person: "per person",
  per_meal: "per meal",
  per_night: "per night",
  per_hour: "per hour",
  per_day: "per day",
  per_mile: "per mile",
  per_animal_day: "per animal/day",
  per_page: "per page",
  per_letter: "per letter",
  per_load: "per load",
};

/* ---------- name & menu helpers ---------- */
function makeInnName(nameCfg) {
  const w = nameCfg?.weights || { specials: 1, patterns: 9 };
  const pickSpecial = Math.random() < w.specials / (w.specials + w.patterns);
  if (
    pickSpecial &&
    Array.isArray(nameCfg?.specials) &&
    nameCfg.specials.length
  ) {
    return choice(nameCfg.specials);
  }
  const pat = choice(nameCfg?.patterns || ["The {adj} {creature}"]);
  const wb = nameCfg?.wordbanks || {};
  const slot = (k, fb = ["Golden"]) => choice(wb[k] || fb);
  return pat
    .replace("{adj}", slot("adjectives"))
    .replace("{animal}", slot("animals"))
    .replace("{creature}", slot("creatures"))
    .replace("{color}", slot("colors"))
    .replace("{body}", slot("body_parts"))
    .replace("{noble}", slot("noble_possessive"))
    .replace("{arms}", slot("arms_words"))
    .replace("{noun}", slot("objects"))
    .replace("{place}", slot("places"))
    .replace("{verb}", slot("verbs_ing"));
}

function pickSome(arr, min, max) {
  if (!Array.isArray(arr) || !arr.length) return [];
  const count = randint(min, max);
  return shuffle(arr).slice(0, Math.min(count, arr.length));
}

function filterServices(services, filter = {}, preferQuality = "") {
  const types = filter.service_type || null;
  const models = filter.service_model || null;
  const illicit = filter.is_illicit;
  const nameRx = filter.name_regex ? new RegExp(filter.name_regex, "i") : null;
  const quals = filter.quality || null;

  let list = services.filter((s) => {
    if (types && !types.includes(s.service_type)) return false;
    if (models && !models.includes(s.service_model)) return false;
    if (typeof illicit === "boolean" && !!s.is_illicit !== illicit)
      return false;
    if (nameRx && !nameRx.test(s.name || "")) return false;
    if (quals && !quals.includes(s.quality)) return false;
    return true;
  });

  if (preferQuality) {
    const exact = list.filter((s) => s.quality === preferQuality);
    if (exact.length) list = exact;
  }
  return list;
}

/* ---------- main generate ---------- */
async function generateInn({
  vibeOverride = "",
  typeOverride = "",
  qualityPref = "",
} = {}) {
  const [cfg, services] = await Promise.all([
    loadInnData(),
    loadServicesData(),
  ]);
  if (!cfg) throw new Error("Inn config missing");

  const vibeKey =
    vibeOverride || weightedPick(cfg.weights?.vibe || { cozy: 1 });
  const typeKey = typeOverride || weightedPick(cfg.weights?.type || { inn: 1 });
  const vibe = cfg.vibe?.[vibeKey] || { vibe: [] };
  const type = (cfg.type || []).find((t) => t.key === typeKey) || {
    key: typeKey,
    label: title(typeKey),
    badges: [],
  };

  const name = makeInnName(cfg.name);

  const featureDefs = cfg.features || [];
  const baseFeatureKeys = vibe.badges || [];
  const extra = pickSome(featureDefs, 0, 2).map((f) => f.key);
  const featureKeys = [...new Set([...baseFeatureKeys, ...extra])];

  const menu = {};
  for (const cat of cfg.menu || []) {
    if (
      cat.gate_by_vibe &&
      Math.random() > (cfg.vibe?.[vibeKey]?.illicit_prob || 0)
    ) {
      menu[cat.key] = [];
      continue;
    }
    const pool = filterServices(services, cat.filter || {}, qualityPref);
    menu[cat.key] = pickSome(
      pool,
      cat.min ?? 0,
      cat.max ?? Math.min(3, pool.length)
    );
  }

  /* ---------- STAFF (weighted species + show species) ---------- */
  const roles = cfg.staff?.roles || [];
  const cnt = randint(cfg.staff?.count?.min || 2, cfg.staff?.count?.max || 5);

  const staff = Array.from({ length: cnt }, () => {
    const role = choice(roles) || "Staff";
    const species = weightedPick(SPECIES_WEIGHTS) || "human"; // bias toward common folk
    const npc = createNPC({ role, species, vibe: vibeKey });
    return { role, name: npc.name, species: npc.species || species };
  });

  const quirks = pickSome(cfg.quirks || [], 1, 2);
  const hooks = pickSome(cfg.hooks || [], 2, 3);

  return { name, vibeKey, vibe, type, featureKeys, menu, staff, quirks, hooks };
}

/* ---------- render ---------- */
function rowForService(s) {
  const li = document.createElement("li");
  li.className = "tb-row";

  const left = document.createElement("div");
  left.className = "tb-cell tb-grow";

  const titleEl = document.createElement("div");
  titleEl.className = "tb-title";
  titleEl.textContent = s.name;

  const meta = document.createElement("div");
  meta.className = "tb-meta";
  meta.append(
    qualityPill(s.quality),
    document.createTextNode(" "),
    modelPill(s.service_model)
  );
  const il = illicitPill(s.is_illicit);
  if (il) meta.append(document.createTextNode(" "), il);

  left.append(titleEl, meta);

  const right = document.createElement("div");
  right.className = "tb-cell tb-nowrap";
  right.append(coinChips(s.price_coins));

  li.append(left, right);
  return li;
}
function section(label, items) {
  if (!items?.length) return null;
  const h = document.createElement("div");
  h.className = "tb-meta";
  h.textContent = label;
  const ul = document.createElement("ul");
  ul.className = "tb-list tb-compact";
  items.forEach((it) => ul.append(rowForService(it)));
  const frag = document.createDocumentFragment();
  frag.append(h, ul);
  return frag;
}

function renderInn(target, data, cfg) {
  target.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "tb-section";

  // Header
  const head = document.createElement("div");
  head.className = "tb-row tb-row-head";
  const titleEl = document.createElement("div");
  titleEl.className = "tb-title";
  titleEl.textContent = data.name;
  head.append(
    titleEl,
    document.createTextNode(" "),
    typePill(data.type.key, data.type.label),
    document.createTextNode(" "),
    vibePill(data.vibeKey)
  );
  wrap.append(head);

  // Vibe line
  if (data.vibe?.vibe?.length) {
    const p = document.createElement("p");
    p.textContent = `Vibe: ${data.vibe.vibe.join(", ")}.`;
    wrap.append(p);
  }

  // Feature tags
  if (data.featureKeys?.length) {
    const meta = document.createElement("div");
    meta.className = "tb-meta";
    meta.textContent = "Features: ";
    for (const key of data.featureKeys) {
      const def = (cfg.features || []).find((f) => f.key === key);
      meta.append(
        document.createTextNode(" "),
        tagPill(key, def?.label || key)
      );
    }
    wrap.append(meta);
  }

  // Staff list
  if (data.staff?.length) {
    const staffHead = document.createElement("div");
    staffHead.className = "tb-meta";
    staffHead.textContent = "Staff";
    wrap.append(staffHead);

    const ul = document.createElement("ul");
    ul.className = "tb-list tb-compact";
    for (const s of data.staff) {
      const li = document.createElement("li");
      li.className = "tb-row";
      const left = document.createElement("div");
      left.className = "tb-cell tb-grow";
      const nm = document.createElement("div");
      nm.className = "tb-title";
      nm.textContent = s.name;
      const m = document.createElement("div");
      m.className = "tb-meta";
      m.textContent = `${s.role} — ${title(
        String(s.species).replace(/_/g, " ")
      )}`;
      left.append(nm, m);
      li.append(left);
      ul.append(li);
    }
    wrap.append(ul);
  }

  // Menu sections
  const catByKey = Object.fromEntries((cfg.menu || []).map((c) => [c.key, c]));
  const addSection = (key, label) => {
    const frag = section(
      label || catByKey[key]?.label || title(key),
      data.menu[key]
    );
    if (frag) wrap.append(frag);
  };
  addSection("meals");
  addSection("drinks");
  addSection("lodging");
  addSection("baths", "Baths & Laundry");
  addSection("stabling");
  addSection("illicit", "Under-the-counter");

  // ─────────────────────── Quirks & Hooks (pretty lists) — START ───────────────────────
  // Replaces older join("; ") version with neat bullet lists in two columns.
  const flavor = document.createElement("div");
  flavor.className = "tb-grid tb-flavor"; // align-items: start (see CSS)

  flavor.append(
    listBlock("Quirks", data.quirks, "spark"), // ✶ icon
    listBlock("Hooks", data.hooks, "quest") // ⚑ icon
  );
  wrap.append(flavor);

  function listBlock(titleText, items = [], icon = "spark") {
    const box = document.createElement("div");

    const h = document.createElement("div");
    h.className = "tb-meta";
    h.textContent = titleText;

    const ul = document.createElement("ul");
    ul.className = "tb-flavor-list"; // custom list styling
    ul.dataset.icon = icon; // choose icon via CSS: spark | quest

    for (const t of items) {
      const li = document.createElement("li");
      li.textContent = t;
      ul.append(li);
    }

    box.append(h, ul);
    return box;
  }
  // ─────────────────────── Quirks & Hooks (pretty lists) — END ───────────────────────

  target.append(wrap);
}

/* ---------- boot (self-gated) ---------- */
window.addEventListener("DOMContentLoaded", async () => {
  const btn = document.querySelector("#innGenBtn");
  const result = document.querySelector("#innResult");
  if (!btn || !result) return; // self-gate

  const vibeSel = document.querySelector("#innVibe, #innTone");
  const typeSel = document.querySelector("#innType");
  const qualitySel = document.querySelector("#innQuality"); // optional

  async function go() {
    result.textContent = "Generating…";
    let cfg;
    try {
      cfg = await loadInnData();
    } catch (e) {
      console.error(e);
      result.innerHTML = `<div class="tb-result">Couldn't load <code>${INN_DATA_URL}</code>.</div>`;
      return;
    }
    const data = await generateInn({
      vibeOverride: vibeSel?.value || "",
      typeOverride: typeSel?.value || "",
      qualityPref: qualitySel?.value || "",
    });
    renderInn(result, data, cfg);
  }

  btn.addEventListener("click", go);
});
