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
//doors//
// small helper for CSS-friendly modifiers (e.g. "Closed Unlocked" -> "closed-unlocked")
export const slugify = (s = "") =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Door state pill -> <span class="tb-badge door-state state-open">Open</span>
export function doorStateBadge(stateText) {
  const slug = slugify(stateText || "");
  return badgeHtml(`door-state state-${slug}`, titleCase(stateText || ""));
}

// Lock type pill -> <span class="tb-badge door-lock locktype-padlock">Padlock</span>
export function lockTypeBadge(lockType) {
  const slug = slugify(lockType || "no lock");
  return badgeHtml(
    `door-lock locktype-${slug}`,
    titleCase(lockType || "no lock")
  );
}

// Lock quality pill (adds " Lock" to label) -> "Exquisite Lock"
export function lockQualityBadge(lockQuality) {
  if (!lockQuality) return "";
  const slug = slugify(lockQuality);
  return badgeHtml(
    `door-lockq lockq-${slug}`,
    `${titleCase(lockQuality)} Lock`
  );
}

// Locks-from pill -> classes: locks-from-this-side | locks-from-other-side
export function locksFromBadge(side) {
  if (!side) return "";
  const slug = slugify(side);
  return badgeHtml(`door-side locks-from-${slug}`, titleCase(side));
}

// Pick pills:
// - pickable + dc -> "Pickable" + "Pick DC N"
// - unpickableReason === "broken" -> "Unpickable - broken"
// - otherwise unpickable -> "Unpickable"
// - no lock -> ""
export function pickPills({ pickable, dc, unpickableReason } = {}) {
  if (pickable && Number.isFinite(dc)) {
    return [
      badgeHtml("door-pick ok", "Pickable"),
      badgeHtml(`door-pickdc dcv-${dc}`, `Pick DC ${dc}`),
    ].join(" ");
  }
  if (pickable === false) {
    const label =
      unpickableReason === "broken" ? "Unpickable - broken" : "Unpickable";
    return badgeHtml("door-pickdc pick-impossible", label);
  }
  return "";
}

// Hinges chips -> "Silent"/"Noisy", optional "Jammed", optional "Breaks on Open"
export function hingeChipsHtml({ noise, jammed, open_fail_pct } = {}) {
  const chips = [];
  const n = String(noise || "").toLowerCase() === "silent" ? "silent" : "noisy";
  chips.push(badgeHtml(`door-hingechip hinge-${n}`, titleCase(n)));
  if (jammed) chips.push(badgeHtml("door-hingechip hinge-jammed", "Jammed"));
  if (Number(open_fail_pct || 0) > 0)
    chips.push(badgeHtml("door-hingechip hinge-breaks", "Breaks on Open"));
  return chips.join(" ");
}
