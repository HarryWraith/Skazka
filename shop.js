import { badgeHtml, coinRowHtml } from "./badges.js";
const CATALOG_PATH = "./data/catalog.json";
let CATALOG_DATA = null;

const SHOP_READY = (async () => {
  try {
    const res = await fetch(CATALOG_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch ${CATALOG_PATH} → ${res.status}`);
    CATALOG_DATA = await res.json();
  } catch (err) {
    console.error("Failed to load catalog.json:", err);
    CATALOG_DATA = { items: [] };
  }
})();

// optional prefetch
export function loadShopData() {
  return SHOP_READY;
}

/* =========================
   DOM helpers
   ========================= */
const el = (id) => document.getElementById(id);
const q = (sel, root = document) => root.querySelector(sel);

/* =========================
   Utils
   ========================= */
const lc = (s) => String(s || "").toLowerCase();
const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const titleCase = (s) =>
  String(s)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

function coinsFromGp(gp) {
  let cp = Math.round((Number(gp) || 0) * 100);
  if (!Number.isFinite(cp)) cp = 0;
  const pp = Math.floor(cp / 1000);
  cp -= pp * 1000;
  const gpInt = Math.floor(cp / 100);
  cp -= gpInt * 100;
  const sp = Math.floor(cp / 10);
  cp -= sp * 10;
  return { pp, gp: gpInt, sp, cp };
}

function coinRow(coins, cls = "") {
  return coinRowHtml(coins, cls);
}

/* =========================
   Badges
   ========================= */
function renderBadges(entity) {
  const lc = (s) =>
    String(s || "")
      .toLowerCase()
      .trim();
  const titleCase = (s) =>
    String(s || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const isNA = (s) => {
    const v = lc(s);
    return !v || v === "n/a" || v === "na" || v === "-" || v === "—";
  };

  // Map normalized item "type" → badge class your CSS already styles
  const TYPE_BADGE = {
    weapon: "weapon",
    armor: "armor",
    shield: "shield",
    ring: "ring",
    wand: "wand",
    staff: "staff",
    rod: "rod",
    ammunition: "ammo",
    ammo: "ammo",
    "wondrous item": "wondrous",
    wondrous: "wondrous",
    weapons: "weapon",
    rings: "ring",
    staves: "staff",
    potions: "potion",
    goods: "goods",
    gear: "gear",
    art: "art",
    gems: "gems",
  };

  const badges = [];
  const add = (cls, label, title = label) => {
    if (!isNA(label)) badges.push(badgeHtml(cls, label, { title }));
  };

  // rarity
  const rRaw = String(entity?.rarity || "");
  if (!isNA(rRaw)) {
    const r = lc(rRaw.replace(/[_-]+/g, " "));
    add(
      `rarity ${r}`,
      r.replace(/\b\w/g, (c) => c.toUpperCase()),
      "Rarity"
    );
  }

  // attunement
  if (entity.attunement === true)
    add("attune attune-true", "attune", "Requires attunement");

  // consumable
  if (entity.is_consumable) add("consumable", "consumable");

  // type → use your CSS classes (no "type-" prefix)
  const t = lc(entity.type);
  if (!isNA(t)) {
    // Special aliases that your CSS already colors
    const TYPE_BADGE = {
      weapon: "weapon",
      armor: "armor",
      shield: "shield",
      ring: "ring",
      wand: "wand",
      staff: "staff",
      rod: "rod",
      ammunition: "ammo",
      ammo: "ammo",
      "wondrous item": "wondrous",
      wondrous: "wondrous",
    };

    const styled = TYPE_BADGE[t] || TYPE_BADGE[titleCase(t).toLowerCase()];
    // 1) Always add the generic type class so everything has a pill
    add(t, titleCase(entity.type), "Type");
    // 2) If a styled alias exists, add that too (duplicates are harmless visually)
    if (styled && styled !== t) add(styled, titleCase(entity.type), "Type");
  }

  // illicit
  const tags = Array.isArray(entity.tags) ? entity.tags.map(lc) : [];
  if (tags.includes("illicit"))
    add("illicit", "illicit", "Restricted / illicit goods");

  // publication → SRD only
  if (lc(entity.publication) === "srd")
    add("pub pub-srd", "srd", "Open content");

  return badges.length
    ? `<span class="tb-badges">${badges.join(" ")}</span>`
    : "";
}

/* =========================
   Pricing factors
   ========================= */
const DEMAND_FACTOR = {
  normal: 1.0,
  low_stock_high_demand: 1.15,
  overstock_low_demand: 0.85,
};
const REP_FACTOR = { disfavoured: 1.25, neutral: 1.0, favoured: 0.9 };

function currentDiscountPct() {
  const pressed = q('#haggleControls .tb-segbtn[aria-pressed="true"]');
  return pressed ? Number(pressed.getAttribute("data-disc")) || 0 : 0;
}

function computeAdjustedPrice(baseGp, demandKey, repKey, discPct) {
  const base = Number(baseGp);
  if (!Number.isFinite(base)) return null;
  const pre =
    base * (DEMAND_FACTOR[demandKey] ?? 1) * (REP_FACTOR[repKey] ?? 1);
  return Math.max(0, round2(pre * (1 - (Number(discPct) || 0) / 100)));
}

/* =========================
   Public / Private gating
   ========================= */
function isPrivateMode() {
  return el("privacySlider")?.value === "1";
}
function requirePrivatePassword() {
  const pw = prompt("Enter password for Private mode:");
  return pw === "harrywraith";
}
function clearShopDetail() {
  const panel = el("shopDetail");
  if (panel) panel.innerHTML = "";
}

/* =========================
   Data prep
   ========================= */
const INCLUDE_UNPRICED = true;

function allowedInPublic(pub) {
  return String(pub || "").toLowerCase() === "srd";
}

function shopItems() {
  const items = Array.isArray(CATALOG_DATA?.items) ? CATALOG_DATA.items : [];
  const priv = isPrivateMode();
  return items.filter((it) => {
    if (!it || !it.name) return false;
    if (!priv && !allowedInPublic(it.publication)) return false;
    return INCLUDE_UNPRICED || Number.isFinite(Number(it.price));
  });
}

function categoriesFrom(items) {
  const set = new Set();
  for (const it of items) {
    const t = String(it?.type || "misc").toLowerCase();
    set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function populateCategoryOptions() {
  const sel = el("shopCategory");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "__all__";
  all.textContent = "All categories";
  sel.appendChild(all);

  const cats = categoriesFrom(shopItems());
  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c.replaceAll("_", " ");
    sel.appendChild(opt);
  }
  if (Array.from(sel.options).some((o) => o.value === prev)) sel.value = prev;
}

/* =========================
   Dedupe by name (UI-only)
   ========================= */
const RARITY_RANK = {
  artifact: 6,
  legendary: 5,
  "very rare": 4,
  rare: 3,
  uncommon: 2,
  common: 1,
};

function _scoreItem(it) {
  let s = 0;
  if (Number.isFinite(Number(it.price_gp))) s += 1000;
  s += (RARITY_RANK[lc(String(it.rarity).replace(/[_-]+/g, " "))] || 0) * 10;
  if (it._from_magic) s += 5;
  if (it.description) s += 2;
  if (it.attunement === true) s += 1;
  return s;
}

function dedupeRows(rows) {
  const byId = new Map();
  for (const r of rows) {
    const key = String(r?.item?.id ?? "").trim();
    if (!key) continue; // if an item somehow lacks an id, skip it
    const prev = byId.get(key);
    if (!prev || _scoreItem(r.item) > _scoreItem(prev.item)) byId.set(key, r);
  }
  return Array.from(byId.values());
}

/* =========================
   Filtering + sort
   ========================= */
function currentFilters() {
  const demand = el("shopDemand")?.value || "normal";
  const rep = el("shopRep")?.value || "neutral";
  const disc = currentDiscountPct();
  const showCoins = !!el("shopCoins")?.checked;

  const cat = el("shopCategory")?.value || "__all__";
  const qStr = (el("shopSearch")?.value || "").trim().toLowerCase();
  const sort = el("shopSort")?.value || "name";

  return { demand, rep, disc, showCoins, cat, qStr, sort };
}

function filterSortRows(items, filters) {
  const out = [];
  for (const it of items) {
    if (!it || !it.name) continue;

    if (filters.cat && filters.cat !== "__all__") {
      const cat = String(it.type || "misc").toLowerCase();
      if (cat !== filters.cat) continue;
    }
    if (filters.qStr) {
      const hay = `${lc(it.name)} ${lc(it.type)} ${lc(
        Array.isArray(it.tags) ? it.tags.join(" ") : ""
      )}`;
      if (!hay.includes(filters.qStr)) continue;
    }

    const base = Number.isFinite(Number(it.price)) ? round2(it.price) : null;
    const adj = computeAdjustedPrice(
      base,
      filters.demand,
      filters.rep,
      filters.disc
    );

    out.push({
      item: it,
      base_gp: base,
      adj_gp: adj,
      adj_coins: Number.isFinite(adj) ? coinsFromGp(adj) : null,
    });
  }

  switch (filters.sort) {
    case "price_asc":
      out.sort((a, b) => (a.adj_gp ?? Infinity) - (b.adj_gp ?? Infinity));
      break;
    case "price_desc":
      out.sort((a, b) => (b.adj_gp ?? -Infinity) - (a.adj_gp ?? -Infinity));
      break;
    default:
      out.sort((a, b) => a.item.name.localeCompare(b.item.name));
      break;
  }
  return out;
}

/* =========================
   Rendering
   ========================= */
let LAST_VIEW = [];

function renderShopTable(rows, showCoins) {
  LAST_VIEW = rows;
  if (!rows.length) {
    return `<div class="tb-help" style="padding:8px;">No items match your filters.</div>`;
  }

  const thead = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Base price</th>
        <th>Adjusted</th>
      </tr>
    </thead>`;

  const tbody = rows
    .map((r) => {
      const name = r.item.name;
      const badges = renderBadges(r.item);

      const baseGp =
        r.base_gp != null ? `<span class="nowrap">${r.base_gp} gp</span>` : "—";
      const adjGp =
        r.adj_gp != null ? `<span class="nowrap">${r.adj_gp} gp</span>` : "—";

      const priceCoins =
        r.item.price_coins ??
        (r.base_gp != null ? coinsFromGp(r.base_gp) : null);
      const baseCoins = showCoins ? coinRow(priceCoins, "coins-price") : "";
      const adjCoins =
        showCoins && r.adj_coins ? coinRow(r.adj_coins, "coins-price") : "";

      const nameCell = `<div class="name-line"><span class="tb-detail-name">${name}</span>${badges}</div>`;
      const baseCell = baseCoins
        ? `${baseGp}<div class="tb-coins">${baseCoins}</div>`
        : `${baseGp}`;
      const adjCell = adjCoins
        ? `${adjGp}<div class="tb-coins">${adjCoins}</div>`
        : `${adjGp}`;

      return `<tr class="shop-row" data-id="${r.item.id ?? ""}">
        <td class="col-name">${nameCell}</td>
        <td class="col-base">${baseCell}</td>
        <td class="col-adjusted">${adjCell}</td>
      </tr>`;
    })
    .join("");

  return `<table class="tb-table">
    <colgroup><col style="width:60%"><col style="width:20%"><col style="width:20%"></colgroup>
    ${thead}
    <tbody>${tbody}</tbody>
  </table>`;
}

function renderDetail(item) {
  if (!item) return "";
  const badges = renderBadges(item); // returns a single <span class="tb-badges">…</span>

  const hasBase = Number.isFinite(Number(item.price));
  const baseVal = hasBase ? round2(item.price) : null;
  const baseStr = baseVal != null ? `${baseVal} gp` : "—";
  const baseCoins = item.price_coins ?? (hasBase ? coinsFromGp(baseVal) : null);

  const sellVal = Number.isFinite(Number(item.sell_price))
    ? round2(item.sell_price)
    : hasBase
    ? round2(item.price * 0.5)
    : null;
  const sellStr = sellVal != null ? `${sellVal} gp` : "—";
  const sellCoins =
    item.sell_coins ?? (sellVal != null ? coinsFromGp(sellVal) : null);

  // Nicely formatted weight; respect negligible small-item rule
  const weightStr = (() => {
    const w = Number(item.weight);
    if (item.weight_status === "inherits_base") return "— (as base armor)";
    if (!Number.isFinite(w)) return "—";
    if (w === 0 && item.weight_status === "unspecified_zero") return "—"; // negligible trinkets, etc.
    return `${Math.round(w * 100) / 100} lb`;
  })();

  const lines = [
    ["Type", titleCase(item.type || "—")],
    ["Rarity", titleCase(item.rarity || "—")],
    [
      "Attunement",
      item.attunement === true ? "Yes" : item.attunement === false ? "No" : "—",
    ],

    ["Consumable", item.is_consumable ? "Yes" : "No"],

    ["Publication", item.publication || "—"],

    // NEW
  ]
    .map(
      ([k, v]) =>
        `<div class="tb-kv-row"><div class="tb-kv-key">${k}</div><div class="tb-kv-val">${v}</div></div>`
    )
    .join("");

  return `
    <div class="tb-detail">
      <div class="tb-detail-header">
        <div class="tb-detail-name">${item.name}</div>
        ${badges} <!-- badges already wrapped in <span class="tb-badges">…</span>; single line via CSS -->
      </div>
      <div class="tb-kv">
        ${lines}
        <div class="tb-kv-row">
          <div class="tb-kv-key">Base price</div>
          <div class="tb-kv-val">${baseStr} ${coinRow(
    baseCoins,
    "coins-price"
  )}</div>
        </div>
        <div class="tb-kv-row">
          <div class="tb-kv-key">Sell price</div>
          <div class="tb-kv-val">${sellStr} ${coinRow(
    sellCoins,
    "coins-sell"
  )}</div>
        </div>
      </div>
      ${
        item.description
          ? `<div class="hr"></div><div class="tb-detail-desc">${item.description}</div>`
          : ""
      }
    </div>
  `;
}

/* =========================
   Export CSV
   ========================= */
function exportCSV(rows) {
  if (!rows?.length) return;
  const headers = [
    "id",
    "name",
    "rarity",
    "attunement",
    "consumable",
    "base_gp",
    "adjusted_gp",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((r) => {
      const it = r.item;
      const vals = [
        it.id ?? "",
        it.name ?? "",
        it.rarity ?? "",
        it.attunement === true
          ? "true"
          : it.attunement === false
          ? "false"
          : "",
        it.is_consumable ? "true" : "",
        r.base_gp ?? "",
        r.adj_gp ?? "",
      ].map((v) => `"${String(v).replaceAll('"', '""')}"`);
      return vals.join(",");
    }),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "shop_export.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================
   Haggle buttons
   ========================= */
function setHaggleButton(btn) {
  const pressed = btn.getAttribute("aria-pressed") === "true";
  const peers = btn.parentElement?.querySelectorAll(".tb-segbtn") || [];
  peers.forEach((b) => b.setAttribute("aria-pressed", "false"));
  btn.setAttribute("aria-pressed", pressed ? "false" : "true");

  const disc = currentDiscountPct();
  const out = el("persuasionOutcome");
  if (out)
    out.textContent = disc ? `Persuasion discount: ${disc}%` : "No discount.";

  runShop();
}

/* =========================
   Main: render + wire
   ========================= */
async function runShop() {
  await SHOP_READY;

  const items = shopItems();
  const filters = currentFilters();
  const rows = filterSortRows(items, filters);
  const view = dedupeRows(rows);

  const out = el("shopResult");
  if (out) out.innerHTML = renderShopTable(view, filters.showCoins);

  // Limit visible rows to ~5 (dynamic max-height for #shopResult)
  (() => {
    const thead = out?.querySelector("thead");
    const row = out?.querySelector("tbody tr");
    if (!out || !row) {
      out?.style.setProperty("--shop-max", "360px");
      return;
    }
    const headH = thead?.getBoundingClientRect().height || 42;
    const rowH = row.getBoundingClientRect().height || 56;
    const maxPx = Math.round(headH + rowH * 5 + 8);
    out.style.setProperty("--shop-max", `${maxPx}px`);
  })();

  // row click → detail
  const tbody = out?.querySelector("tbody");
  if (tbody) {
    tbody.addEventListener("click", (ev) => {
      const tr = ev.target.closest("tr.shop-row");
      if (!tr) return;

      const id = tr.getAttribute("data-id");
      const item =
        view.find((r) => String(r.item.id ?? "") === id)?.item ||
        items.find((it) => String(it.id ?? "") === id);

      const panel = el("shopDetail");
      if (panel) panel.innerHTML = renderDetail(item);

      tbody
        .querySelectorAll("tr")
        .forEach((r) => r.classList.remove("is-selected"));
      tr.classList.add("is-selected");
    });
  }

  LAST_VIEW = view;
}

/* =========================
   Wire events
   ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  await SHOP_READY;

  // Force Public on load
  const slider = el("privacySlider");
  if (slider) slider.value = "0";

  populateCategoryOptions();

  // Slider: always prompt on public→private; clear detail; refresh
  if (slider && slider.dataset.bound !== "1") {
    slider.dataset.bound = "1";
    slider.addEventListener("change", () => {
      if (slider.value === "1") {
        if (!requirePrivatePassword()) {
          slider.value = "0";
        }
      }
      clearShopDetail();
      populateCategoryOptions();
      runShop();
    }); // ← no { once: true }
  } // ← closes the if

  // Haggle buttons
  ["haggle5", "haggle10", "haggle15"].forEach((id) => {
    const b = el(id);
    if (b) b.addEventListener("click", () => setHaggleButton(b));
  });
  const out = el("persuasionOutcome");
  if (out) out.textContent = "No discount.";

  // Filters
  ["shopDemand", "shopRep", "shopCategory", "shopSort", "shopCoins"].forEach(
    (id) => {
      const c = el(id);
      if (c) c.addEventListener("change", runShop);
    }
  );

  // Live search (debounced)
  let _t;
  el("shopSearch")?.addEventListener("input", () => {
    clearTimeout(_t);
    _t = setTimeout(runShop, 200);
  });

  // Buttons
  el("rollShop")?.addEventListener("click", runShop);
  el("exportShop")?.addEventListener("click", () => exportCSV(LAST_VIEW));

  // initial render (optional)
  // runShop();
});
