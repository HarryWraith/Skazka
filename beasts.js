/* ========================================================================
   beasts.js — Skazka Bestiary (tarot grid, Foundry text + Copy button)
   - Cards: click anywhere to flip and select (others flip to front)
   - Details: formatted for Foundry VTT statblock importers
   - Copy button uses your site's button classes (see BTN_* below)
   ======================================================================== */
(function () {
     const $ = (s, r = document) => r.querySelector(s);
     const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
     const esc = (s) =>
          String(s ?? "").replace(
               /[&<>"]/g,
               (c) =>
                    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[
                         c
                    ])
          );

     /* ---------- Configure your site button classes here ---------- */
     const BTN_CLASSES = "stat-btn";
     const BTN_SUCCESS_CLASSES = "is-success btn-success tb-btn--success";

     /* ---------- Mounts (fail fast if layout missing) ---------- */
     const intro = $("#intro-mount");
     const center = $("#bestiary-center");
     const right = $("#bestiary-right");
     if (!intro || !center || !right) {
          return;
     }

     const STATE = { data: [], selected: null };

     const getImg = (b) =>
          b.img ?? b.image ?? (b.images && b.images.card) ?? null;
     const getAlt = (b) => b.alt ?? b.name;
     const typeKeyOf = (t) =>
          String(t || "")
               .toLowerCase()
               .split(/[ ,;/]/)[0];

     // Type -> accent colour
     const TYPE_COLORS = {
          monstrosity: "#D4AF37",
          undead: "#C0C0C0",
          beast: "#7DA75D",
          fey: "#76D1A5",
          construct: "#7AA7FF",
          aberration: "#9D7CFF",
          plant: "#6BBF6B",
          dragon: "#F5A623",
          fiend: "#C83D3D",
          celestial: "#E6D37A",
          elemental: "#4FC3E7",
          giant: "#B67C52",
          humanoid: "#8FA3AD",
          ooze: "#A5D33A",
     };

     function renderIntro() {
          intro.innerHTML = `
      <header class="tb-panel">
        <h1 class="skz-viking">SKAZKA BEASTIARY</h1>
        <p>Click a card to flip for quick stats. The last card you touch appears in the details column.</p>
      </header>`;
     }

     const quickSpeed = (s) => {
          if (!s) return "";
          const p = [];
          if (s.walk != null) p.push(`${s.walk} ft.`);
          if (s.fly != null)
               p.push(`fly ${s.fly} ft.${s.hover ? " (hover)" : ""}`);
          if (s.swim != null) p.push(`swim ${s.swim} ft.`);
          if (s.burrow != null) p.push(`burrow ${s.burrow} ft.`);
          return p.join(", ");
     };

     function cardHTML(b) {
          const tags = `
      <span class="bc-tag">${esc(b.size ?? "")}</span>
      <span class="bc-tag">${esc(b.type ?? "")}</span>
      <span class="bc-tag">CR ${esc(b.cr ?? "")}</span>
    `;

          const img = getImg(b);
          const alt = esc(getAlt(b));
          const imgHTML = img
               ? `<img class="bc-img" src="${esc(
                      img
                 )}" alt="${alt}" loading="lazy">`
               : `<div class="bc-img" aria-hidden="true">${esc(
                      (b.name || "?").charAt(0).toUpperCase()
                 )}</div>`;

          const hp = b.hp
               ? `${b.hp.avg ?? ""}${
                      b.hp.formula ? ` (${esc(b.hp.formula)})` : ""
                 }`
               : "";
          const ac = b.ac ?? "";
          const statTags = `
      ${
           ac
                ? `<span class="stat-tag stat-tag--ac"><b>AC</b> ${esc(
                       ac
                  )}</span>`
                : ""
      }
      ${
           hp
                ? `<span class="stat-tag stat-tag--hp"><b>HP</b> ${esc(
                       hp
                  )}</span>`
                : ""
      }
      ${
           b.speed
                ? `<span class="stat-tag stat-tag--speed"><b>Speed</b> ${esc(
                       quickSpeed(b.speed)
                  )}</span>`
                : ""
      }
    `;

          // Optional short description strip (no label)
          const desc = b.description
               ? `<p class="bc-desc" data-badge-skip="true">${esc(
                      b.description
                 )}</p>`
               : "";

          const typeKey = typeKeyOf(b.type);
          const accent = TYPE_COLORS[typeKey] || "var(--accent, #08c5ff)";

          return `
      <article class="beast-card tl-item type-${esc(typeKey)}"
               style="--card-accent: ${accent};"
               data-role="event"
               data-name="${esc(b.name)}" data-type="${esc(
               b.type
          )}" data-cr="${esc(b.cr)}"
               tabindex="0" role="button" aria-pressed="false" aria-label="${esc(
                    b.name
               )}">
        <div class="bc-rotor">
          <!-- FRONT -->
          <div class="bc-face bc-front">
            ${imgHTML}
            <div class="bc-nameplate" title="${esc(b.name)}">${esc(
               b.name
          )}</div>
          </div>

          <!-- BACK (flex column expected in CSS; .bc-quick is spacer) -->
          <div class="bc-face bc-back" data-badge-skip="true">
            <header>
              <div class="bc-title">${esc(b.name)}</div>
              <div class="bc-tags">${tags}</div>
            </header>
            ${desc}
            <div class="bc-quick"></div>
            <div class="bc-stats">${statTags}</div>
          </div>
        </div>
      </article>`;
     }

     function renderCenter(beasts) {
          const list = beasts.map(cardHTML).join("");
          center.innerHTML = `
      <section class="tb-panel" id="beastList">
        <h3 class="tb-title">Creatures <small id="beastCount">(${beasts.length})</small></h3>
        <div id="beastCards" class="beast-cards">${list}</div>
      </section>`;
     }

     const joinKV = (o) =>
          Object.entries(o || {})
               .map(([k, v]) => `${k}: ${v}`)
               .join(", ");

     /* ---------- Foundry VTT plain-text builder ---------- */
     function abilityMod(n) {
          const m = Math.floor((Number(n || 10) - 10) / 2);
          return m >= 0 ? `+${m}` : `${m}`;
     }
     function sensesLine(s) {
          if (!s) return "";
          const parts = [];
          for (const [k, v] of Object.entries(s)) {
               if (k === "passive") {
                    parts.push(`passive Perception ${v}`);
               } else {
                    parts.push(`${k} ${v} ft.`);
               }
          }
          return parts.join(", ");
     }
     function listJoin(arr) {
          return (arr || []).join(", ");
     }
     function kvLine(o) {
          return joinKV(o);
     }

     function abilityBlock(a) {
          const A = a || {};
          const cols = ["str", "dex", "con", "int", "wis", "cha"];
          const header = cols.map((x) => x.toUpperCase()).join("  ");
          const body = cols
               .map((k) => {
                    const score = Number(A[k] ?? 10);
                    const mod = abilityMod(score);
                    return `${score} (${mod})`;
               })
               .join("  ");
          return `${header}\n${body}`;
     }

     function buildFoundryText(b) {
          const name = b.name || "Creature";
          const size = b.size || "Medium";
          const type = b.type || "creature";
          const align = b.alignment || "unaligned";
          const ac = b.ac != null ? String(b.ac) : "—";
          const hpavg = b.hp?.avg != null ? String(b.hp.avg) : "—";
          const hpform = b.hp?.formula ? ` (${b.hp.formula})` : "";
          const speed = quickSpeed(b.speed);

          const saves = b.saving_throws ? kvLine(b.saving_throws) : "";
          const skills = b.skills ? kvLine(b.skills) : "";

          const dmgRes = listJoin(b.damage_resistances);
          const dmgImm = listJoin(b.damage_immunities);
          const condImm = listJoin(b.condition_immunities);
          const senses = sensesLine(b.senses);
          const langs = (b.languages || []).join(", ");
          const pb = b.proficiency ?? Math.ceil(1 + Number(b.cr || 0) / 4);

          const lines = [];
          lines.push(name);
          lines.push(`${size} ${type}, ${align}`);
          lines.push(`Armor Class ${ac}`);
          lines.push(`Hit Points ${hpavg}${hpform}`);
          if (speed) lines.push(`Speed ${speed}`);
          lines.push("");
          lines.push(abilityBlock(b.abilities));
          if (saves) lines.push(`Saving Throws ${saves}`);
          if (skills) lines.push(`Skills ${skills}`);
          if (dmgRes) lines.push(`Damage Resistances ${dmgRes}`);
          if (dmgImm) lines.push(`Damage Immunities ${dmgImm}`);
          if (condImm) lines.push(`Condition Immunities ${condImm}`);
          if (senses) lines.push(`Senses ${senses}`);
          if (langs) lines.push(`Languages ${langs}`);
          lines.push(`Challenge ${b.cr != null ? b.cr : "—"} (PB +${pb})`);

          const section = (title, list) => {
               if (!list || !list.length) return;
               lines.push("");
               lines.push(title);
               for (const t of list) {
                    const n = t.name ? `${t.name}.` : "";
                    const d = t.desc || "";
                    lines.push(`${n} ${d}`.trim());
               }
          };
          section("Traits", b.traits);
          section("Actions", b.actions);
          section("Reactions", b.reactions);
          section("Legendary Actions", b.legendary_actions);

          if (b.lore) {
               lines.push("");
               lines.push(b.lore);
          }
          return lines.join("\n");
     }

     /* ---------- Details panel (Foundry-friendly) ---------- */
     function renderDetail(b) {
          if (!b) {
               right.innerHTML = `
        <article class="tb-panel">
          <h3 class="tb-title">Details</h3>
          <p>Select a card to view details.</p>
        </article>`;
               return;
          }

          const senses = b.senses
               ? Object.entries(b.senses)
                      .map(([k, v]) =>
                           k === "passive"
                                ? `passive Perception ${v}`
                                : `${k} ${v} ft.`
                      )
                      .join(", ")
               : "";
          const dmgRes = (b.damage_resistances || []).join(", ");
          const dmgImm = (b.damage_immunities || []).join(", ");
          const condImm = (b.condition_immunities || []).join(", ");
          const langs = (b.languages || []).join(", ");
          const pb = b.proficiency ?? Math.ceil(1 + Number(b.cr || 0) / 4);

          right.innerHTML = `
      <article class="tb-panel tb-statblock">
        <h2 class="skz-viking">${esc(b.name)}</h2>
        ${
             b.aka?.length
                  ? `<p class="tb-sub">${esc(b.aka.join(" • "))}</p>`
                  : ""
        }
        ${b.description ? `<p class="tb-lore">${esc(b.description)}</p>` : ""}
        <p><em>${esc(b.size)} ${esc(b.type)}, ${esc(
               b.alignment || "—"
          )}</em></p>

        <div class="tb-row"><span class="tb-k">Armor Class</span><span class="tb-v">${esc(
             b.ac ?? "—"
        )}</span></div>
        <div class="tb-row"><span class="tb-k">Hit Points</span><span class="tb-v">${
             b.hp?.avg ?? "—"
        }${b.hp?.formula ? ` (${esc(b.hp.formula)})` : ""}</span></div>
        ${
             b.speed
                  ? `<div class="tb-row"><span class="tb-k">Speed</span><span class="tb-v">${esc(
                         quickSpeed(b.speed)
                    )}</span></div>`
                  : ""
        }

        <div class="tb-ability-line">
          ${["str", "dex", "con", "int", "wis", "cha"]
               .map((k) => {
                    const n = b.abilities?.[k] ?? 10;
                    const m = Math.floor((n - 10) / 2);
                    return `<span>${k.toUpperCase()} ${n} (${
                         m >= 0 ? "+" : ""
                    }${m})</span>`;
               })
               .join("")}
        </div>

        ${
             b.saving_throws
                  ? `<div class="tb-row"><span class="tb-k">Saving Throws</span><span class="tb-v">${esc(
                         joinKV(b.saving_throws)
                    )}</span></div>`
                  : ""
        }
        ${
             b.skills
                  ? `<div class="tb-row"><span class="tb-k">Skills</span><span class="tb-v">${esc(
                         joinKV(b.skills)
                    )}</span></div>`
                  : ""
        }
        ${
             dmgRes
                  ? `<div class="tb-row"><span class="tb-k">Damage Resist.</span><span class="tb-v">${esc(
                         dmgRes
                    )}</span></div>`
                  : ""
        }
        ${
             dmgImm
                  ? `<div class="tb-row"><span class="tb-k">Damage Immunities</span><span class="tb-v">${esc(
                         dmgImm
                    )}</span></div>`
                  : ""
        }
        ${
             condImm
                  ? `<div class="tb-row"><span class="tb-k">Condition Immunities</span><span class="tb-v">${esc(
                         condImm
                    )}</span></div>`
                  : ""
        }
        ${
             senses
                  ? `<div class="tb-row"><span class="tb-k">Senses</span><span class="tb-v">${esc(
                         senses
                    )}</span></div>`
                  : ""
        }
        ${
             langs
                  ? `<div class="tb-row"><span class="tb-k">Languages</span><span class="tb-v">${esc(
                         langs
                    )}</span></div>`
                  : ""
        }

        <div class="tb-row"><span class="tb-k">Challenge</span><span class="tb-v">CR ${esc(
             b.cr
        )} (PB +${pb})</span></div>

        ${
             b.traits?.length
                  ? `<div class="tb-block traits">${b.traits
                         .map(
                              (t) =>
                                   `<div class="tb-line"><strong>${esc(
                                        t.name
                                   )}</strong>. ${esc(t.desc)}</div>`
                         )
                         .join("")}</div>`
                  : ""
        }
        ${
             b.actions?.length
                  ? `<div class="tb-block actions">${b.actions
                         .map(
                              (t) =>
                                   `<div class="tb-line"><strong>${esc(
                                        t.name
                                   )}</strong>. ${esc(t.desc)}</div>`
                         )
                         .join("")}</div>`
                  : ""
        }
        ${
             b.reactions?.length
                  ? `<div class="tb-block reactions">${b.reactions
                         .map(
                              (t) =>
                                   `<div class="tb-line"><strong>${esc(
                                        t.name
                                   )}</strong>. ${esc(t.desc)}</div>`
                         )
                         .join("")}</div>`
                  : ""
        }
        ${
             b.legendary_actions?.length
                  ? `<div class="tb-block legendaries">${b.legendary_actions
                         .map(
                              (t) =>
                                   `<div class="tb-line"><strong>${esc(
                                        t.name
                                   )}</strong>. ${esc(t.desc)}</div>`
                         )
                         .join("")}</div>`
                  : ""
        }

        <hr>
        <div class="tb-actions">
          <button id="copyFoundry" class="${BTN_CLASSES}" type="button">
            Copy for Foundry
          </button>
          <span id="copyStatus" class="tb-note" aria-live="polite"></span>
        </div>
      </article>`;

          // Wire the copy button
          const btn = $("#copyFoundry");
          const note = $("#copyStatus");
          if (btn) {
               const plain = buildFoundryText(b);
               btn.addEventListener("click", async () => {
                    try {
                         if (navigator.clipboard && window.isSecureContext) {
                              await navigator.clipboard.writeText(plain);
                         } else {
                              const ta = document.createElement("textarea");
                              ta.value = plain;
                              ta.style.position = "fixed";
                              ta.style.opacity = "0";
                              document.body.appendChild(ta);
                              ta.select();
                              document.execCommand("copy");
                              document.body.removeChild(ta);
                         }
                         // success feedback using your success classes
                         btn.classList.add(...BTN_SUCCESS_CLASSES.split(" "));
                         btn.textContent = "Copied ✓";
                         if (note) note.textContent = "";
                         setTimeout(() => {
                              btn.classList.remove(
                                   ...BTN_SUCCESS_CLASSES.split(" ")
                              );
                              btn.textContent = "Copy for Foundry";
                         }, 1400);
                    } catch (e) {
                         if (note) {
                              note.textContent = "Copy failed";
                              setTimeout(() => (note.textContent = ""), 1500);
                         }
                    }
               });
          }
     }

     /* ---------- Interaction ---------- */
     function selectCard(card) {
          const name = card.getAttribute("data-name");
          STATE.selected = STATE.data.find((x) => x.name === name) || null;
          renderDetail(STATE.selected);
          $$(".beast-card[aria-selected='true']").forEach((el) =>
               el.setAttribute("aria-selected", "false")
          );
          card.setAttribute("aria-selected", "true");
     }
     function flipAllExcept(card) {
          $$(".beast-card").forEach((el) => {
               if (el !== card) {
                    el.classList.remove("is-flipped");
                    el.setAttribute("aria-pressed", "false");
               }
          });
     }
     function toggleCard(card) {
          const willFlip = !card.classList.contains("is-flipped");
          flipAllExcept(card);
          card.classList.toggle("is-flipped", willFlip);
          card.setAttribute("aria-pressed", willFlip ? "true" : "false");
     }
     function bindEvents() {
          const wrap = $("#beastCards");
          if (!wrap) return;

          wrap.addEventListener("click", (e) => {
               const card = e.target.closest(".beast-card");
               if (!card) return;
               selectCard(card);
               toggleCard(card);
          });

          wrap.addEventListener("keydown", (e) => {
               const card = e.target.closest(".beast-card");
               if (!card) return;
               if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    selectCard(card);
                    toggleCard(card);
               }
          });

          // Broken image → letter tile
          wrap.querySelectorAll("img.bc-img").forEach((img) => {
               const parent = img.closest(".beast-card");
               const letter = (parent?.getAttribute("data-name") || "?")
                    .charAt(0)
                    .toUpperCase();
               img.addEventListener(
                    "error",
                    () => {
                         const ph = document.createElement("div");
                         ph.className = "bc-img";
                         ph.textContent = letter;
                         img.replaceWith(ph);
                    },
                    { once: true }
               );
          });
     }

     /* ---------- Data & boot ---------- */
     async function loadData() {
          const url = "./data/beasts.json";
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok)
               throw new Error(
                    `Failed to load ${url}: ${res.status} ${res.statusText}`
               );
          const json = await res.json();
          return json.beasts || [];
     }

     (async function boot() {
          renderIntro();
          STATE.data = await loadData();
          renderCenter(STATE.data);
          renderDetail(null);
          bindEvents();

          // Re-apply search if input already has text (timeline-search-addon)
          try {
               const q = $("#tl-q");
               if (q && q.value)
                    q.dispatchEvent(new Event("input", { bubbles: true }));
          } catch {}
     })();
})();
