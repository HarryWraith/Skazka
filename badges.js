// badges.js — shared pill/badge + coins utilities (logic-only)

// ---------- text utils ----------
export const titleCase = (s = "") =>
  String(s)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

// ----------
export function badge(classes, label, { title } = {}) {
  const el = document.createElement("span");
  el.className = `tb-badge ${classes}`.trim();
  el.textContent = String(label ?? "");
  if (title) el.title = title;
  return el;
}

// HTML version for string-building modules (shop/treasure)
export function badgeHtml(classes, label, { title } = {}) {
  const t = title ? ` title="${title}"` : "";
  return `<span class="tb-badge ${classes}"${t}>${label}</span>`;
}

// ---------- common “typed” badges ----------
export function qualityPill(q) {
  const k = String(q || "").replace(/_/g, "-");
  return badge(`quality quality-${k}`, titleCase(q || ""));
}
export function modelPill(model, map = {}) {
  const cls = String(model || "").replace(/_/g, "-");
  const label = map?.[model] || model || "";
  return badge(`model model-${cls}`, label);
}
export function illicitPill(is) {
  return is ? badge("illicit tb-badge-warn", "Illicit") : null;
}
export function countBadge(n) {
  return badge("count", String(n));
}

// ---------- coins ----------
export function coinChipsNode(price) {
  const wrap = document.createElement("span");
  wrap.className = "coins";
  const order = ["pp", "gp", "sp", "cp"];
  let added = false;
  for (const k of order) {
    const v = price?.[k];
    if (!v) continue;
    const el = document.createElement("span");
    el.className = `coin coin-${k}`;
    el.textContent = `${v}${k}`;
    wrap.append(el);
    added = true;
  }
  if (!added) wrap.textContent = "—";
  return wrap;
}
export function coinRowHtml(coins, cls = "") {
  if (!coins) return "";
  const html = ["pp", "gp", "sp", "cp"]
    .map((k) =>
      coins[k] ? `<span class="coin coin-${k}">${coins[k]}${k}</span>` : ""
    )
    .join(" ")
    .trim();
  return html ? `<span class="coins ${cls}">${html}</span>` : "";
}

// ---------- NPC alignment helper (shared so styling is uniform) ----------
export function alignClass(txt) {
  const v = String(txt || "")
    .toUpperCase()
    .trim();
  if (/(LG|NG|CG|GOOD)/.test(v)) return "good";
  if (/(LE|NE|CE|EVIL)/.test(v)) return "evil";
  return "neutral";
}
