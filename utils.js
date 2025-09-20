// Shared utility functions
export const randint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const pick = (arr) => arr[randint(0, arr.length - 1)];

// Generic weighted picker: array of { v, w } or { type, w }. Returns a value.
export function pickWeighted(items) {
  const total = items.reduce((n, it) => n + (Number(it.w) || 0), 0);
  if (!total)
    return items.length ? items[0].v ?? items[0].type ?? items[0] : null;
  let r = Math.random() * total;
  for (const it of items) {
    r -= Number(it.w) || 0;
    if (r <= 0) return it.v ?? it.type ?? it;
  }
  const last = items[items.length - 1];
  return last.v ?? last.type ?? last;
}

export const ucfirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const get = (sel) => document.querySelector(sel);

export const setText = (sel, txt) => {
  const o = get(sel);
  if (o) o.textContent = txt;
};

export const setHTML = (sel, html) => {
  const o = get(sel);
  if (o) o.innerHTML = html;
};

export const setVal = (sel, val) => {
  const el = get(sel);
  if (el) el.value = val;
};

export const rollBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
