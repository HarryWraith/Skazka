// main.js — entry for generators page

// ───────────────────────────────────────────────
// Side-effect modules (they wire themselves up)
import "./shop.js";
import "./forge.js";
import "./gathering.js";
import "./npc.js";

// Feature modules we call from here
import * as weather from "./weather.js";
import * as traps from "./traps.js";
import * as doors from "./doors.js";
import * as names from "./names.js";
import * as treasure from "./treasure.js";
import * as encounters from "./encounters.js";

// Ensure treasure data fetch can start early
treasure.loadTreasureData?.();

// ───────────────────────────────────────────────
// Site chrome: navbar + footer injection
async function inject(url, mountId, onload) {
  const mount = document.getElementById(mountId);
  if (!mount) return false;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const html = await res.text();
    mount.innerHTML = html;
    if (typeof onload === "function") onload(mount);
    return true;
  } catch (err) {
    console.error(`Failed to load ${url}:`, err);
    return false;
  }
}

function bootChrome() {
  // use absolute paths to match your previous setup (GitHub Pages compatible)
  inject("/navbar.html", "navbar", () => {
    if (window.initNavbar) window.initNavbar();
  });
  inject("/footer.html", "footer");
}

// ───────────────────────────────────────────────
// Voices of Skazka carousel (desktop only)
const VOICES_MQ = "(max-width: 767px)";

function findVoicesRoot() {
  return (
    document.getElementById("voicesCarousel") ||
    document.querySelector("section.skz-fc") ||
    document.querySelector(".skz-fc-stage")?.closest("section, .skz-fc") ||
    null
  );
}

function teardownVoicesCarousel(root) {
  if (!root) return;
  const stage = root.querySelector(".skz-fc-stage");
  const slides = root.querySelectorAll(".skz-fc-slide");
  const navs = root.querySelectorAll(".skz-fc-nav");

  stage?.classList.remove("is-ready");
  slides.forEach((s) =>
    s.classList.remove("skz-active", "skz-prev", "skz-next")
  );
  navs.forEach((n) => n.removeAttribute("disabled"));
}

function initVoicesCarousel(root) {
  if (!root) return;

  const stage = root.querySelector(".skz-fc-stage");
  const slides = Array.from(root.querySelectorAll(".skz-fc-slide"));
  if (!stage || !slides.length) return;

  const btnPrev = root.querySelector(".skz-fc-prev");
  const btnNext = root.querySelector(".skz-fc-next");

  // Avoid rebinding if already initialized once
  if (root.dataset.bound === "1") {
    root._skzApply?.();
    return;
  }
  root.dataset.bound = "1";

  let i = 0;

  function apply() {
    const n = slides.length;
    const prev = (i - 1 + n) % n;
    const next = (i + 1) % n;

    slides.forEach((s, idx) => {
      s.classList.remove("skz-active", "skz-prev", "skz-next");
      if (idx === i) s.classList.add("skz-active");
      else if (idx === prev) s.classList.add("skz-prev");
      else if (idx === next) s.classList.add("skz-next");
    });

    stage.classList.add("is-ready");
  }

  function go(delta) {
    i = (i + delta + slides.length) % slides.length;
    apply();
  }

  // Buttons (bind once)
  btnPrev?.addEventListener("click", () => go(-1));
  btnNext?.addEventListener("click", () => go(+1));

  // Click on active slide -> follow link
  root.addEventListener("click", (e) => {
    const slide = e.target.closest(".skz-fc-slide");
    if (!slide || !slide.classList.contains("skz-active")) return;
    const href =
      slide.dataset.href || slide.querySelector("a")?.getAttribute("href");
    if (href) window.location.href = href;
  });

  // Keyboard
  root.setAttribute("tabindex", "0");
  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(+1);
    }
  });

  function settleThenApply() {
    apply();
    if (document.fonts?.ready) {
      document.fonts.ready.then(apply).catch(() => {});
    }
    const imgs = root.querySelectorAll("img");
    let pending = imgs.length;
    if (!pending) return;
    imgs.forEach((img) => {
      if (img.complete) {
        if (--pending === 0) apply();
      } else {
        img.addEventListener(
          "load",
          () => {
            if (--pending === 0) apply();
          },
          { once: true }
        );
        img.addEventListener(
          "error",
          () => {
            if (--pending === 0) apply();
          },
          { once: true }
        );
      }
    });
  }

  root._skzApply = apply;
  settleThenApply();
  apply(); // start at slide 0
}

function startVoicesCarousel() {
  const root = findVoicesRoot();
  if (!root) return;

  if (window.matchMedia(VOICES_MQ).matches) {
    // Mobile: no carousel behavior
    teardownVoicesCarousel(root);
  } else {
    initVoicesCarousel(root);
    // If already bound, re-apply state to ensure correct classes
    if (root.dataset.bound === "1" && typeof root._skzApply === "function") {
      root._skzApply();
    }
  }
}

// ───────────────────────────────────────────────
// Page-specific helpers
const $ = (sel) => document.querySelector(sel);
const randOption = (selectEl) => {
  const opts = Array.from(selectEl?.options || []);
  if (!opts.length) return;
  selectEl.value = opts[Math.floor(Math.random() * opts.length)].value;
};

// ───────────────────────────────────────────────
// Wire everything once DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Boot site chrome and carousel
  bootChrome();
  startVoicesCarousel();
  window.matchMedia(VOICES_MQ).addEventListener("change", startVoicesCarousel);

  // Prefetch data used by some modules (no-op if already loaded)
  weather.loadWeatherData?.();
  traps.loadTrapsData?.();
  encounters.loadEncountersData?.();

  // ────────────────── WEATHER ──────────────────
  $("#rollWeather")?.addEventListener("click", () => {
    const zone = $("#zone")?.value;
    const season = $("#season")?.value;
    $("#weatherResult").textContent = weather.rollWeather(zone, season);
  });
  $("#randWeather")?.addEventListener("click", () => {
    const z = $("#zone");
    const s = $("#season");
    if (z) randOption(z);
    if (s) randOption(s);
  });

  // ─────────────────── TRAPS ───────────────────
  $("#rollTrap")?.addEventListener("click", () => {
    const type = $("#trapTech")?.value;
    const lethality = $("#trapLevel")?.value;
    const env = $("#trapEnv")?.value;
    const dcBracket = $("#trapDcBracket")?.value;
    const t = traps.rollTrapV3({ type, lethality, env, dcBracket });
    $("#trapResult").innerHTML = traps.renderTrapV3(t);
  });
  $("#randTrap")?.addEventListener("click", () => {
    ["trapTech", "trapLevel", "trapEnv", "trapDcBracket"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) randOption(el);
    });
  });

  // ─────────────────── TREASURE ─────────────────
  function _get(id) {
    return document.getElementById(id);
  }
  function _coinPill(k, v) {
    return v ? `<span class="coin coin-${k}">${v}${k}</span>` : "";
  }
  function _renderCoins(coins, cls = "") {
    if (!coins) return "";
    const html = ["pp", "gp", "sp", "cp"]
      .map((k) => _coinPill(k, coins[k]))
      .join(" ");
    return html.trim() ? `<span class="coins ${cls}">${html}</span>` : "";
  }

  _get("rollTreasure")?.addEventListener("click", async () => {
    await treasure.loadTreasureData?.(); // ensure catalog is ready
    const level = _get("treasureLevel")?.value || "levelNormal";
    const mode = _get("treasureMode")?.value || "hoard";
    const band = _get("treasureBand")?.value || "mid";
    const t = treasure.rollTreasure(mode, band, level);
    _get("treasureResult").innerHTML = treasure.renderTreasure(t); // includes badges for magic items
  });

  _get("randTreasure")?.addEventListener("click", () => {
    ["treasureLevel", "treasureMode", "treasureBand"].forEach((id) => {
      const el = _get(id);
      if (el) randOption(el);
    });
    _get("rollTreasure")?.click(); // re-roll after randomize
  });

  _get("randomGem")?.addEventListener("click", async () => {
    await treasure.loadTreasureData?.();
    const band = _get("treasureBand")?.value || "mid";
    const level = _get("treasureLevel")?.value || "levelNormal";
    const t = treasure.rollTreasure("hoard", band, level);
    const g = t.gem_items?.[0];
    const label = g
      ? `${g.name}${g.sell_price != null ? ` (${g.sell_price} gp)` : ""}`
      : "—";
    const coins = _renderCoins(g?.sell_coins, "coins-sell");
    _get(
      "treasureResult"
    ).innerHTML = `<div><strong>Random Gem</strong></div><div class="loot-line loot-gem">${label} ${coins}</div>`;
  });

  _get("randomArt")?.addEventListener("click", async () => {
    await treasure.loadTreasureData?.();
    const band = _get("treasureBand")?.value || "mid";
    const level = _get("treasureLevel")?.value || "levelNormal";
    const t = treasure.rollTreasure("hoard", band, level);
    const a = t.art_items?.[0];
    const label = a
      ? `${a.name}${a.sell_price != null ? ` (${a.sell_price} gp)` : ""}`
      : "—";
    const coins = _renderCoins(a?.sell_coins, "coins-sell");
    _get(
      "treasureResult"
    ).innerHTML = `<div><strong>Random Art</strong></div><div class="loot-line loot-art">${label} ${coins}</div>`;
  });

  // ─────────────────── NAMES ───────────────────
  $("#rollName")?.addEventListener("click", () => {
    const species = $("#nameSpecies")?.value;
    const gender = $("#nameGender")?.value;
    $("#nameResult").textContent = names.rollNamesPeople(species, gender, 3);
  });
  $("#randName")?.addEventListener("click", () => {
    ["nameSpecies", "nameGender"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) randOption(el);
    });
  });

  // ─────────────── RANDOM ENCOUNTERS ───────────
  $("#rollEncounter")?.addEventListener("click", () => {
    const zone = $("#encounterZone")?.value;
    const risk = $("#encounterRisk")?.value;
    $("#encounterResult").innerHTML = encounters.rollEncounter(zone, risk);
  });
  $("#randEncounter")?.addEventListener("click", () => {
    ["encounterZone", "encounterRisk"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) randOption(el);
    });
  });

  // ─────────────────── DOORS ───────────────────
  $("#rollDoor")?.addEventListener("click", () => {
    const d = doors.rollDoor();
    $("#doorResult").innerHTML = doors.renderDoor(d);
  });
});
