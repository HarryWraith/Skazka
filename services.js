/* services.js — robust renderer + typed badges + coin chips (pp/gp/sp/cp) */

let DATA_URL = "./data/services.json"; // single source of truth
let servicesCache = null;
let servicesCacheUrl = null;

/* ---------- config (optional) ---------- */
export function configureServices({ dataUrl } = {}) {
  if (dataUrl && dataUrl !== DATA_URL) {
    DATA_URL = dataUrl;
    servicesCache = null;
    servicesCacheUrl = null;
    console.debug("[services] DATA_URL set to", DATA_URL);
  }
}

/* ---------- data loading ---------- */
async function fetchServices(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const j = await r.json();
  if (!Array.isArray(j?.services))
    throw new Error(`Invalid JSON shape at ${url}`);
  return j.services;
}

export async function loadServicesData(url = DATA_URL) {
  if (!servicesCache || servicesCacheUrl !== url) {
    servicesCacheUrl = url;
    servicesCache = fetchServices(url);
  }
  return servicesCache;
}

/* ---------- render ---------- */
export async function renderServicesList({
  mount = document.querySelector("#services"),
  url = DATA_URL,
  serviceType = "",
  query = "",
} = {}) {
  if (!mount) return;

  mount.innerHTML = `<div class="tb-result">Loading services…</div>`;

  let data = [];
  try {
    data = await loadServicesData(url);
  } catch (err) {
    console.error("[services] load error:", err);
    mount.innerHTML = `
      <div class="tb-result">
        Couldn't load services from <code>${url}</code>.<br>
        Ensure the file exists and is reachable. (See console for details.)
      </div>`;
    const info = document.querySelector("#servicesResultInfo");
    if (info) info.textContent = "0 results";
    return;
  }

  const q = (query || "").toLowerCase().trim();
  const type = (serviceType || "").trim();

  // Filter
  let list = data;
  if (type) list = list.filter((s) => s.service_type === type);
  if (q) {
    list = list.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.notes && s.notes.toLowerCase().includes(q))
    );
  }

  // Group only when showing all types
  const groupByType = !type;
  const groups = groupByType
    ? list.reduce((a, s) => ((a[s.service_type] ||= []).push(s), a), {})
    : { [type || "all"]: list };

  // Render
  const frag = document.createDocumentFragment();
  let total = 0;

  for (const [k, g] of Object.entries(groups)) {
    if (!g.length) continue;
    total += g.length;

    const section = document.createElement(groupByType ? "details" : "div");
    section.open = !!(q || type); // auto-open when filtered
    section.className = "tb-section";

    if (groupByType) {
      const summary = document.createElement("summary");
      summary.className = "tb-row tb-row-head";
      summary.append(typePill(k), countBadge(g.length));
      section.append(summary);
    }

    const ul = document.createElement("ul");
    ul.className = "tb-list tb-compact";
    for (const s of g) ul.append(renderServiceRow(s));
    section.append(ul);
    frag.append(section);
  }

  mount.innerHTML = "";
  if (total === 0) {
    const empty = document.createElement("div");
    empty.className = "tb-result";
    empty.textContent =
      q || type ? "No services match your filters." : "No services available.";
    mount.append(empty);
  } else {
    mount.append(frag);
  }

  const info = document.querySelector("#servicesResultInfo");
  if (info) info.textContent = `${total} result${total === 1 ? "" : "s"}`;
}

/* ---------- helpers ---------- */
const TYPE_LABEL = {
  inn: "Inn",
  personal_services: "Personal",
  public_services: "Public",
  transport: "Transport",
  professional: "Professional",
  magical: "Magical",
  security: "Security",
  criminal: "Criminal",
  banking: "Banking",
  bureaucratic: "Bureaucratic",
};

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

// Typed pills (so you can style via CSS like .tb-badge.type.type-inn, etc.)
function typePill(key) {
  const span = document.createElement("span");
  span.className = `tb-badge type type-${key}`;
  span.textContent = TYPE_LABEL[key] || key;
  return span;
}

function qualityPill(q) {
  const cls = String(q || "").replace(/_/g, "-"); // low_quality -> low-quality
  const span = document.createElement("span");
  span.className = `tb-badge quality quality-${cls}`;
  span.textContent = (q || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (s) => s.toUpperCase());
  return span;
}

function modelPill(model) {
  const cls = String(model || "").replace(/_/g, "-"); // per_meal -> per-meal
  const span = document.createElement("span");
  span.className = `tb-badge model model-${cls}`;
  span.textContent = MODEL_LABEL[model] || model;
  return span;
}

function countBadge(n) {
  const span = document.createElement("span");
  span.className = "tb-badge count";
  span.textContent = String(n);
  return span;
}

function illicitBadge(is) {
  if (!is) return null;
  const span = document.createElement("span");
  // include both 'illicit' and warn class so your CSS can hook either
  span.className = "tb-badge illicit tb-badge-warn";
  span.textContent = "Illicit";
  return span;
}

/* coin chips with currency suffixes (pp/gp/sp/cp) */
function coinChips(price) {
  const wrap = document.createElement("span");
  wrap.className = "coins";
  const order = [
    ["pp", "pp"],
    ["gp", "gp"],
    ["sp", "sp"],
    ["cp", "cp"],
  ];
  let added = false;
  for (const [k, suf] of order) {
    const v = price?.[k];
    if (!v) continue;
    const el = document.createElement("span");
    el.className = `coin coin-${k}`;
    el.textContent = `${v}${suf}`;
    wrap.append(el);
    added = true;
  }
  if (!added) wrap.textContent = "—";
  return wrap;
}

function renderServiceRow(s) {
  const li = document.createElement("li");
  li.className = "tb-row";

  const left = document.createElement("div");
  left.className = "tb-cell tb-grow";

  const name = document.createElement("div");
  name.className = "tb-title";
  name.textContent = s.name;

  const meta = document.createElement("div");
  meta.className = "tb-meta";
  meta.append(
    typePill(s.service_type),
    document.createTextNode(" "),
    qualityPill(s.quality),
    document.createTextNode(" "),
    modelPill(s.service_model)
  );
  const il = illicitBadge(s.is_illicit);
  if (il) meta.append(document.createTextNode(" "), il);

  left.append(name, meta);

  const right = document.createElement("div");
  right.className = "tb-cell tb-nowrap";
  right.append(coinChips(s.price_coins));

  li.append(left, right);
  return li;
}

/* ---------- controls wiring ---------- */
window.addEventListener("DOMContentLoaded", async () => {
  const mount = document.querySelector("#services, [data-services]");
  if (!mount) return;

  const typeSel = document.querySelector("#servicesTypeSelect");
  const searchInput = document.querySelector("#servicesSearch");
  const searchBtn = document.querySelector("#servicesSearchBtn");
  const resetBtn = document.querySelector("#servicesResetBtn");

  await renderServicesList({ mount });

  const run = () =>
    renderServicesList({
      mount,
      serviceType: typeSel?.value || "",
      query: searchInput?.value || "",
    }).then(() => mount.scrollIntoView({ block: "nearest" }));

  typeSel?.addEventListener("change", run);
  searchBtn?.addEventListener("click", run);
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });
  resetBtn?.addEventListener("click", () => {
    if (typeSel) typeSel.value = "";
    if (searchInput) searchInput.value = "";
    renderServicesList({ mount });
  });
});
