// blueprints.js — logic-only (no fallbacks). Fails loudly if /data/blueprints.json missing.
let DATA = null;
let ING_INDEX = new Map();
let LAST = { results: [], selectedId: null };

export async function ensureData() {
  if (DATA) return DATA;
  const url = "./data/blueprints.json";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  DATA = await res.json();
  ING_INDEX = new Map((DATA.ingredients_catalog || []).map((x) => [x.id, x]));
  return DATA;
}

export function filterResults({
  type = "__all__",
  rarity = "__all__",
  search = "",
} = {}) {
  const all = DATA?.blueprints || [];
  let out = all;
  if (type !== "__all__") out = out.filter((b) => (b.type || "") === type);
  if (rarity !== "__all__")
    out = out.filter((b) => (b.rarity || "") === rarity);
  if (search) {
    const s = search.trim().toLowerCase();
    out = out.filter((b) => {
      const hay = [
        b.result_name,
        b.id,
        b.rarity,
        b.type,
        ...(b.tags || []),
        ...(b.ingredients || []).flatMap((ing) => {
          const ref = ING_INDEX.get(ing.ref);
          return [
            ing.ref,
            ref?.name,
            ...(ref?.badges || []),
            ...(ing.badges || []),
          ];
        }),
      ]
        .join(" | ")
        .toLowerCase();
      return hay.includes(s);
    });
  }
  out = out
    .slice()
    .sort((a, b) =>
      (a.result_name || a.id).localeCompare(b.result_name || b.id)
    );
  LAST.results = out;
  return out;
}

function coinText(gp) {
  if (gp == null) return "";
  const n = Number(gp);
  if (isNaN(n)) return "";
  return `${Math.round(n * 10) / 10} gp`;
}
function gpToCoins(gp) {
  const n = Number(gp || 0);
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 10) / 10;
  const coins = { pp: 0, gp: whole, sp: 0, cp: 0 };
  if (frac >= 0.1) coins.sp = Math.round(frac * 10);
  return coins;
}
function renderCoins(coins, cls = "") {
  if (!coins) return "";
  const pill = (k, v) =>
    v ? `<span class="coin coin-${k}">${v}${k}</span>` : "";
  return `<span class="coins ${cls}">${["pp", "gp", "sp", "cp"]
    .map((k) => pill(k, coins[k]))
    .join(" ")}</span>`;
}

export function renderList(container, results, visibleCount = 5) {
  const root =
    typeof container === "string"
      ? document.querySelector(container)
      : container;
  if (!root) return;
  root.innerHTML = "";
  if (!results?.length) {
    root.textContent = "No blueprints match your filters.";
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "bp-scrollwrap";
  wrapper.style.overflowY = "auto";

  const table = document.createElement("table");
  table.className = "tb-table";
  table.innerHTML = `<thead><tr><th>Name</th><th>Type</th><th>Rarity</th></tr></thead>`;
  const tbody = document.createElement("tbody");

  results.forEach((bp) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><button class="tb-link" data-bp="${bp.id}">${
      bp.result_name || bp.id
    }</button></td><td>${bp.type}</td><td>${bp.rarity}</td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  root.appendChild(wrapper);

  // Cap height to exactly N rows + header, so only 5 are visible and the rest scroll
  requestAnimationFrame(() => {
    try {
      const rows = tbody.querySelectorAll("tr");
      const header = table.tHead?.rows?.[0];
      const rowH = rows[0]?.getBoundingClientRect().height || 36;
      const headH = header?.getBoundingClientRect().height || 36;
      const padding = 4;
      wrapper.style.maxHeight =
        Math.round(headH + rowH * visibleCount + padding) + "px";
    } catch {
      // fallback: approx height
      wrapper.style.maxHeight = 36 * (visibleCount + 1) + "px";
    }
  });
}

export function getById(id) {
  return (DATA?.blueprints || []).find((b) => b.id === id) || null;
}

export function renderDetail(container, bp, { coinMode = false } = {}) {
  const root =
    typeof container === "string"
      ? document.querySelector(container)
      : container;
  if (!root) return;
  root.innerHTML = "";
  if (!bp) {
    root.textContent = "Select a blueprint to view details.";
    return;
  }
  LAST.selectedId = bp.id;

  const wrap = document.createElement("div");
  wrap.className = "tb-stack";

  const h = document.createElement("h3");
  h.textContent = `${bp.result_name || bp.id} — ${bp.rarity}`;
  wrap.appendChild(h);

  const meta = document.createElement("div");
  meta.className = "tb-muted";
  meta.textContent = `${bp.type} • ${
    bp.dc != null ? "DC " + bp.dc + " • " : ""
  }${bp.time?.value ?? "?"} ${bp.time?.unit ?? ""}`;
  wrap.appendChild(meta);

  // tags (e.g., no-blueprint)
  if (bp.tags && bp.tags.length) {
    const tagbox = document.createElement("div");
    tagbox.className = "tb-badges";
    bp.tags.forEach((t) => {
      const b = document.createElement("span");
      b.className = `tb-badge ${t}`;
      b.textContent = t.replace("-", " ");
      tagbox.appendChild(b);
    });
    wrap.appendChild(tagbox);
  }

  // ingredients table
  const tbl = document.createElement("table");
  tbl.className = "tb-table";
  tbl.innerHTML = `<thead><tr><th>Ingredient</th><th>Qty</th><th>Unit</th><th>Badges</th><th>Cost</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  (bp.ingredients || []).forEach((ing) => {
    const ref = ING_INDEX.get(ing.ref);
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = ref?.name || ing.ref;
    const qty = document.createElement("td");
    qty.textContent = ing.qty ?? "";
    const unit = document.createElement("td");
    unit.textContent = ing.unit || ref?.unit || "";
    const badges = document.createElement("td");
    new Set([...(ref?.badges || []), ...(ing.badges || [])]).forEach((b) => {
      const span = document.createElement("span");
      span.className = `tb-badge ${b}`;
      span.textContent = b;
      badges.appendChild(span);
    });
    const cost = document.createElement("td");
    const c = ref?.price_gp;
    cost.innerHTML = coinMode ? renderCoins(gpToCoins(c)) : coinText(c);
    tr.append(name, qty, unit, badges, cost);
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);

  const cost = bp.cost || {};
  const totalEl = document.createElement("div");
  totalEl.className = "tb-kv";
  const totalHtml = `
    <div class="tb-kv-row"><div>Total cost</div><div><strong>${
      coinMode
        ? renderCoins(gpToCoins(cost.total_gp ?? 0), "tight")
        : coinText(cost.total_gp ?? 0)
    }</strong></div></div>
    ${
      "materials_gp" in cost
        ? `<div class="tb-kv-row"><div>Materials</div><div>${
            coinMode
              ? renderCoins(gpToCoins(cost.materials_gp), "tight")
              : coinText(cost.materials_gp)
          }</div></div>`
        : ""
    }
    ${
      "consumables_gp" in cost
        ? `<div class="tb-kv-row"><div>Consumables</div><div>${
            coinMode
              ? renderCoins(gpToCoins(cost.consumables_gp), "tight")
              : coinText(cost.consumables_gp)
          }</div></div>`
        : ""
    }
    ${
      "tool_wear_gp" in cost
        ? `<div class="tb-kv-row"><div>Tool wear</div><div>${
            coinMode
              ? renderCoins(gpToCoins(cost.tool_wear_gp), "tight")
              : coinText(cost.tool_wear_gp)
          }</div></div>`
        : ""
    }
  `;
  totalEl.innerHTML = totalHtml;
  wrap.appendChild(totalEl);

  if (bp.requirements) {
    const req = document.createElement("div");
    req.className = "tb-help";
    const feats = (bp.requirements.features || []).join(", ");
    const lvl = bp.requirements.level_min
      ? `Level ${bp.requirements.level_min}`
      : "";
    const extra = bp.requirements.notes ? ` — ${bp.requirements.notes}` : "";
    const parts = [lvl, feats].filter(Boolean).join(" • ");
    req.textContent = parts ? `Requires: ${parts}${extra}` : `Requires: —`;
    wrap.appendChild(req);
  }

  root.appendChild(wrap);
}

export function getState() {
  return { DATA, ING_INDEX, LAST };
}
