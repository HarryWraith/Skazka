// playerprofile.js
// Loads ./data/characters.json and renders the Player Profile page.
// Self-gating: safe to import globally from main.js.

const DATA_URL = "./data/characters.json";

(function () {
     const root = document.getElementById("playerProfile");
     if (!root) return;

     const TABLIST = document.getElementById("charTabs");
     const LS_KEY = "skz.activeCharacter";
     const html = String.raw;
     const esc = (s = "") =>
          String(s)
               .replaceAll("&", "&amp;")
               .replaceAll("<", "&lt;")
               .replaceAll(">", "&gt;")
               .replaceAll('"', "&quot;")
               .replaceAll("'", "&#39;");

     // ────────────────────────────────────────────────────────────
     // Data
     async function loadCharacters() {
          const res = await fetch(DATA_URL, { cache: "no-store" });
          if (!res.ok)
               throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
          const data = await res.json();
          if (!data?.characters?.length)
               throw new Error("No characters found.");
          return data.characters;
     }

     // ────────────────────────────────────────────────────────────
     // Helpers
     function initials(name = "") {
          return name
               .trim()
               .split(/\s+/)
               .slice(0, 2)
               .map((w) => w[0])
               .join("")
               .toUpperCase();
     }

     // Character tabs (icon → avatar → initials)
     function renderCharTabs(chars, activeId) {
          TABLIST.innerHTML = chars
               .map((c) => {
                    const isIcon = !!c.icon?.src;
                    const src =
                         c.icon?.src || c.avatar?.src || c.portrait?.src || "";
                    const alt =
                         c.icon?.alt ||
                         c.avatar?.alt ||
                         c.portrait?.alt ||
                         c.name;
                    const visual = src
                         ? `<img class="char-tab-avatar${
                                isIcon ? " icon" : ""
                           }" src="${esc(src)}" alt="${esc(alt)}">`
                         : `<span class="char-tab-avatar char-tab-initials" aria-hidden="true">${esc(
                                initials(c.name)
                           )}</span>`;

                    return `
          <button class="char-tab${c.id === activeId ? " is-active" : ""}"
                  role="tab"
                  aria-selected="${c.id === activeId}"
                  data-id="${esc(c.id)}">
            ${visual}
            <span class="char-tab-name">${esc(c.name)}</span>
          </button>
        `;
               })
               .join("");
     }

     function kpi(label, value) {
          return html`<div class="kpi-card">
               <div class="kpi-label">${esc(label)}</div>
               <div class="kpi-value">${esc(value)}</div>
          </div>`;
     }

     // ────────────────────────────────────────────────────────────
     // Main render
     function renderMain(c) {
          const main = root.querySelector(".profile-main");

          // Header with KPIs; mini stat panes directly below (HP/AC/Speed/Init)
          const header = html`
               <header class="page-hero">
                    <h1 class="skz-viking">${esc(c.name)}</h1>
                    <p class="sub">
                         ${esc(c.title || `${c.class} • Level ${c.level}`)}
                    </p>
                    <div class="kpi-grid kpi-mini" role="list">
                         ${kpi("Level", c.level)} ${kpi("Class", c.class)}
                         ${kpi("Ancestry", c.ancestry)}
                         ${kpi("Background", c.background)}
                    </div>
               </header>

               <div class="pp-stats-row">
                    <div class="pp-stat">
                         <div class="label">HP</div>
                         <div class="value">${esc(c.stats?.hp ?? "—")}</div>
                    </div>
                    <div class="pp-stat">
                         <div class="label">AC</div>
                         <div class="value">${esc(c.stats?.ac ?? "—")}</div>
                    </div>
                    <div class="pp-stat">
                         <div class="label">Speed</div>
                         <div class="value">${esc(c.stats?.speed ?? "—")}</div>
                    </div>
                    <div class="pp-stat">
                         <div class="label">Init</div>
                         <div class="value">${esc(c.stats?.init ?? "—")}</div>
                    </div>
               </div>
          `;

          // Tabs: Bio, Backstory, Chronicles, Inventory (no Gallery)
          const tabs = html`
               <nav
                    class="pp-tabs"
                    role="tablist"
                    aria-label="Character Sections"
               >
                    <button
                         class="pp-tab is-active"
                         data-tab="bio"
                         id="sec-bio"
                         role="tab"
                         aria-controls="tab-bio"
                         aria-selected="true"
                    >
                         Bio
                    </button>
                    <button
                         class="pp-tab"
                         data-tab="backstory"
                         id="sec-backstory"
                         role="tab"
                         aria-controls="tab-backstory"
                         aria-selected="false"
                    >
                         Backstory
                    </button>
                    <button
                         class="pp-tab"
                         data-tab="chronicle"
                         id="sec-chronicle"
                         role="tab"
                         aria-controls="tab-chronicle"
                         aria-selected="false"
                    >
                         Chronicles
                    </button>
                    <button
                         class="pp-tab"
                         data-tab="inventory"
                         id="sec-inventory"
                         role="tab"
                         aria-controls="tab-inventory"
                         aria-selected="false"
                    >
                         Inventory
                    </button>
               </nav>
          `;

          // Panels
          const bioPanel = html`
               <article
                    id="tab-bio"
                    class="pp-panel is-active"
                    role="tabpanel"
                    aria-labelledby="sec-bio"
               >
                    <h2 class="tb-title skz-title">Identity</h2>
                    <div class="pp-bio-grid">
                         <div>
                              <ul class="skz-ol">
                                   ${c.player
                                        ? `<li><strong>Player:</strong>&nbsp; ${esc(
                                               c.player
                                          )}</li>`
                                        : ""}
                                   ${c.bio?.aliases?.length
                                        ? `<li><strong>Aliases:</strong>&nbsp; ${esc(
                                               c.bio.aliases.join(", ")
                                          )}</li>`
                                        : ""}
                                   ${c.bio?.origin
                                        ? `<li><strong>Origin:</strong>&nbsp; ${esc(
                                               c.bio.origin
                                          )}</li>`
                                        : ""}
                                   ${c.alignment
                                        ? `<li><strong>Alignment:</strong>&nbsp; ${esc(
                                               c.alignment
                                          )}</li>`
                                        : ""}
                              </ul>

                              ${c.bio?.personality ||
                              c.bio?.ideals ||
                              c.bio?.bonds ||
                              c.bio?.flaws
                                   ? `<h3 class="tb-title skz-title">Personality</h3>`
                                   : ""}
                              ${c.bio?.personality
                                   ? `<p>${esc(c.bio.personality)}</p>`
                                   : ""}

                              <div class="insp-row">
                                   ${c.bio?.ideals
                                        ? `<span class="pill">Ideal: ${esc(
                                               c.bio.ideals
                                          )}</span>`
                                        : ""}
                                   ${c.bio?.bonds
                                        ? `<span class="pill">Bond: ${esc(
                                               c.bio.bonds
                                          )}</span>`
                                        : ""}
                                   ${c.bio?.flaws
                                        ? `<span class="pill">Flaw: ${esc(
                                               c.bio.flaws
                                          )}</span>`
                                        : ""}
                              </div>
                         </div>
                    </div>
               </article>
          `;

          const backstoryPanel = html`
               <article
                    id="tab-backstory"
                    class="pp-panel"
                    role="tabpanel"
                    aria-labelledby="sec-backstory"
               >
                    ${c.backstory
                         ? `<h2 class="tb-title skz-title">Before the Journey</h2><p>${esc(
                                c.backstory
                           )}</p>`
                         : `<p class="muted">No backstory yet.</p>`}
               </article>
          `;

          const chroniclePanel = html`
               <article
                    id="tab-chronicle"
                    class="pp-panel"
                    role="tabpanel"
                    aria-labelledby="sec-chronicle"
               >
                    <h2 class="tb-title skz-title">Campaign Chronicles</h2>
                    ${Array.isArray(c.chronicle) && c.chronicle.length
                         ? `
          <section class="timeline" id="tl-${esc(c.id)}">
            <h1>${esc(c.name)}’s Path</h1>
            ${c.chronicle
                 .map((ev) => {
                      const iconSrc = ev.icon?.src || ev.rune || "";
                      const iconAlt = ev.icon?.alt || "event icon";
                      return `
                  <div class="event">
                    <button class="event-header" type="button" aria-expanded="false">
                      <span class="event-year">${esc(ev.date)}</span>
                      <span class="event-title">${esc(ev.title)}</span>
                      ${
                           iconSrc
                                ? `<img class="rune" src="${esc(
                                       iconSrc
                                  )}" alt="${esc(iconAlt)}">`
                                : ""
                      }
                    </button>
                    <div class="event-details"><p>${esc(ev.details)}</p></div>
                  </div>
                `;
                 })
                 .join("")}
          </section>`
                         : `<p class="muted">No events recorded (yet).</p>`}
               </article>
          `;

          const inventoryPanel = html`
               <article
                    id="tab-inventory"
                    class="pp-panel"
                    role="tabpanel"
                    aria-labelledby="sec-inventory"
               >
                    <h2 class="tb-title skz-title">Inventory</h2>
                    <ul class="skz-ol">
                         ${c.inventory?.items?.length
                              ? `<li><strong>Items:</strong> ${esc(
                                     c.inventory.items.join(", ")
                                )}</li>`
                              : ""}
                         ${c.inventory?.spellbook?.length
                              ? `<li><strong>Spellbook:</strong> ${esc(
                                     c.inventory.spellbook.join(", ")
                                )}</li>`
                              : ""}
                    </ul>
               </article>
          `;

          main.innerHTML =
               header +
               tabs +
               `<section class="pp-panels">${bioPanel}${backstoryPanel}${chroniclePanel}${inventoryPanel}</section>`;

          // Wire section tabs
          const tabBtns = Array.from(main.querySelectorAll(".pp-tab"));
          const panels = Array.from(main.querySelectorAll(".pp-panel"));
          const activate = (name) => {
               tabBtns.forEach((b) => {
                    const on = b.dataset.tab === name;
                    b.classList.toggle("is-active", on);
                    b.setAttribute("aria-selected", String(on));
               });
               panels.forEach((p) =>
                    p.classList.toggle("is-active", p.id === `tab-${name}`)
               );
          };
          tabBtns.forEach((btn) => {
               btn.addEventListener("click", () => activate(btn.dataset.tab));
               btn.addEventListener("keydown", (e) => {
                    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
                    const i = tabBtns.indexOf(btn);
                    const n =
                         e.key === "ArrowRight"
                              ? (i + 1) % tabBtns.length
                              : (i - 1 + tabBtns.length) % tabBtns.length;
                    tabBtns[n].focus();
                    activate(tabBtns[n].dataset.tab);
               });
          });

          // Timeline expanders
          main.querySelectorAll(".event-header").forEach((h) => {
               h.addEventListener("click", () => {
                    const ev = h.closest(".event");
                    const open = ev.classList.toggle("open");
                    h.setAttribute("aria-expanded", String(open));
               });
          });
     }

     // Sidebar: portrait only
     function renderSide(c) {
          const side = root.querySelector(".profile-side");
          side.innerHTML = `
      <article class="article-small">
        ${
             c.portrait?.src
                  ? `<img src="${esc(c.portrait.src)}" alt="${esc(
                         c.portrait.alt || c.name
                    )}">`
                  : ""
        }
      </article>
    `;
     }

     function wireCharSwitch(chars) {
          TABLIST.querySelectorAll(".char-tab").forEach((btn) => {
               btn.addEventListener("click", () => {
                    const id = btn.getAttribute("data-id");
                    localStorage.setItem(LS_KEY, id);
                    selectCharacter(chars, id);
               });
          });
     }

     function selectCharacter(chars, id) {
          const c = chars.find((x) => x.id === id) || chars[0];
          TABLIST.querySelectorAll(".char-tab").forEach((b) => {
               const on = b.getAttribute("data-id") === c.id;
               b.classList.toggle("is-active", on);
               b.setAttribute("aria-selected", String(on));
          });
          renderMain(c);
          renderSide(c);
     }

     // ────────────────────────────────────────────────────────────
     // Bootstrap
     (async function init() {
          try {
               const chars = await loadCharacters();
               const active = localStorage.getItem(LS_KEY) || chars[0].id;
               renderCharTabs(chars, active);
               wireCharSwitch(chars);
               selectCharacter(chars, active);
          } catch (err) {
               console.error(err);
               TABLIST.innerHTML = `<div class="error">Failed to load characters.</div>`;
          }
     })();
})();
