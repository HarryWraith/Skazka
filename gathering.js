/* gathering.js — Herb/Fungi Generator (DnD 5e)
   - Loads data from one or more JSON files
   - Enforces ecology sanity (e.g., kelp = Coast-only, cactus = Desert-only, lichens/frost/glacier = Mountain-only)
   - Preserves Underdark exclusivity
   - Enforces valid type combos (never just "enhancer")
   - Picks results by habitat-weight × rarity-weight
   - Renders a compact card using your Skazka table styles
*/

document.addEventListener("DOMContentLoaded", () => {
  // -------------------------
  // Config
  // -------------------------
  const DATA_FILES = [
    "data/herbs.json",
    // Add more packs here if you use them (optional):
    // "data/herbs_expansion_pack_A.json",
  ];

  // Rarity weights (higher = more common)
  const RARITY_WEIGHTS = {
    Common: 12,
    Uncommon: 7,
    Rare: 4,
    "Very Rare": 2,
    Legendary: 1,
  };

  // Allowed type sets (order-agnostic)
  const ALLOWED_TYPES = new Set([
    "medicinal",
    "toxin",
    "medicinal,enhancer",
    "toxin,enhancer",
  ]);

  // -------------------------
  // DOM refs
  // -------------------------
  const elResult = document.getElementById("gatherResult");
  const elGather = document.getElementById("gatherBtn");
  const elReroll = document.getElementById("rerollBtn");
  const elHabitat = document.getElementById("habitatSelect");

  let HERBS = [];
  let lastHabitat = null;

  // -------------------------
  // Utilities
  // -------------------------
  function safeJoin(arr, sep = ", ") {
    return (Array.isArray(arr) ? arr : [arr]).filter(Boolean).join(sep);
  }

  function okJSON(resp) {
    // Returns null on 404-like errors so we can ignore optional packs gracefully.
    if (!resp.ok) return null;
    return resp.json();
  }

  function normalizeTypes(types) {
    // Ensure array, lowercased unique
    const t = (Array.isArray(types) ? types : [types])
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase());
    const uniq = Array.from(new Set(t));

    // Never allow just "enhancer"
    if (uniq.length === 1 && uniq[0] === "enhancer") {
      return ["medicinal", "enhancer"];
    }

    // If both medicinal and toxin present, coerce to valid set
    const hasMed = uniq.includes("medicinal");
    const hasTox = uniq.includes("toxin");
    const hasEnh = uniq.includes("enhancer");

    if (hasMed && hasTox) {
      // Prefer toxin-only or toxin+enhancer to keep schema valid
      return hasEnh ? ["toxin", "enhancer"] : ["toxin"];
    }

    // Build final and validate against allowed combos
    const final = [];
    if (hasMed) final.push("medicinal");
    if (hasTox) final.push("toxin");
    if (hasEnh) final.push("enhancer");

    const key = final.join(",");
    if (!ALLOWED_TYPES.has(key)) {
      // Fallback to medicinal if empty/invalid
      return ["medicinal"];
    }
    return final;
  }

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
      if (i === entries.length - 1 && acc !== 100) {
        // fix rounding drift on last key
        scaled[k] += 100 - acc;
      }
    });
    return scaled;
  }

  function sanitizeHerbHabitats(list) {
    for (const h of list) {
      // Always keep Underdark exclusivity strict
      const ud = h?.habitats?.Underdark || 0;
      if (ud > 0) {
        h.habitats = { Underdark: 100 };
      } else if (h.habitats && "Underdark" in h.habitats) {
        delete h.habitats.Underdark;
      }

      // Ecology sanity locks (name/description search)
      const blob = `${h.name ?? ""} ${h.description ?? ""}`;

      // Coast-only: kelp, wrack, eelgrass, seaweed, algae, seafern, barnacle
      if (
        /kelp|wrack|eelgrass|seafern|barnacle|sea[-\s]?weed|algae/i.test(blob)
      ) {
        h.habitats = { Coast: 100 };
      }

      // Desert-only: cactus, succulent, aloe
      if (/cactus|succulent|aloe/i.test(blob)) {
        h.habitats = { Desert: 100 };
      }

      // Mountain-only: lichen, alpine, frost, glacier, rime
      if (/lichen|alpine|frost|glacier|rime/i.test(blob)) {
        h.habitats = { Mountain: 100 };
      }

      // Brackish split: mangrove / salt-marsh
      if (/mangrove|salt[-\s]?marsh|brackish/i.test(blob)) {
        h.habitats = { Coast: 60, Swamp: 40 };
      }

      // Normalize weights back to 100
      if (h.habitats) {
        h.habitats = rescaleWeights(h.habitats);
      }

      // Enforce valid type sets
      h.type = normalizeTypes(h.type);
    }
    return list;
  }

  function weightedPickByHabitat(entries, habitat) {
    const pool = [];
    let total = 0;

    for (const h of entries) {
      const wHab = h.habitats?.[habitat] || 0;
      if (wHab <= 0) continue;
      const wRar = RARITY_WEIGHTS[h.rarity] ?? 1;
      const weight = wHab * wRar;
      if (weight > 0) {
        pool.push({ h, weight });
        total += weight;
      }
    }
    if (!pool.length) return null;

    let roll = Math.random() * total;
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) return entry.h;
    }
    return pool[pool.length - 1].h; // fallback
  }

  function renderHerb(h) {
    const tags = `${h.rarity}${h.type?.length ? " • " + safeJoin(h.type) : ""}`;
    elResult.innerHTML = `<div class="tb-detail">
        <div class="tb-detail-header">
          <div class="tb-detail-name">${h.name}</div>
          <div class="tb-badges">
            <span class="tb-badge">${tags}</span>
          </div>
        </div>
        <div class="tb-detail-desc">${h.description}</div>
      </div>`;
  }

  function showMessage(msg) {
    elResult.textContent = msg;
  }

  function gather(habitat) {
    lastHabitat = habitat;
    const eligible = HERBS.filter((h) => (h.habitats?.[habitat] || 0) > 0);
    if (!eligible.length) {
      showMessage("No herb or fungus is known to grow here.");
      return;
    }
    const choice = weightedPickByHabitat(eligible, habitat);
    if (!choice) {
      showMessage("You find nothing of note.");
      return;
    }
    renderHerb(choice);
  }

  // -------------------------
  // Load + wire up
  // -------------------------
  Promise.allSettled(
    DATA_FILES.map((url) =>
      fetch(url)
        .then(okJSON)
        .catch(() => null)
    )
  )
    .then((results) => {
      const all = [];
      for (const r of results) {
        if (r.status === "fulfilled" && Array.isArray(r.value)) {
          all.push(...r.value);
        }
      }
      if (!all.length) throw new Error("No data loaded");

      HERBS = sanitizeHerbHabitats(all);

      // If you want to pre-roll once on load, uncomment:
      // gather(elHabitat?.value || "Forest");
    })
    .catch((err) => {
      console.error(err);
      showMessage("Could not load herb data.");
    });

  if (elGather) {
    elGather.addEventListener("click", () => {
      const habitat = elHabitat?.value || "Forest";
      gather(habitat);
    });
  }

  if (elReroll) {
    elReroll.addEventListener("click", () => {
      const habitat = lastHabitat || elHabitat?.value || "Forest";
      gather(habitat);
    });
  }
});
