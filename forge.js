/* forge.js — SRD • XGtE • Homebrew: Skazka (stacked outcomes) */
(() => {
  "use strict";

  // ---------- Constants ----------
  const ID = {
    SOURCE: "forgeSource",
    SHEET: "forgeSheet",
    GEN_OUT: "forgeComponentsResult",
    MAT_PREVIEW: "skzMatPreview",
    MAT_ALL: "skzMatAll",
    MAT_TOGGLE: "skzMatToggle",
  };

  const GEN_RULES = {
    common: { common: 2 },
    uncommon: { common: 2, uncommon: 1 },
    rare: { common: 2, uncommon: 2, rare: 1 },
    very_rare: { common: 2, uncommon: 2, rare: 2, very_rare: 1 },
    legendary: { common: 2, uncommon: 2, rare: 2, legendary: 1 },
    artifact: { common: 2, uncommon: 2, rare: 2, legendary: 3 },
  };

  // ---------- Skazka base materials ----------
  const BASE_MATERIALS = [
    {
      name: "Mithril",
      rarity: "uncommon",
      desc: "Feather-light and strong; ideal for finesse blades, mail, and stealth gear.",
    },
    {
      name: "Darkwood",
      rarity: "uncommon",
      desc: "Metal-strong wood; straight-shooting bows, staves, and light shields.",
    },
    {
      name: "Obsidian",
      rarity: "uncommon",
      desc: "Razor edges, brittle core; perfect for arrows and ritual knives.",
    },
    {
      name: "Drakehide",
      rarity: "uncommon",
      desc: "Scaled leather that sheds heat; supple and quiet.",
    },
    {
      name: "Coralsteel",
      rarity: "uncommon",
      desc: "Sea-forged alloy; resists rust and bites through hide underwater.",
    },

    {
      name: "Adamantine",
      rarity: "rare",
      desc: "Near-unbreakable lattice; armor shrugs critical hits, tools chew stone.",
    },
    {
      name: "Ebonwood",
      rarity: "rare",
      desc: "Gloom-soaked timber; necrotic-tolerant staves and wands.",
    },
    {
      name: "Stormsteel",
      rarity: "rare",
      desc: "Hums with static; conducts shock and keeps an edge in storms.",
    },
    {
      name: "Bloodiron",
      rarity: "rare",
      desc: "Dark alloy that ‘drinks’; cuts that linger and bleed.",
    },
    {
      name: "Voidglass",
      rarity: "rare",
      desc: "Umbral refraction; excellent for scrying/illusion foci and lenses.",
    },
    {
      name: "Moonstone Alloy",
      rarity: "rare",
      desc: "Lunar-quenched metal; favors calm minds, cool to the touch.",
    },
    {
      name: "Phoenix Feather Weave",
      rarity: "rare",
      desc: "Fire-fond cloth; slow self-mend from embers.",
    },

    {
      name: "Starmetal (Aetherite)",
      rarity: "very_rare",
      desc: "Star-calm matrix; time feels steadier around it.",
    },
    {
      name: "Soulglass",
      rarity: "very_rare",
      desc: "Holds echoes of wielders; superb focus for charges and attunement.",
    },
    {
      name: "Flameforged Steel",
      rarity: "very_rare",
      desc: "Volcano-tempered; loves heat, rings bright when struck.",
    },
    {
      name: "Frostiron",
      rarity: "very_rare",
      desc: "Glacier-annealed; quenches sparks, steals heat.",
    },
    {
      name: "Stonehide",
      rarity: "very_rare",
      desc: "Monster carapace made flexible; blunt-proof plates.",
    },
    {
      name: "Tempest Core Ore",
      rarity: "very_rare",
      desc: "Lightning-latticed ore; crackles when drawn.",
    },
    {
      name: "Tideglass",
      rarity: "very_rare",
      desc: "Pressure-tough glass; sings to currents and moon pull.",
    },
    {
      name: "Blightwood",
      rarity: "very_rare",
      desc: "Tainted heartwood; wards rot but drinks light.",
    },
    {
      name: "Radiant Silk",
      rarity: "very_rare",
      desc: "Sun-loomed filament; gently glows, resists shadow.",
    },
    {
      name: "Shadowthread",
      rarity: "very_rare",
      desc: "Gloom-spun fiber; swallows glints, muffles movement.",
    },
    {
      name: "Voidsteel",
      rarity: "very_rare",
      desc: "Anti-glare alloy; dampens hostile dispels and detection.",
    },

    {
      name: "Ethercloth",
      rarity: "legendary",
      desc: "Planar silk; long-duration magic binds exceptionally well.",
    },
    {
      name: "Spellforged Iron",
      rarity: "legendary",
      desc: "Perfect sigil-taking grain; resists overwrites and unravels.",
    },
    {
      name: "Nullhide",
      rarity: "legendary",
      desc: "Aura-damping leather; superb for anti-magic cloaks and sheaths.",
    },
    {
      name: "Dreamglass",
      rarity: "legendary",
      desc: "Oneiric channel; illusions and enchantments take deep root.",
    },

    {
      name: "Titanbone",
      rarity: "artifact",
      desc: "Impossible marrow lattice; frames artifacts and colossal arms.",
    },
    {
      name: "Astralite",
      rarity: "artifact",
      desc: "Fallen-star core; sings under divination, stubborn to break.",
    },
    {
      name: "Deepcore Ember",
      rarity: "artifact",
      desc: "Underworld furnace crystal; burns without fuel, never cools.",
    },
  ];

  // ---------- Shared UI snippets ----------
  const toolsHTML = `
    <div class="forge-tools" role="list" aria-label="Common tools for crafting item types">
      <div class="forge-tool" role="listitem"><div class="forge-tool-title">Smith’s tools</div><div class="forge-tool-desc">Metal weapons, heavy/medium armor, shields, metal ammo</div></div>
      <div class="forge-tool" role="listitem"><div class="forge-tool-title">Woodcarver’s tools</div><div class="forge-tool-desc">Bows/crossbows, wooden shafts, staves & wands (wood bodies)</div></div>
      <div class="forge-tool" role="listitem"><div class="forge-tool-title">Leatherworker’s tools</div><div class="forge-tool-desc">Light armor, belts, boots, sheaths, leather components</div></div>
      <div class="forge-tool" role="listitem"><div class="forge-tool-title">Weaver’s tools</div><div class="forge-tool-desc">Cloaks, robes, gloves, bags, cloth components</div></div>
      <div class="forge-tool" role="listitem"><div class="forge-tool-title">Alchemist’s supplies</div><div class="forge-tool-desc">Potions, oils, alchemical reagents</div></div>
      <div class="forge-tool" role="listitem"><div class="forge-tool-title">Herbalism kit</div><div class="forge-tool-desc">Potion of Healing, herbal infusions</div></div>
      <div class="forge-tool" role="listitem"><div class="forge-tool-title">Calligrapher’s supplies</div><div class="forge-tool-desc">Spell scrolls, arcane diagrams</div></div>
      <div class="forge-tool" role="listitem"><div class="forge-tool-title">Glassblower’s tools</div><div class="forge-tool-desc">Vials, lenses, crystal foci</div></div>
      <div class="forge-tool" role="listitem"><div class="forge-tool-title">Jeweler’s tools</div><div class="forge-tool-desc">Rings, amulets, gem settings, inlays</div></div>
      <div class="forge-tool" role="listitem"><div class="forge-tool-title">Tinker’s tools</div><div class="forge-tool-desc">Clockwork gizmos, small wondrous gadgets</div></div>
    </div>
  `;

  const genPanelHTML = `
    <aside class="forge-gen">
      <div class="forge-gen-title">Generate components</div>
      <div class="forge-gen-buttons" role="group" aria-label="Generate components by item rarity">
        <button class="forge-chip" data-gen="common"     type="button">Common Magic Item</button>
        <button class="forge-chip" data-gen="uncommon"   type="button">Uncommon Magic Item</button>
        <button class="forge-chip" data-gen="rare"       type="button">Rare Magic Item</button>
        <button class="forge-chip" data-gen="very_rare"  type="button">Very Rare Magic Item</button>
        <button class="forge-chip" data-gen="legendary"  type="button">Legendary Magic Item</button>
        <button class="forge-chip" data-gen="artifact"   type="button">Artifact Magic Item</button>
      </div>
      <output id="${ID.GEN_OUT}" class="forge-gen-out" aria-live="polite">—</output>
    </aside>
  `;

  // helpers
  const cap = (s) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const escapeHTML = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const matCard = (m) => `
    <div class="forge-tool" role="listitem">
      <div class="forge-tool-title">${m.name} (${cap(m.rarity)})</div>
      <div class="forge-tool-desc">${escapeHTML(m.desc)}</div>
    </div>
  `;
  const matGrid = (list) =>
    `<div class="forge-tools" role="list">${list.map(matCard).join("")}</div>`;

  // ---------- Sheets ----------
  const srdSheet = `
    <div class="forge">
      <section class="forge-section">
        <h3 class="forge-h">Requirements</h3>
        <ul class="forge-list">
          <li>Know the item’s formula/recipe</li>
          <li>Provide any required spells during each day of crafting</li>
          <li>Spend downtime and pay gold for materials</li>
          <li>Proficiency with appropriate tools</li>
        </ul>
        ${toolsHTML}
      </section>

      <hr class="hr">

      <section class="forge-section">
        <h3 class="forge-h">Progress</h3>
        <p class="forge-p">You complete <b>25 gp of value per day</b> of work (5 days = 1 workweek). Helpers can contribute if they meet requirements.</p>
      </section>

      <section class="forge-section">
        <h3 class="forge-h">Time & Cost by Rarity</h3>
        <table class="tb-table forge-table">
          <thead>
            <tr><th>Rarity</th><th>Workweeks</th><th>Cost (gp)</th></tr>
          </thead>
          <tbody>
            <tr><td>Common</td><td>1</td><td>50</td></tr>
            <tr><td>Uncommon</td><td>2</td><td>200</td></tr>
            <tr><td>Rare</td><td>10</td><td>2,000</td></tr>
            <tr><td>Very&nbsp;Rare</td><td>25</td><td>20,000</td></tr>
            <tr><td>Legendary</td><td>50</td><td>100,000</td></tr>
          </tbody>
        </table>
      </section>

      <section class="forge-section">
        <h3 class="forge-h">Spells</h3>
        <p class="forge-p">If the item lists spells, the crafter (or helper) must be able to provide them each crafting day. The DM may allow alternatives.</p>
      </section>

      <section class="forge-section">
        <h3 class="forge-h">DM Options</h3>
        <ul class="forge-list">
          <li>Exotic components tied to the item’s theme</li>
          <li>Assistance, facilities, or downtime adjustments</li>
          <li>Quest-gated formulas and discoveries</li>
        </ul>
      </section>
    </div>
  `;

  const xgteSheet = `
    <div class="forge">
      <section class="forge-section">
        <h3 class="forge-h">Requirements</h3>
        <ul class="forge-list">
          <li>Obtain a <b>formula</b> and a <b>special component</b> that suits the item</li>
          <li>Invest downtime; complications may arise on long projects</li>
          <li>Proficiency with appropriate tools</li>
        </ul>
        ${toolsHTML}
      </section>

      <hr class="hr">

      <section class="forge-grid-2">
        <div class="forge-section">
          <h3 class="forge-h">Special Components</h3>
          <p class="forge-p">DM ties an ingredient to the item (e.g., <em>dragon scale</em> for a dragonscale shield). This turns crafting into an adventure hook.</p>
        </div>
        ${genPanelHTML}
      </section>

      <section class="forge-section">
        <h3 class="forge-h">Typical Time & Cost</h3>
        <p class="forge-p">Use the standard rarity table unless your table uses a custom economy:</p>
        <table class="tb-table forge-table">
          <thead>
            <tr><th>Rarity</th><th>Workweeks</th><th>Cost (gp)</th></tr>
          </thead>
          <tbody>
            <tr><td>Common</td><td>1</td><td>50</td></tr>
            <tr><td>Uncommon</td><td>2</td><td>200</td></tr>
            <tr><td>Rare</td><td>10</td><td>2,000</td></tr>
            <tr><td>Very&nbsp;Rare</td><td>25</td><td>20,000</td></tr>
            <tr><td>Legendary</td><td>50</td><td>100,000</td></tr>
          </tbody>
        </table>
      </section>

      <section class="forge-section">
        <h3 class="forge-h">Notes</h3>
        <ul class="forge-list">
          <li>Formulas and components are great quest rewards</li>
          <li>Securing specialists/workshops can be story beats</li>
          <li>DM adjudicates helpers, facilities, and complications</li>
        </ul>
      </section>
    </div>
  `;

  const skazkaSheet = `
    <div class="forge">
      <section class="forge-section">
        <h3 class="forge-h">Requirements</h3>
        <ul class="forge-list">
          <li>Know a <b>formula</b> (taught) <em>or</em> <b>decipher</b> one <em>or</em> <b>disenchant</b> a similar item to learn it</li>
          <li>Pay incidentals (fuel, vials, crucibles): Common 20gp · Uncommon 100gp · Rare 200gp · Very rare 500gp · Legendary 1000gp · Artifact 10000gp</li>
          <li>Use a <b>special base material</b> suited to the item—ordinary matter can’t hold a permanent enchantment on Skazka. This does not apply to consumables e.g. potions & scrolls.</li>
          <li>Proficiency with appropriate tools</li>
        </ul>
        ${toolsHTML}
      </section>
      <section class="forge-section">
        <h3 class="forge-h">Formulae</h3>
        <ul class="forge-list">
          <li>Being taught a formula has no other requirements.</li>
          <li>Learning a formula through disenchantment requires nothing other than the unravelling of a magic item at a magical crucible. The process allows one enchanter to write their own formula based on their observations. These notes are personal to the enchanter and cannot be copied of sold.</li>
          <li>A formula that is purchased (or found) needs to be deciphered - this requires research for a number of days relative to the rarity of the formula (see "Time" chart below). The enchanter must also succeed an Arcana check or have to repeat the research.</li>
        </ul>
      </section>
      <section class="forge-section">
        <h3 class="forge-h">Time (uninterrupted)</h3>
        <table class="tb-table forge-table">
          <thead><tr><th>Rarity</th><th>Days</th></tr></thead>
          <tbody>
            <tr><td>Common</td><td>1</td></tr>
            <tr><td>Uncommon</td><td>2</td></tr>
            <tr><td>Rare</td><td>3</td></tr>
            <tr><td>Very&nbsp;Rare</td><td>4</td></tr>
            <tr><td>Legendary</td><td>5</td></tr>
            <tr><td>Artifact</td><td>7</td></tr>
          </tbody>
        </table>
        <div class="tb-help">Consumables ignore anchoring and craft normally; permanent items must anchor.</div>
      </section>

      <hr class="hr">

      <section class="forge-grid-2">
        <div class="forge-section">
          <h3 class="forge-h">Anchoring Check</h3>
          <p class="forge-p">At the end of the work, make one check: <b>d20 + relevant tool proficiency + Int/Wis/Cha</b>.</p>

          <!-- stacked outcomes (no columns) -->
          <p class="forge-p"><b>Success.</b> Permanent item (keeps base material’s innate qualities).</p>
          <p class="forge-p"><b>Near miss (≤2).</b> Unstable for 1d6 weeks; re-anchor in 1 day (no new components).</p>
          <p class="forge-p"><b>Fail.</b> Components spent; material may be marred or ruined.</p>

          <ul class="forge-list">
            <li><b>+3</b> base material matches theme/type; <b>–2</b> if ill-matched</li>
            <li><b>+1</b> per on-theme component (max +3)</li>
            <li><b>+2</b> taught/disenchanted formula; <b>+1</b> deciphered; <b>–2</b> stolen/fragmentary</li>
            <li><b>+1</b> dedicated sanctum; <b>–2</b> field conditions</li>
            <li><b>+1</b> per qualified assistant (max +2)</li>
          </ul>
        </div>

        ${genPanelHTML}
      </section>

      <section class="forge-section">
        <h3 class="forge-h">Base Materials</h3>
        <div class="tb-actions">
          <button id="${ID.MAT_TOGGLE}" class="tb-ghost-btn" aria-expanded="false" aria-controls="${ID.MAT_ALL}">Show all materials</button>
        </div>
        <div id="${ID.MAT_PREVIEW}"></div>
        <div id="${ID.MAT_ALL}" style="display:none"></div>
        <div class="tb-help">Choose a base material that fits the item’s theme to gain a resonance bonus on the Anchoring Check.</div>
      </section>
    </div>
  `;

  const SHEETS = { srd: srdSheet, xgte: xgteSheet, skazka: skazkaSheet };

  // ---------- Runtime ----------
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  ready(() => {
    const select = document.getElementById(ID.SOURCE);
    const sheetOut = document.getElementById(ID.SHEET);
    if (!select || !sheetOut) return;

    const render = () => {
      const key = (select.value || "srd").toLowerCase();
      sheetOut.innerHTML = SHEETS[key] || "—";
      postRenderHook(key);
    };

    select.addEventListener("change", render);
    render();

    // ---- Components generator ----
    let COMPONENTS_CACHE = null;

    async function loadComponents() {
      if (COMPONENTS_CACHE) return COMPONENTS_CACHE;
      try {
        const res = await fetch("data/components.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        COMPONENTS_CACHE = await res.json();
      } catch (err) {
        COMPONENTS_CACHE = [];
        console.error("Failed to load data/components.json:", err);
      }
      return COMPONENTS_CACHE;
    }

    function groupByRarity(list) {
      return list.reduce((acc, c) => {
        const r = String(c.rarity || "").toLowerCase();
        (acc[r] ||= []).push(c);
        return acc;
      }, {});
    }

    function pickUnique(arr, n) {
      if (n <= 0 || !arr.length) return [];
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a.slice(0, Math.min(n, a.length));
    }

    async function generateFor(key) {
      const rules = GEN_RULES[key];
      if (!rules) return;

      const all = await loadComponents();
      const out = document.getElementById(ID.GEN_OUT);

      if (!all.length) {
        if (out) out.textContent = "No components data found.";
        return;
      }

      const buckets = groupByRarity(all);
      const picks = [];

      for (const [rar, count] of Object.entries(rules)) {
        const pool = buckets[rar] || [];
        let chosen = pickUnique(pool, count);
        while (chosen.length < count && pool.length) {
          chosen = chosen.concat(pickUnique(pool, count - chosen.length));
        }
        picks.push(...chosen.slice(0, count));
      }

      if (out) {
        out.innerHTML = picks
          .map(
            (c) =>
              `<div class="forge-pill" title="${(c.rarity || "").replace(
                /_/g,
                " "
              )}">${escapeHTML(c.name)}</div>`
          )
          .join("");
      }
    }

    // Delegated click for generator chips
    document.addEventListener("click", (ev) => {
      const chip = ev.target.closest(".forge-chip");
      if (!chip) return;
      const key = chip.getAttribute("data-gen");
      if (key) generateFor(key);
    });

    // After each render, wire up materials preview/toggle if Skazka is active
    function postRenderHook(key) {
      if (key !== "skazka") return;
      const prev = document.getElementById(ID.MAT_PREVIEW);
      const all = document.getElementById(ID.MAT_ALL);
      const btn = document.getElementById(ID.MAT_TOGGLE);

      if (prev) prev.innerHTML = matGrid(BASE_MATERIALS.slice(0, 9)); // preview
      if (all) all.innerHTML = matGrid(BASE_MATERIALS); // full list (hidden)

      if (btn) {
        btn.onclick = () => {
          const isOpen = all.style.display !== "none";
          all.style.display = isOpen ? "none" : "";
          btn.setAttribute("aria-expanded", String(!isOpen));
          btn.textContent = isOpen
            ? "Show all materials"
            : "Hide all materials";
        };
      }
    }
  });
})();
