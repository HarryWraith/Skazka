/* ============================================================================
WHY SHOP / SERVICES / TAVERN BROKE BEFORE — READ ME (for future me)

SYMPTOM
- Panels for Shop, Services, and Tavern didn't render, or showed “Loading…” forever.

ROOT CAUSE
- I started *gating imports by DOM selectors* in main.js so modules only load on
  pages that have a mount. That’s good in principle, **but**:
  1) The selectors I used didn’t match the page DOM (e.g. I gated on #shop, but
     the actual elements were #rollShop / #shopResult / #shop-panel). Result:
     the module never imported → no UI.
  2) I also gated modules that are *logic-only* (no DOM side effects), then
     referenced their functions in page handlers. On pages without the gate,
     those functions were undefined when wired.

THE FIX WE’RE USING NOW
- **Import these self-gating, side-effect modules unconditionally:**  
  `services.js`, `shop.js`, `inn.js`, `gathering.js`  
  They all safely no-op if their mounts aren’t on the page (they check the DOM
  before rendering/attaching), so they won’t “bleed” UI across the site.
- **Import these logic-only modules everywhere:**  
  `weather.js`, `traps.js`, `doors.js`, `names.js`, `treasure.js`, `encounters.js`  
  They don’t touch the DOM unless called, so it’s safe to import globally.
- **Do NOT import `npc.js` globally.**  
  That one *does* bleed UI if loaded everywhere; only load it on NPC pages.

RULE OF THUMB (so I don’t repeat this)
1) If a module **renders UI automatically** on load and is **NOT** self-gating,
   gate it behind an exact mount selector. (e.g. npc.js)
2) If a module **is self-gating** (checks for its mount before doing anything),
   import it unconditionally. (services.js, shop.js, inn.js, gathering.js)
3) If a module is **logic-only** (exports functions but no auto-render),
   import it unconditionally. (weather/traps/doors/names/treasure/encounters)
4) If I still choose to gate something, make sure the **selector matches real DOM**:
   - Services: `#services`, `[data-services]`, or `#services-panel`
   - Shop:     `#rollShop`, `#shopResult`, `#shop-panel`, or `[data-shop]`
   - Tavern:   `#inn-panel` / `#innGenBtn` / `#innResult` (but we import it anyway)

QUICK DEBUG CHECKLIST
- Open console on the target page and verify selectors:
    document.querySelector("#services")          // expect element or null
    document.querySelector("#rollShop")          // expect element or null
    document.querySelector("#innGenBtn")         // expect element or null
- If a module isn’t rendering:
  • Is it actually imported? (Network tab > JS)  
  • If gated, does the gate selector exist on this page?  
  • For self-gating modules, does the module’s DOMContentLoaded handler early-return
    when mounts are missing? (It should.)
- For Shop pages, ensure treasure data preloads:
    treasure.loadTreasureData?.();

BOTTOM LINE
- Only gate modules that truly need it (e.g., npc.js).  
- Let self-gating and logic-only modules import everywhere.  
- When gating, **use the exact selectors the module expects**, or it will never run.

============================================================================ */

// Side-effect modules that are SAFE to yload everywhere (they gate themselves)
import "./services.js";
import "./shop.js";
import "./inn.js";
import "./gathering.js"; // was already working for you

// Logic-only modules (no DOM bleed)
import * as weather from "./weather.js";
import * as traps from "./traps.js";
import * as doors from "./doors.js";
import * as names from "./names.js";
import * as treasure from "./treasure.js";
import * as encounters from "./encounters.js";
import * as blueprints from "./blueprints.js";

// ───────────────────────────────────────────────
// Utils
const $ = (sel) => document.querySelector(sel);
const has = (sel) => !!$(sel);
function nudgeDomReady() {
  if (document.readyState !== "loading") {
    queueMicrotask(() => document.dispatchEvent(new Event("DOMContentLoaded")));
  }
}
const randOption = (selectEl) => {
  const opts = Array.from(selectEl?.options || []);
  if (!opts.length) return;
  selectEl.value = opts[Math.floor(Math.random() * opts.length)].value;
};

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

  if (root.dataset.bound === "1") {
    root._skzApply?.();
    return;
  }
  root.dataset.bound = "1";

  let i = 0;
  function apply() {
    const n = slides.length,
      prev = (i - 1 + n) % n,
      next = (i + 1) % n;
    slides.forEach((s, idx) => {
      s.classList.remove("skz-active", "skz-prev", "skz-next");
      if (idx === i) s.classList.add("skz-active");
      else if (idx === prev) s.classList.add("skz-prev");
      else if (idx === next) s.classList.add("skz-next");
    });
    stage.classList.add("is-ready");
  }
  function go(d) {
    i = (i + d + slides.length) % slides.length;
    apply();
  }

  btnPrev?.addEventListener("click", () => go(-1));
  btnNext?.addEventListener("click", () => go(+1));

  root.addEventListener("click", (e) => {
    const slide = e.target.closest(".skz-fc-slide");
    if (!slide || !slide.classList.contains("skz-active")) return;
    const href =
      slide.dataset.href || slide.querySelector("a")?.getAttribute("href");
    if (href) window.location.href = href;
  });

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
    if (document.fonts?.ready) document.fonts.ready.then(apply).catch(() => {});
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
  apply();
}
function startVoicesCarousel() {
  const root = findVoicesRoot();
  if (!root) return;
  if (window.matchMedia(VOICES_MQ).matches) {
    teardownVoicesCarousel(root);
  } else {
    initVoicesCarousel(root);
    if (root.dataset.bound === "1" && typeof root._skzApply === "function")
      root._skzApply();
  }
}

// ───────────────────────────────────────────────
// Boot — wire everything
async function boot() {
  // Preload treasure data for Shop/Treasure UIs
  if (
    has("#treasure, [data-treasure]") ||
    has("#shop, [data-shop]") ||
    has("#rollShop, #shopResult, #shop-panel")
  ) {
    treasure.loadTreasureData?.();
    nudgeDomReady();
  }

  // Boot site chrome + carousel on all pages
  bootChrome();
  startVoicesCarousel();
  window.matchMedia(VOICES_MQ).addEventListener("change", startVoicesCarousel);

  // Prefetch data used by some modules (no-op if not present)
  weather.loadWeatherData?.();
  traps.loadTrapsData?.();
  encounters.loadEncountersData?.();
  // ------------------ npc---------------
  // ─────────────────── NPC (robust gated loader) ───────────────────
  const NPC_SEL =
    "#npc-panel, #npc, [data-npc], #npcGenBtn, #npcResult, #npcSearch";
  let npcLoaded = false;

  async function ensureNPC() {
    if (npcLoaded) return;
    const mod = await import("./npc.js");
    npcLoaded = true;

    // Try common init exports if the module provides one
    (mod.initNPC || mod.init || mod.boot || mod.default)?.();

    // Fallback: nudge late DOM listeners inside npc.js
    nudgeDomReady();
  }

  // 1) If NPC UI is already on the page, load now
  if (document.querySelector(NPC_SEL)) {
    await ensureNPC();
  } else {
    // 2) If it might appear later (templated pages), watch the DOM briefly
    const mo = new MutationObserver((muts, obs) => {
      if (document.querySelector(NPC_SEL)) {
        obs.disconnect();
        ensureNPC();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // 3) Also try once at DOM ready in case markup lands late
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        if (document.querySelector(NPC_SEL)) ensureNPC();
      },
      { once: true }
    );
  }
  // ────────────────── WEATHER ──────────────────
  $("#rollWeather")?.addEventListener("click", () => {
    const zone = $("#zone")?.value;
    const season = $("#season")?.value;
    $("#weatherResult").textContent = weather.rollWeather?.(zone, season) ?? "";
  });
  $("#randWeather")?.addEventListener("click", () => {
    const z = $("#zone");
    const s = $("#season");
    if (z) randOption(z);
    if (s) randOption(s);
  });

  // ─────────────────── inns ───────────────────

  const INN_DATA_URL = "./data/inn.json";

  async function loadInnData(url = INN_DATA_URL) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.json();
  }
  // ─────────────────── TRAPS ───────────────────
  $("#rollTrap")?.addEventListener("click", () => {
    const type = $("#trapTech")?.value;
    const lethality = $("#trapLevel")?.value;
    const env = $("#trapEnv")?.value;
    const dcBracket = $("#trapDcBracket")?.value;
    const t = traps.rollTrapV3?.({ type, lethality, env, dcBracket });
    if (t) $("#trapResult").innerHTML = traps.renderTrapV3(t);
  });
  $("#randTrap")?.addEventListener("click", () => {
    ["trapTech", "trapLevel", "trapEnv", "trapDcBracket"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) randOption(el);
    });
  });

  // ─────────────────── TREASURE ─────────────────
  const _get = (id) => document.getElementById(id);
  const _coinPill = (k, v) =>
    v ? `<span class="coin coin-${k}">${v}${k}</span>` : "";
  const _renderCoins = (coins, cls = "") =>
    coins
      ? `<span class="coins ${cls}">${["pp", "gp", "sp", "cp"]
          .map((k) => _coinPill(k, coins[k]))
          .join(" ")}</span>`
      : "";

  _get("rollTreasure")?.addEventListener("click", async () => {
    await treasure.loadTreasureData?.();
    const level = _get("treasureLevel")?.value || "levelNormal";
    const mode = _get("treasureMode")?.value || "hoard";
    const band = _get("treasureBand")?.value || "mid";
    const t = treasure.rollTreasure?.(mode, band, level);
    if (t) _get("treasureResult").innerHTML = treasure.renderTreasure(t);
  });

  _get("randTreasure")?.addEventListener("click", () => {
    ["treasureLevel", "treasureMode", "treasureBand"].forEach((id) => {
      const el = _get(id);
      if (el) randOption(el);
    });
    _get("rollTreasure")?.click();
  });

  // --- Random Gem (now shows Reagent badge) ---
  // --- Random Gem (show Gem + Reagent badges) ---
  _get("randomGem")?.addEventListener("click", async () => {
    await treasure.loadTreasureData?.(); // ensure catalog is ready
    const band = _get("treasureBand")?.value || "mid";
    const level = _get("treasureLevel")?.value || "levelNormal";
    const t = treasure.rollTreasure("hoard", band, level);
    const g = t.gem_items?.[0];

    const label = g
      ? `${g.name}${g.sell_price != null ? ` (${g.sell_price} gp)` : ""}`
      : "—";
    const coins = _renderCoins(g?.sell_coins, "coins-sell");

    const hasTag = (tag) =>
      Array.isArray(g?.tags) &&
      g.tags.some((t) => String(t).toLowerCase() === tag);

    const badges = [
      hasTag("gem") && `<span class="tb-badge gem" title="Gem">Gem</span>`,
      hasTag("reagent") &&
        `<span class="tb-badge reagent" title="Crafting Reagent">Reagent</span>`,
    ]
      .filter(Boolean)
      .join(" ");

    _get("treasureResult").innerHTML = `
    <div><strong>Random Gem</strong></div>
    <div class="loot-line loot-gem">
      <span class="tb-detail-name">${label}</span>
      ${badges} ${coins}
    </div>`;
  });

  _get("randomArt")?.addEventListener("click", async () => {
    await treasure.loadTreasureData?.();
    const band = _get("treasureBand")?.value || "mid";
    const level = _get("treasureLevel")?.value || "levelNormal";
    const t = treasure.rollTreasure?.("hoard", band, level);
    const a = t?.art_items?.[0];
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
    $("#nameResult").textContent =
      names.rollNamesPeople?.(species, gender, 3) ?? "";
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
    const html = encounters.rollEncounter?.(zone, risk) ?? "";
    $("#encounterResult").innerHTML = html;
  });
  $("#randEncounter")?.addEventListener("click", () => {
    ["encounterZone", "encounterRisk"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) randOption(el);
    });
  });

  // ─────────────── BLUEPRINTS (Magic Item Blueprints) ───────────────
  $("#bpShow")?.addEventListener("click", async () => {
    try {
      await blueprints.ensureData(); // loads ./data/blueprints.json (no fallbacks)
    } catch (e) {
      console.error(e);
      $("#bpResult").textContent = "Failed to load /data/blueprints.json";
      return;
    }

    const type = $("#bpType")?.value || "__all__";
    const rarity = $("#bpRarity")?.value || "__all__";
    const search = $("#bpSearch")?.value?.trim() || "";

    const results = blueprints.filterResults({ type, rarity, search });
    blueprints.renderList($("#bpResult"), results);

    // click a row to render details on the right
    $("#bpResult").onclick = (ev) => {
      const btn = ev.target.closest("[data-bp]");
      if (!btn) return;
      const id = btn.getAttribute("data-bp");
      const bp = blueprints.getById(id);
      blueprints.renderDetail($("#bpDetail"), bp, {
        coinMode: $("#bpCoins")?.checked,
      });
    };
  });

  $("#bpCoins")?.addEventListener("change", () => {
    const st = blueprints.getState?.();
    if (!st?.LAST?.selectedId) return;
    const bp = blueprints.getById(st.LAST.selectedId);
    blueprints.renderDetail($("#bpDetail"), bp, {
      coinMode: $("#bpCoins")?.checked,
    });
  });

  // re-render detail when coin mode changes
  $("#bpCoins")?.addEventListener("change", () => {
    const st = blueprints.getState?.();
    if (!st?.LAST?.selectedId) return;
    const bp = blueprints.getById(st.LAST.selectedId);
    blueprints.renderDetail($("#bpDetail"), bp, {
      coinMode: $("#bpCoins")?.checked,
    });
  });

  // re-render detail when coin mode changes
  $("#bpCoins")?.addEventListener("change", () => {
    const st = blueprints.getState?.();
    if (!st?.LAST?.selectedId) return;
    const bp = blueprints.getById?.(st.LAST.selectedId);
    blueprints.renderDetail?.($("#bpDetail"), bp, {
      coinMode: $("#bpCoins")?.checked,
    });
  });

  // ─────────────────── DOORS ───────────────────
  $("#rollDoor")?.addEventListener("click", () => {
    const d = doors.rollDoor?.();
    if (d) $("#doorResult").innerHTML = doors.renderDoor(d);
  });
}

// Run at the right time on every page
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
