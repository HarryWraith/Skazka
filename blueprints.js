/* blueprints.js — list/detail UI for blueprints + ingredients cost lookup
   Strict version: NO FALLBACK. Requires BOTH:
     - ./data/blueprints.json
     - ./data/ingredients.json
   Exposes (for main.js):
     ensureData, getState, filterResults, renderList, getById, renderDetail
*/

const BP_PATH = "./data/blueprints.json";
const ING_PATH = "./data/ingredients.json";

let STATE = {
  DATA: null, // { schema, blueprints: [...] }
  INGREDIENTS: null, // { schema, ingredients: [...] }
  ING_INDEX: null, // Map(lowercase id/name -> ingredient)
  LAST: { selectedId: null },
};

// ─────────────────────────── Loader ───────────────────────────

export async function ensureData() {
  if (STATE.DATA && STATE.INGREDIENTS && STATE.ING_INDEX) return STATE;

  // Fetch both in parallel; no fallback.
  const [bpResp, ingResp] = await Promise.all([
    fetch(BP_PATH),
    fetch(ING_PATH, { cache: "no-cache" }),
  ]);

  if (!bpResp.ok)
    throw new Error(`Failed to load ${BP_PATH} (${bpResp.status})`);
  if (!ingResp.ok)
    throw new Error(`Failed to load ${ING_PATH} (${ingResp.status})`);

  STATE.DATA = await bpResp.json();
  STATE.INGREDIENTS = await ingResp.json();

  // Build ingredient index
  const list = Array.isArray(STATE.INGREDIENTS?.ingredients)
    ? STATE.INGREDIENTS.ingredients
    : null;
  if (!list) throw new Error("ingredients.json is missing 'ingredients' array");

  STATE.ING_INDEX = new Map();
  for (const ing of list) {
    const key = lc(ing.id || ing.name || "");
    if (key) STATE.ING_INDEX.set(key, ing);
  }

  return STATE;
}

// ─────────────────────────── Query API ───────────────────────────

export function getState() {
  return STATE;
}

export function getById(id) {
  const arr = STATE.DATA?.blueprints || [];
  return arr.find((b) => String(b.id) === String(id)) || null;
}

export function filterResults({
  type = "__all__",
  rarity = "__all__",
  search = "",
} = {}) {
  const txt = lc(search.trim());
  const tAll = lc(type) === "__all__";
  const rAll = lc(rarity) === "__all__";

  const list = (STATE.DATA?.blueprints || []).filter((b) => {
    if (!b?.id || !b?.result_name) return false;
    if (!tAll && lc(b.type) !== lc(type)) return false;
    if (!rAll && lc(b.rarity) !== lc(rarity)) return false;
    if (txt && !lc(b.result_name).includes(txt)) return false;
    return true;
  });

  // stable sort: type → rarity bucket → name
  const bucket = (r) =>
    ({
      common: 1,
      uncommon: 2,
      rare: 3,
      "very rare": 4,
      legendary: 5,
      artifact: 6,
      unique: 7,
      varies: 8,
    }[lc(r || "")] || 99);

  return list.sort((a, b) => {
    const t = lc(a.type).localeCompare(lc(b.type));
    if (t) return t;
    const rb = bucket(a.rarity) - bucket(b.rarity);
    if (rb) return rb;
    return lc(a.result_name).localeCompare(lc(b.result_name));
  });
}

// ─────────────────────────── Rendering ───────────────────────────

// Renders the left-hand list of blueprints WITHOUT any price
export function renderList(container, arr) {
  if (!container) return;
  const rows = (arr || [])
    .map((bp) => {
      const type = titleCase(bp.type || "");
      const rarity = titleCase(bp.rarity || "");
      const sub = [type, rarity].filter(Boolean).join(" • ");
      const total = getBlueprintCost(bp);
      const priceHtml =
        total != null ? `<span class="muted"> • ${gpFmt(total)}</span>` : "";
      return `
      <div class="tb-list-item tb-row tb-list-row" data-bp="${esc(bp.id)}">
        <div class="tb-detail-name">${esc(bp.result_name)}${priceHtml}</div>
        <div class="tb-sub muted">${esc(sub)}</div>
        <div class="tb-badges">${renderBadges(bp)}</div>
      </div>
    `;
    })
    .join("");

  container.innerHTML = `
    <div id="bpList" class="tb-list">
      ${rows || `<div class="muted">No results.</div>`}
    </div>
  `;
}

export function renderDetail(container, bp, opts = {}) {
  if (!container) return;
  if (!bp) {
    container.innerHTML = `<div class="muted">Select a blueprint to view details.</div>`;
    return;
  }
  STATE.LAST.selectedId = bp.id;

  const kvRows = [];
  kvRows.push(
    `<div class="tb-kv-key">Type</div><div class="tb-kv-val">${esc(
      titleCase(bp.type)
    )}</div>`
  );
  if (bp.rarity) {
    kvRows.push(
      `<div class="tb-kv-key">Rarity</div><div class="tb-kv-val">${esc(
        titleCase(bp.rarity)
      )}</div>`
    );
  }
  if (bp?.time?.value != null && bp?.time?.unit) {
    kvRows.push(
      `<div class="tb-kv-key">Time</div><div class="tb-kv-val">${esc(
        String(bp.time.value)
      )} ${esc(String(bp.time.unit))}</div>`
    );
  }

  const totalCost = getBlueprintCost(bp);
  if (totalCost != null) {
    const coinMode = !!opts.coinMode;
    kvRows.push(
      `<div class="tb-kv-key">Cost</div><div class="tb-kv-val">${
        coinMode ? coinsInline(totalCost) : esc(gpFmt(totalCost))
      }</div>`
    );
  }

  const ingTable = renderIngredientsTable(bp); // (new version below — no price column)

  container.innerHTML = `
    <div class="tb-detail">
      <div class="tb-detail-header">
        <h3 class="tb-detail-name">${esc(bp.result_name)}</h3>
        <span class="tb-badges">${renderBadges(bp)}</span>
      </div>

      <div class="tb-kv">
        ${kvRows.join("")}
      </div>

      <div class="hr"></div>
      <div class="section-head">Ingredients</div>
      ${ingTable}
    </div>
  `;
}

// ─────────────────────────── Helpers ───────────────────────────

function gpFmt(n) {
  return `${Number(n).toFixed(2).replace(/\.00$/, "")} gp`;
}

function coinsHtml(gp) {
  const c = coinsFromGp(gp);
  const pill = (k, v) =>
    v ? `<span class="coin coin-${k}">${v}${k}</span>` : "";
  return `
    <div class="row"><span class="label">Cost</span>
      <span class="value coins">
        ${pill("pp", c.pp)}${pill("gp", c.gp)}${pill("sp", c.sp)}${pill(
    "cp",
    c.cp
  )}
      </span>
    </div>`;
}

function coinsFromGp(gp) {
  if (gp == null) return { pp: 0, gp: 0, sp: 0, cp: 0 };
  let cp = Math.round(Number(gp) * 100);
  const pp = Math.floor(cp / 1000);
  cp -= pp * 1000;
  const gpi = Math.floor(cp / 100);
  cp -= gpi * 100;
  const sp = Math.floor(cp / 10);
  cp -= sp * 10;
  return { pp, gp: gpi, sp, cp };
}

function coinsInline(gp) {
  const c = coinsFromGp(gp);
  const pill = (k, v) =>
    v ? `<span class="coin coin-${k}">${v}${k}</span>` : "";
  return `<span class="coins">${pill("pp", c.pp)}${pill("gp", c.gp)}${pill(
    "sp",
    c.sp
  )}${pill("cp", c.cp)}</span>`;
}

function renderTime(time) {
  if (!time || time.value == null || !time.unit) return "";
  return `<div class="row"><span class="label">Time</span><span class="value">${esc(
    String(time.value)
  )} ${esc(String(time.unit))}</span></div>`;
}

function renderIngredientsTable(bp) {
  const ings = Array.isArray(bp.ingredients) ? bp.ingredients : [];
  if (ings.length === 0) return `<div class="muted">—</div>`;

  const rows = ings
    .map((it) => {
      const refKey = lc(it.ref || "");
      const meta = STATE.ING_INDEX?.get(refKey) || null;

      const name = meta?.name || it.ref || "Unknown";
      const unit = it.unit || meta?.unit || "";
      const qty = (typeof it.qty === "number" ? it.qty : Number(it.qty)) || 1;

      // Row badges declared in the blueprint
      const rawBadges = Array.isArray(it.badges)
        ? it.badges.map((b) => lc(String(b)))
        : [];

      // Base rows: only base + item family
      const isBase = rawBadges.includes("base");
      const BASE_ALLOWED = new Set([
        "base",
        "ammo",
        "weapon",
        "armor",
        "shield",
        "wondrous",
        "wand",
        "staff",
        "rod",
        "ring",
      ]);
      const showBadges = isBase
        ? rawBadges.filter((t) => BASE_ALLOWED.has(t))
        : rawBadges;

      const tagPills = showBadges.map((t) => {
        const cls = t.replace(/\s+/g, "_");
        return `<span class="tb-badge ${cls}">${esc(t)}</span>`;
      });

      // Ingredient type pill (consistent with badges.js look)
      const ingType = lc(meta?.type || ""); // e.g. metal, gem, herb, mineral, etc.
      const typePill = ingType
        ? `<span class="tb-badge ${esc(
            ingType
          )}" style="margin-left:.5rem;">${titleCase(ingType)}</span>`
        : "";

      // Cost for this row (price_gp × qty)
      const price =
        meta && meta.price_gp != null ? Number(meta.price_gp) : null;
      const rowCost =
        price != null && !Number.isNaN(price) ? price * Number(qty) : null;

      return `
      <tr>
        <td class="col-ing">
          <div class="name-line">
            <span class="tb-detail-name">${esc(name)}</span>${typePill}
          </div>
        </td>
        <td class="col-qty">${esc(String(qty))}</td>
        <td class="col-unit">${esc(unit)}</td>
        <td class="col-badges">
          ${
            tagPills.length
              ? `<div class="tb-badges">${tagPills.join(" ")}</div>`
              : ""
          }
        </td>
        <td class="col-cost" title="${
          price != null && rowCost != null
            ? `${gpFmt(price)} × ${qty} = ${gpFmt(rowCost)}`
            : ""
        }">
          ${
            rowCost != null
              ? `<span class="muted">${gpFmt(
                  price
                )} ea</span> &times; ${qty} = <strong>${gpFmt(
                  rowCost
                )}</strong>`
              : "—"
          }
        </td>
      </tr>
    `;
    })
    .join("");

  const total = getBlueprintCost(bp);

  return `
    <table class="tb-table">
      <colgroup>
        <col class="col-ing" />
        <col class="col-qty" />
        <col class="col-unit" />
        <col class="col-badges" />
        <col class="col-cost" />
      </colgroup>
      <thead>
        <tr>
          <th class="col-ing">Ingredient</th>
          <th class="col-qty">Qty</th>
          <th class="col-unit">Unit</th>
          <th class="col-badges">Tags</th>
          <th class="col-cost">Cost</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align:right;"><strong>Total</strong></td>
          <td class="col-cost"><strong>${(function () {
            const total = getBlueprintCost(bp);
            return total != null ? gpFmt(total) : "—";
          })()}</strong></td>
        </tr>
      </tfoot>
    </table>
  `;
}

// Total cost: explicit total if present; else sum ingredients (price_gp × qty)
function getBlueprintCost(bp) {
  const explicit = Number(bp?.cost?.total_gp);
  if (!Number.isNaN(explicit) && explicit > 0) return round2(explicit);

  let total = 0,
    seenAny = false;
  for (const it of bp.ingredients || []) {
    const meta = STATE.ING_INDEX?.get(lc(it.ref || "")) || null;
    const price = meta && meta.price_gp != null ? Number(meta.price_gp) : null;
    const qty = (typeof it.qty === "number" ? it.qty : Number(it.qty)) || 1;
    if (
      price != null &&
      !Number.isNaN(price) &&
      qty != null &&
      !Number.isNaN(qty)
    ) {
      total += price * qty;
      seenAny = true;
    }
  }
  return seenAny ? round2(total) : null;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

// ─────────────────────────── Badges (minimal, n/a suppressed) ───────────────────────────

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
    scroll: "scroll",
    potion: "potion",
    poison: "poison",
  };

  const badges = [];
  const add = (cls, label, title = label) => {
    if (!isNA(label))
      badges.push(
        `<span class="tb-badge ${cls}" title="${title}">${label}</span>`
      );
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
  else if (entity.attunement === false)
    add("attune attune-false", "no attune", "No attunement required");

  // consumable
  if (entity.is_consumable) add("consumable", "consumable");

  // type → use your CSS classes (no "type-" prefix)
  const tBadge = TYPE_BADGE[lc(entity.type)];
  if (tBadge) add(tBadge, titleCase(entity.type), "Type");

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

function norm(s) {
  const v = lc(s);
  if (!v || v === "n/a" || v === "na" || v === "-" || v === "—") return "";
  return v;
}

// ─────────────────────────── utils ───────────────────────────

function lc(s) {
  return String(s || "").toLowerCase();
}
function esc(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}
function titleCase(s) {
  return String(s || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
