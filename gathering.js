/* gathering.js — Herbs + Foraging + Hunting Generators (DnD 5e)
   - Loads herbs.json, foraging.json, hunting.json
   - Ecology sanity for data items (coast-only kelp/shellfish, desert succulents, mountain lichens)
   - Herbs: enforces valid type combos (no "enhancer" alone; no toxin+medicinal conflict)
   - Foraging: category tag
   - Hunting: adds 'hideType' and rarity filter
   - Selection = habitat weight × rarity weight (with optional rarity filter = exact match)
*/
import { badgeHtml, titleCase } from "./badges.js";
document.addEventListener("DOMContentLoaded", () => {
  // -------------------------
  // Config
  // -------------------------
  const HERB_FILES = [
    "data/herbs.json",
    // "data/herbs_expansion_pack_A.json", // optional
  ];
  const FORAGE_FILES = ["data/foraging.json"];
  const HUNT_FILES = ["data/hunting.json"];

  // Rarity weights (higher = more common)
  const RARITY_WEIGHTS = {
    Common: 12,
    Uncommon: 7,
    Rare: 4,
    "Very Rare": 2,
    Legendary: 1,
  };

  // Allowed herb type sets (order-agnostic)
  const ALLOWED_TYPES = new Set([
    "medicinal",
    "toxin",
    "medicinal,enhancer",
    "toxin,enhancer",
  ]);

  // -------------------------
  // DOM refs
  // -------------------------
  // HERBS
  const elHerbResult = document.getElementById("gatherResult");
  const elHerbGather = document.getElementById("gatherBtn");
  const elHerbReroll = document.getElementById("rerollBtn");
  const elHerbHabitat = document.getElementById("habitatSelect");

  // FORAGING
  const elForResult = document.getElementById("forageResult");
  const elForGather = document.getElementById("forageBtn");
  const elForReroll = document.getElementById("forageRerollBtn");
  const elForHabitat = document.getElementById("forageHabitatSelect");

  // HUNTING
  const elHuntResult = document.getElementById("huntResult");
  const elHuntGather = document.getElementById("huntBtn");
  const elHuntReroll = document.getElementById("huntRerollBtn");
  const elHuntHabitat = document.getElementById("huntHabitatSelect");

  let HERBS = [];
  let FORAGE = [];
  let HUNT = [];

  let lastHerbHabitat = null;
  let lastForageHabitat = null;
  let lastHuntHabitat = null;

  // -------------------------
  // Utilities
  // -------------------------
  const safeJoin = (arr, sep = ", ") =>
    (Array.isArray(arr) ? arr : [arr]).filter(Boolean).join(sep);

  const okJSON = (resp) => (resp && resp.ok ? resp.json() : null);

  function rescaleWeights(weights) {
    const entries = Object.entries(weights || {}).filter(([, v]) => v > 0);
    if (!entries.length) return {};
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let acc = 0;
    const scaled = {};
    entries.forEach(([k, v], i) => {
      const val = Math.round((v / total) * 100);
      scaled[k] = val;
      acc += val;
      if (i === entries.length - 1 && acc !== 100) scaled[k] += 100 - acc;
    });
    return scaled;
  }

  // ---------- HERB-SPECIFIC ----------
  function normalizeHerbTypes(types) {
    const t = (Array.isArray(types) ? types : [types])
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase());
    const uniq = Array.from(new Set(t));
    if (uniq.length === 1 && uniq[0] === "enhancer")
      return ["medicinal", "enhancer"];
    const hasMed = uniq.includes("medicinal");
    const hasTox = uniq.includes("toxin");
    const hasEnh = uniq.includes("enhancer");
    if (hasMed && hasTox) return hasEnh ? ["toxin", "enhancer"] : ["toxin"];
    const final = [];
    if (hasMed) final.push("medicinal");
    if (hasTox) final.push("toxin");
    if (hasEnh) final.push("enhancer");
    const key = final.join(",");
    return ALLOWED_TYPES.has(key) ? final : ["medicinal"];
  }

  // Applies to both herbs and foraging (simple keyword ecology)
  function sanitizeHabitatsAndEcology(item, isUnderdarkExclusive) {
    const ud = item?.habitats?.Underdark || 0;
    if (ud > 0 || isUnderdarkExclusive) {
      item.habitats = { Underdark: 100 };
      return item;
    }
    if (item.habitats && "Underdark" in item.habitats) {
      delete item.habitats.Underdark;
    }

    const blob = `${item.name ?? ""} ${item.description ?? ""}`;

    // Coast-only cues
    if (
      /kelp|wrack|eelgrass|samphire|barnacle|mussel|clam|limpet|lobster|mackerel|herring|salmon|eider|cormorant|gull/i.test(
        blob
      )
    ) {
      item.habitats = { Coast: 100 };
    }

    // Desert-only cues
    if (
      /cactus|succulent|aloe|agave|camel|oryx|addax|rattlesnake|jerboa|sandgrouse|bustard|monitor/i.test(
        blob
      )
    ) {
      item.habitats = { Desert: 100 };
    }

    // Mountain-only cues
    if (
      /lichen|alpine|ibex|tahr|bighorn|ptarmigan|marmot|snowshoe|glacier|rime/i.test(
        blob
      )
    ) {
      item.habitats = { Mountain: 100 };
    }

    // Swamp/brackish cues
    if (
      /cattail|lotus|crawfish|beaver|muskrat|nutria|heron|rail|alligator|snapping turtle|watercress/i.test(
        blob
      )
    ) {
      item.habitats = { Swamp: 100 };
    }

    item.habitats = rescaleWeights(item.habitats || {});
    return item;
  }

  function sanitizeHerbs(list) {
    for (const h of list) {
      const isUD = !!(h?.habitats?.Underdark > 0);
      sanitizeHabitatsAndEcology(h, isUD);
      h.type = normalizeHerbTypes(h.type);
    }
    return list;
  }

  function sanitizeForage(list) {
    for (const f of list) {
      const isUD = !!(f?.habitats?.Underdark > 0);
      sanitizeHabitatsAndEcology(f, isUD);
      if (!f.category) f.category = "edible";
    }
    return list;
  }

  function sanitizeHunt(list) {
    for (const a of list) {
      const isUD = !!(a?.habitats?.Underdark > 0);
      sanitizeHabitatsAndEcology(a, isUD);
      a.hideType = a.hideType || "leather";
      a.rarity = a.rarity || "Common";
    }
    return list;
  }

  function weightedPickByHabitat(entries, habitat) {
    const pool = [];
    let total = 0;
    for (const it of entries) {
      const wHab = it.habitats?.[habitat] || 0;
      if (wHab <= 0) continue;
      const wRar = RARITY_WEIGHTS[it.rarity] ?? 1;
      const weight = wHab * wRar;
      if (weight > 0) {
        total += weight;
        pool.push({ it, weight });
      }
    }
    if (!pool.length) return null;
    let roll = Math.random() * total;
    for (const e of pool) {
      roll -= e.weight;
      if (roll <= 0) return e.it;
    }
    return pool[pool.length - 1].it;
  }

  // ---------- Renderers ----------
  function renderHerb(h) {
    const pills = [];

    // rarity → reuse Shop/Treasure style
    if (h.rarity) {
      const r = String(h.rarity)
        .replace(/[_\s]+/g, " ")
        .toLowerCase();
      pills.push(badgeHtml(`rarity ${r}`, titleCase(r), { title: "Rarity" }));
    }

    // types (array or string) → use 'type' class for consistent styling
    (Array.isArray(h.type) ? h.type : [h.type]).filter(Boolean).forEach((t) => {
      const k = String(t).toLowerCase().replace(/\s+/g, "-");
      pills.push(badgeHtml(`type type-${k}`, titleCase(t)));
    });

    const badges = pills.length
      ? `<span class="tb-badges">${pills.join(" ")}</span>`
      : "";

    if (elHerbResult) {
      elHerbResult.innerHTML = `<div class="tb-detail">
      <div class="tb-detail-header">
        <div class="tb-detail-name">${h.name}</div>
        ${badges}
      </div>
      <div class="tb-detail-desc">${h.description}</div>
    </div>`;
    }
  }

  function renderForage(f) {
    const pills = [];

    // rarity
    if (f.rarity) {
      const r = String(f.rarity)
        .replace(/[_\s]+/g, " ")
        .toLowerCase();
      pills.push(badgeHtml(`rarity ${r}`, titleCase(r), { title: "Rarity" }));
    }

    // category (edible / medicinal / fruit …) → 'type' class
    if (f.category) {
      const c = String(f.category).toLowerCase().replace(/\s+/g, "-");
      pills.push(badgeHtml(`type type-${c}`, titleCase(f.category)));
    }

    const badges = pills.length
      ? `<span class="tb-badges">${pills.join(" ")}</span>`
      : "";

    if (elForResult) {
      elForResult.innerHTML = `<div class="tb-detail">
      <div class="tb-detail-header">
        <div class="tb-detail-name">${f.name}</div>
        ${badges}
      </div>
      <div class="tb-detail-desc">${f.description}</div>
    </div>`;
    }
  }

  function renderHunt(a) {
    const pills = [];

    // rarity
    if (a.rarity) {
      const r = String(a.rarity)
        .replace(/[_\s]+/g, " ")
        .toLowerCase();
      pills.push(badgeHtml(`rarity ${r}`, titleCase(r), { title: "Rarity" }));
    }

    // hide type (leather / fur / chitin …)
    if (a.hideType) {
      const k = String(a.hideType).toLowerCase().replace(/\s+/g, "-");
      pills.push(badgeHtml(`type type-${k}`, titleCase(a.hideType)));
    }

    // yield (optional)
    if (a.yield != null) {
      pills.push(badgeHtml(`yield`, `Yield ${a.yield}`));
    }

    const badges = pills.length
      ? `<span class="tb-badges">${pills.join(" ")}</span>`
      : "";

    if (elHuntResult) {
      elHuntResult.innerHTML = `<div class="tb-detail">
      <div class="tb-detail-header">
        <div class="tb-detail-name">${a.name}</div>
        ${badges}
      </div>
      <div class="tb-detail-desc">${a.description}</div>
    </div>`;
    }
  }

  const showHerbMsg = (msg) => elHerbResult && (elHerbResult.textContent = msg);
  const showForageMsg = (msg) => elForResult && (elForResult.textContent = msg);
  const showHuntMsg = (msg) => elHuntResult && (elHuntResult.textContent = msg);

  // ---------- Actions ----------
  function gatherHerb(habitat) {
    lastHerbHabitat = habitat;
    const eligible = HERBS.filter((h) => (h.habitats?.[habitat] || 0) > 0);
    if (!eligible.length)
      return showHerbMsg("No herb or fungus is known to grow here.");
    const choice = weightedPickByHabitat(eligible, habitat);
    if (!choice) return showHerbMsg("You find nothing of note.");
    renderHerb(choice);
  }

  function forageFood(habitat) {
    lastForageHabitat = habitat;
    const eligible = FORAGE.filter((f) => (f.habitats?.[habitat] || 0) > 0);
    if (!eligible.length)
      return showForageMsg("You find no edible forage here.");
    const choice = weightedPickByHabitat(eligible, habitat);
    if (!choice) return showForageMsg("You gather nothing of note.");
    renderForage(choice);
  }

  function huntAnimal(habitat) {
    lastHuntHabitat = habitat;

    const eligible = HUNT.filter((a) => (a.habitats?.[habitat] || 0) > 0);
    if (!eligible.length)
      return showHuntMsg("You find no huntable animals here.");
    const choice = weightedPickByHabitat(eligible, habitat);
    if (!choice) return showHuntMsg("You spot nothing of note.");
    renderHunt(choice);
  }

  // ---------- Load everything ----------
  Promise.allSettled([
    // Herbs
    ...HERB_FILES.map((url) =>
      fetch(url)
        .then(okJSON)
        .catch(() => null)
    ),
    // Foraging
    ...FORAGE_FILES.map((url) =>
      fetch(url)
        .then(okJSON)
        .catch(() => null)
    ),
    // Hunting
    ...HUNT_FILES.map((url) =>
      fetch(url)
        .then(okJSON)
        .catch(() => null)
    ),
  ])
    .then((results) => {
      const arrays = results
        .filter((r) => r.status === "fulfilled" && Array.isArray(r.value))
        .map((r) => r.value);

      const herbCount = HERB_FILES.length;
      const forageCount = FORAGE_FILES.length;
      const herbArrays = arrays.slice(0, herbCount);
      const forageArrays = arrays.slice(herbCount, herbCount + forageCount);
      const huntArrays = arrays.slice(herbCount + forageCount);

      HERBS = sanitizeHerbs(herbArrays.flat());
      FORAGE = sanitizeForage(forageArrays.flat());
      HUNT = sanitizeHunt(huntArrays.flat());
    })
    .catch((err) => {
      console.error(err);
      showHerbMsg("Could not load herb data.");
      showForageMsg("Could not load foraging data.");
      showHuntMsg("Could not load hunting data.");
    });

  // Wire up buttons
  elHerbGather &&
    elHerbGather.addEventListener("click", () =>
      gatherHerb(elHerbHabitat?.value || "Forest")
    );
  elHerbReroll &&
    elHerbReroll.addEventListener("click", () =>
      gatherHerb(lastHerbHabitat || elHerbHabitat?.value || "Forest")
    );

  elForGather &&
    elForGather.addEventListener("click", () =>
      forageFood(elForHabitat?.value || "Forest")
    );
  elForReroll &&
    elForReroll.addEventListener("click", () =>
      forageFood(lastForageHabitat || elForHabitat?.value || "Forest")
    );

  elHuntGather &&
    elHuntGather.addEventListener("click", () => {
      const habitat = elHuntHabitat?.value || "Forest";
      huntAnimal(habitat);
    });
  elHuntReroll &&
    elHuntReroll.addEventListener("click", () => {
      const habitat = lastHuntHabitat || elHuntHabitat?.value || "Forest";
      huntAnimal(habitat);
    });
});
