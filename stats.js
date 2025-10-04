// stats.js — v2 schema (no backward compatibility)
// Data shape: sessions[].char_stats[charId], sessions[].party_stats, summary_markdown
const DATA_URL = "./data/sessions.json";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) =>
     String(s ?? "").replace(
          /[&<>"']/g,
          (m) =>
               ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
               }[m])
     );

let SESSION_INDEX = new Map(); // id -> normalized searchable text
let SESSION_QUERY = ""; // current query (normalized)

/* normalize for search: lowercase + strip diacritics */
function norm(s) {
     return String(s || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
}

/* build a simple index per session */
function buildSessionSearchIndex(ctx) {
     SESSION_INDEX.clear();
     const { sessions, byId } = ctx;

     for (const s of sessions) {
          const parts = [];

          parts.push(s.id, s.title, (s.arc_tags || []).join(" "));

          // party names
          if (s.party) {
               parts.push(s.party.map((id) => byId[id]?.name || id).join(" "));
          }

          // narrative
          parts.push(s.summary_markdown);

          // inspiration reasons
          if (s.inspiration?.awarded) {
               parts.push(
                    s.inspiration.awarded.map((a) => a.reason || "").join(" ")
               );
          }
          if (s.inspiration?.used) {
               parts.push(
                    s.inspiration.used.map((u) => u.reason || "").join(" ")
               );
          }

          // join + normalize
          SESSION_INDEX.set(s.id, norm(parts.join(" \n ")));
     }
}

/* does session match query? */
function sessionMatches(s, q) {
     if (!q) return true;
     const idx = SESSION_INDEX.get(s.id) || "";
     return idx.includes(q);
}

/* highlight query in a small snippet (title/tags only) */
function hl(text, query) {
     const t = String(text || "");
     if (!query) return esc(t);
     const q = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex
     return esc(t).replace(
          new RegExp(`(${q})`, "ig"),
          '<mark class="hl">$1</mark>'
     );
}

const fmtInt = (n) => (n || 0).toLocaleString();
const fmtDate = (iso) =>
     iso
          ? new Date(iso).toLocaleDateString(undefined, {
                 year: "numeric",
                 month: "short",
                 day: "2-digit",
            })
          : "";
const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

function mdToHtml(md) {
     let t = String(md || "").replace(/\r\n?/g, "\n");

     // Images: ![alt](url)
     // Simple parser; supports local/absolute URLs
     t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => {
          const url = String(src).trim().replace(/"/g, "&quot;");
          const a = esc(alt);
          return `<figure class="md-img"><img src="${url}" alt="${a}" loading="lazy"><figcaption>${a}</figcaption></figure>`;
     });

     // Links: [text](url)
     t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, txt, href) => {
          const url = String(href).trim().replace(/"/g, "&quot;");
          return `<a href="${url}" target="_blank" rel="noopener">${esc(
               txt
          )}</a>`;
     });

     // Headings / inline styles
     t = t
          .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
          .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
          .replace(/^#\s+(.*)$/gm, "<h2>$1</h2>")
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/`(.+?)`/g, "<code>$1</code>");

     // Paragraphs: don’t wrap block elements (headings, figure, lists, blockquote, pre)
     const blockStart =
          /^(<h[1-3]>|<figure\b|<ul\b|<ol\b|<blockquote\b|<pre\b)/;
     t = t
          .split(/\n{2,}/)
          .map((b) =>
               blockStart.test(b) ? b : `<p>${b.replace(/\n/g, "<br>")}</p>`
          )
          .join("\n");

     return t;
}

async function loadData() {
     const res = await fetch(DATA_URL, { cache: "no-store" });
     if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
     return res.json();
}

// ---------- aggregation for v2 ----------
function aggregate(data) {
     const chars = data.characters || [];
     const sessions = data.sessions || [];
     const byId = Object.fromEntries(chars.map((c) => [c.id, c]));

     const agg = {
          sessionsCount: sessions.length,
          encountersCount: 0,
          opponentsDefeated: 0,
          coins: { pp: 0, gp: 0, sp: 0, cp: 0 },

          // splits & rates sources
          meleeHits: 0,
          meleeMisses: 0,
          spellHits: 0,
          spellMisses: 0,

          meleeDmg: 0,
          spellDmg: 0,
          aoeDmg: 0,

          damageDealt: 0, // all dmg combined
          damageTaken: 0,
          healingDelivered: 0,
          healingReceived: 0,

          crits: 0,
          fumbles: 0,
          biggestHit: null,
          biggestHeal: null,

          killingBlows: 0,
          deaths: 0,
          revivesDelivered: 0,
          revivesReceived: 0,
          skillChecks: 0,
          deathSavesFailed: 0,

          dmFacepalms: 0,

          perChar: {},
          inspiration: { partyAwarded: 0, partyUsed: 0, partyBanked: 0 },
     };

     // seed perChar (unchanged)
     for (const c of chars) {
          agg.perChar[c.id] = {
               id: c.id,
               name: c.name,

               melee_hits: 0,
               melee_misses: 0,
               spell_hits: 0,
               spell_misses: 0,

               crits: 0,
               fumbles: 0,

               total_melee_dmg: 0,
               total_spell_dmg: 0,
               total_aoe_dmg: 0,
               highest_dmg_dealt: 0,

               healing_received: 0,
               healing_delivered: 0,
               biggest_heal_delivered: 0,

               damage_taken: 0,

               inspiration_awarded: 0,
               inspiration_used: 0,
               bank: 0,

               dm_facepalms: 0,
               killing_blows: 0,
               deaths: 0,

               revives_received: 0,
               revives_delivered: 0,
               death_saves_failed: 0,
               healing_potions_used: 0,

               skill_checks_made: 0,
          };
     }

     for (const s of sessions) {
          // party-level
          const ps = s.party_stats || {};
          agg.encountersCount += ps.combat_encounters || 0;
          agg.opponentsDefeated += ps.opponents_defeated || 0;
          const coins = ps.coins || {};
          agg.coins.pp += coins.pp || 0;
          agg.coins.gp += coins.gp || 0;
          agg.coins.sp += coins.sp || 0;
          agg.coins.cp += coins.cp || 0;

          // chars
          const cs = s.char_stats || {};
          for (const [id, st] of Object.entries(cs)) {
               if (!agg.perChar[id]) {
                    // allow guests
                    agg.perChar[id] = JSON.parse(
                         JSON.stringify(agg.perChar[chars[0]?.id])
                    );
                    agg.perChar[id].id = id;
                    agg.perChar[id].name = byId[id]?.name || id;
                    for (const k of Object.keys(agg.perChar[id]))
                         if (typeof agg.perChar[id][k] === "number")
                              agg.perChar[id][k] = 0;
               }
               const ctot = agg.perChar[id];

               // per-char totals
               for (const k of [
                    "melee_hits",
                    "melee_misses",
                    "spell_hits",
                    "spell_misses",
                    "crits",
                    "fumbles",
                    "total_melee_dmg",
                    "total_spell_dmg",
                    "total_aoe_dmg",
                    "healing_received",
                    "healing_delivered",
                    "damage_taken",
                    "inspiration_awarded",
                    "inspiration_used",
                    "dm_facepalms",
                    "killing_blows",
                    "deaths",
                    "revives_received",
                    "revives_delivered",
                    "death_saves_failed",
                    "healing_potions_used",
                    "skill_checks_made",
               ])
                    ctot[k] += st[k] || 0;

               ctot.biggest_heal_delivered = Math.max(
                    ctot.biggest_heal_delivered || 0,
                    st.biggest_heal_delivered || 0
               );
               ctot.highest_dmg_dealt = Math.max(
                    ctot.highest_dmg_dealt || 0,
                    st.highest_dmg_dealt || 0
               );

               // inspiration bank
               ctot.bank +=
                    (st.inspiration_awarded || 0) - (st.inspiration_used || 0);
               agg.inspiration.partyAwarded += st.inspiration_awarded || 0;
               agg.inspiration.partyUsed += st.inspiration_used || 0;

               // campaign totals (new stuff)
               agg.meleeHits += st.melee_hits || 0;
               agg.meleeMisses += st.melee_misses || 0;
               agg.spellHits += st.spell_hits || 0;
               agg.spellMisses += st.spell_misses || 0;

               agg.meleeDmg += st.total_melee_dmg || 0;
               agg.spellDmg += st.total_spell_dmg || 0;
               agg.aoeDmg += st.total_aoe_dmg || 0;

               agg.damageDealt +=
                    (st.total_melee_dmg || 0) +
                    (st.total_spell_dmg || 0) +
                    (st.total_aoe_dmg || 0);
               agg.damageTaken += st.damage_taken || 0;
               agg.healingDelivered += st.healing_delivered || 0;
               agg.healingReceived += st.healing_received || 0;

               agg.crits += st.crits || 0;
               agg.fumbles += st.fumbles || 0;
               agg.dmFacepalms += st.dm_facepalms || 0;

               agg.killingBlows += st.killing_blows || 0;
               agg.deaths += st.deaths || 0;
               agg.revivesDelivered += st.revives_delivered || 0;
               agg.revivesReceived += st.revives_received || 0;
               agg.skillChecks += st.skill_checks_made || 0;
               agg.deathSavesFailed += st.death_saves_failed || 0;

               if (
                    !agg.biggestHit ||
                    (st.highest_dmg_dealt || 0) > agg.biggestHit.amount
               ) {
                    agg.biggestHit = {
                         amount: st.highest_dmg_dealt || 0,
                         actor: id,
                         sessionId: s.id,
                    };
               }
               if (
                    !agg.biggestHeal ||
                    (st.biggest_heal_delivered || 0) > agg.biggestHeal.amount
               ) {
                    agg.biggestHeal = {
                         amount: st.biggest_heal_delivered || 0,
                         actor: id,
                         sessionId: s.id,
                    };
               }
          }
     }

     agg.inspiration.partyBanked = Object.values(agg.perChar).reduce(
          (a, c) => a + (c.bank || 0),
          0
     );
     return { data, chars, sessions, byId, agg };
}

// ---------- UI renderers ----------
function renderKpis(mount, ctx) {
     const { agg, byId } = ctx;

     const coins = `PP ${fmtInt(agg.coins.pp)} • GP ${fmtInt(
          agg.coins.gp
     )} • SP ${fmtInt(agg.coins.sp)} • CP ${fmtInt(agg.coins.cp)}`;
     const bh = agg.biggestHit
          ? `${esc(
                 byId[agg.biggestHit.actor]?.name || agg.biggestHit.actor
            )} — ${fmtInt(agg.biggestHit.amount)} dmg`
          : "—";
     const bhe = agg.biggestHeal
          ? `${esc(
                 byId[agg.biggestHeal.actor]?.name || agg.biggestHeal.actor
            )} — ${fmtInt(agg.biggestHeal.amount)} HP`
          : "—";

     const meleeAtt = agg.meleeHits + agg.meleeMisses;
     const spellAtt = agg.spellHits + agg.spellMisses;
     const meleeRate = meleeAtt
          ? Math.round((agg.meleeHits / meleeAtt) * 100)
          : 0;
     const spellRate = spellAtt
          ? Math.round((agg.spellHits / spellAtt) * 100)
          : 0;

     mount.innerHTML = `
    <div class="kpi-grid">
      <!-- meta & party -->
      <div class="kpi-card"><div class="kpi-label">Sessions</div><div class="kpi-value">${fmtInt(
           agg.sessionsCount
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Encounters</div><div class="kpi-value">${fmtInt(
           agg.encountersCount
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Opponents Defeated</div><div class="kpi-value">${fmtInt(
           agg.opponentsDefeated
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Coins</div><div class="kpi-value small">${coins}</div></div>

      <!-- damage & healing -->
      <div class="kpi-card"><div class="kpi-label">Party Damage Dealt</div><div class="kpi-value">${fmtInt(
           agg.damageDealt
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Party Damage Taken</div><div class="kpi-value">${fmtInt(
           agg.damageTaken
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Healing Delivered</div><div class="kpi-value">${fmtInt(
           agg.healingDelivered
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Healing Received</div><div class="kpi-value">${fmtInt(
           agg.healingReceived
      )}</div></div>

      <!-- splits -->
      <div class="kpi-card"><div class="kpi-label">Melee DMG</div><div class="kpi-value">${fmtInt(
           agg.meleeDmg
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Spell DMG</div><div class="kpi-value">${fmtInt(
           agg.spellDmg
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">AOE DMG</div><div class="kpi-value">${fmtInt(
           agg.aoeDmg
      )}</div></div>

      <!-- accuracy -->
      <div class="kpi-card"><div class="kpi-label">Melee Hit Rate</div><div class="kpi-value">${fmtInt(
           meleeRate
      )}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Spell Hit Rate</div><div class="kpi-value">${fmtInt(
           spellRate
      )}%</div></div>

      <!-- spikes -->
      <div class="kpi-card"><div class="kpi-label">Biggest Hit</div><div class="kpi-value">${bh}</div></div>
      <div class="kpi-card"><div class="kpi-label">Biggest Heal</div><div class="kpi-value">${bhe}</div></div>

      <!-- misc totals -->
      <div class="kpi-card"><div class="kpi-label">Crits</div><div class="kpi-value">${fmtInt(
           agg.crits
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Fumbles</div><div class="kpi-value">${fmtInt(
           agg.fumbles
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Killing Blows</div><div class="kpi-value">${fmtInt(
           agg.killingBlows
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Deaths</div><div class="kpi-value">${fmtInt(
           agg.deaths
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Revives Given</div><div class="kpi-value">${fmtInt(
           agg.revivesDelivered
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Revives Received</div><div class="kpi-value">${fmtInt(
           agg.revivesReceived
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Skill Checks</div><div class="kpi-value">${fmtInt(
           agg.skillChecks
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Death Saves Failed</div><div class="kpi-value">${fmtInt(
           agg.deathSavesFailed
      )}</div></div>

      <!-- inspiration -->
      <div class="kpi-card"><div class="kpi-label">Party Insp Awarded</div><div class="kpi-value">${fmtInt(
           agg.inspiration.partyAwarded
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Party Insp Used</div><div class="kpi-value">${fmtInt(
           agg.inspiration.partyUsed
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Party Insp Banked</div><div class="kpi-value">${fmtInt(
           agg.inspiration.partyBanked
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">DM Facepalms</div><div class="kpi-value">${fmtInt(
           agg.dmFacepalms
      )}</div></div>
    </div>
  `;
}

function leaderboardRows(perChar, byId, getVal) {
     return Object.values(perChar)
          .map((c) => ({
               id: c.id,
               name: byId[c.id]?.name || c.id,
               val: getVal(c) || 0,
          }))
          .sort((a, b) => b.val - a.val)
          .slice(0, 5)
          .map(
               (r) =>
                    `<tr><td>${esc(
                         r.name
                    )}</td><td style="text-align:right">${fmtInt(
                         r.val
                    )}</td></tr>`
          )
          .join("");
}

function renderLeaderboards(mount, ctx) {
     const { agg, byId } = ctx;
     const per = Object.values(agg.perChar || {});
     const MIN_ATTEMPTS = 5;

     const pct = (h, m) => {
          const a = (h || 0) + (m || 0);
          return a ? Math.round((h / a) * 100) : 0;
     };

     function top5(
          arr,
          getVal,
          { filter = () => true, fmt = (v) => fmtInt(v), pad = 5 } = {}
     ) {
          const rows = arr
               .filter(filter)
               .map((c) => ({
                    name: byId[c.id]?.name || c.id,
                    val: getVal(c) || 0,
               }))
               .sort((a, b) => b.val - a.val)
               .slice(0, pad);

          const html = rows.map(
               (r) =>
                    `<tr><td>${esc(r.name)}</td><td class="num">${fmt(
                         r.val
                    )}</td></tr>`
          );

          while (html.length < pad) {
               html.push(
                    `<tr class="empty"><td>—</td><td class="num">—</td></tr>`
               );
          }
          return html.join("");
     }

     const sections = [
          {
               title: `Melee Hit Rate (≥${MIN_ATTEMPTS})`,
               getVal: (c) => pct(c.melee_hits, c.melee_misses),
               opts: {
                    filter: (c) =>
                         c.melee_hits + c.melee_misses >= MIN_ATTEMPTS,
                    fmt: (v) => `${fmtInt(v)}%`,
               },
          },
          {
               title: `Spell Hit Rate (≥${MIN_ATTEMPTS})`,
               getVal: (c) => pct(c.spell_hits, c.spell_misses),
               opts: {
                    filter: (c) =>
                         c.spell_hits + c.spell_misses >= MIN_ATTEMPTS,
                    fmt: (v) => `${fmtInt(v)}%`,
               },
          },
          { title: "Crits", getVal: (c) => c.crits, opts: {} },
          { title: "Fumbles", getVal: (c) => c.fumbles, opts: {} },
          {
               title: "Highest DMG Dealt",
               getVal: (c) => c.highest_dmg_dealt,
               opts: {},
          },
          {
               title: "Biggest Heal Delivered",
               getVal: (c) => c.biggest_heal_delivered,
               opts: {},
          },
          {
               title: "Inspiration Awarded",
               getVal: (c) => c.inspiration_awarded,
               opts: {},
          },
          {
               title: "Death Saves Failed",
               getVal: (c) => c.death_saves_failed,
               opts: {},
          },
     ];

     mount.innerHTML = `
    <div class="leaderboards tb-grid">
      ${sections
           .map(
                (sec) => `
        <div class="lb">
          <h3>${esc(sec.title)}</h3>
          <table class="tb-table"><tbody>
            ${top5(per, sec.getVal, sec.opts)}
          </tbody></table>
        </div>
      `
           )
           .join("")}
    </div>
  `;
}

let CURRENT_SESSION = null;

// left list (unchanged)
function renderSessionList(listMount, ctx, onSelect, query = "") {
     const { sessions } = ctx;
     const q = norm(query);
     const filtered = sessions.filter((s) => sessionMatches(s, q));

     listMount.innerHTML = `
    <ul class="sl-items">
      ${
           filtered
                .map((s) => {
                     const title = hl(s.title || s.id, query);
                     const date = fmtDate(s.date);
                     const tags = (s.arc_tags || [])
                          .map(
                               (t) => `<span class="tag">${hl(t, query)}</span>`
                          )
                          .join(" ");
                     return `
            <li class="sl-item" data-sid="${esc(s.id)}">
              <div class="sl-top">
                <strong>${title}</strong>
                <span class="sl-date">${date}</span>
              </div>
              <div class="sl-tags">${tags}</div>
            </li>`;
                })
                .join("") ||
           `<li class="sl-item"><div class="sl-top"><strong>No matches</strong><span class="sl-date"></span></div></li>`
      }
    </ul>
  `;
     fixSessionListViewport(listMount);

     $$(".sl-item", listMount).forEach((li) => {
          const sid = li.getAttribute("data-sid");
          if (!sid) return;
          li.addEventListener("click", () => {
               $$(".sl-item.active", listMount).forEach((n) =>
                    n.classList.remove("active")
               );
               li.classList.add("active");
               const s = ctx.sessions.find((x) => x.id === sid);
               CURRENT_SESSION = s || null;
               onSelect(CURRENT_SESSION);
               updateExportButtons();
          });
     });

     // auto-select: keep current if still visible, else first match
     if (filtered.length) {
          const keep = filtered.find(
               (s) => CURRENT_SESSION && s.id === CURRENT_SESSION.id
          );
          const pickId = keep ? keep.id : filtered[0].id;
          const li = listMount.querySelector(
               `.sl-item[data-sid="${CSS.escape(pickId)}"]`
          );
          if (li) li.click();
     } else {
          CURRENT_SESSION = null;
          updateExportButtons();
     }
}

// your helper from earlier (max-height cap for ~10 rows)
const SESSIONS_VIEW_ROWS = 10;
function fixSessionListViewport(listMount) {
     listMount.style.minHeight = "0";
     const ul = listMount.querySelector(".sl-items");
     const first = ul?.querySelector(".sl-item");
     if (!ul || !first) return;
     requestAnimationFrame(() => {
          const itemH = first.getBoundingClientRect().height || 0;
          const cs = getComputedStyle(ul);
          const gap = parseFloat(cs.rowGap || cs.gap || "0") || 0;
          const h = Math.round(
               SESSIONS_VIEW_ROWS * itemH + (SESSIONS_VIEW_ROWS - 1) * gap
          );
          ul.style.setProperty("--sl-max-h", `${h}px`);
     });
}

// per-session mini KPIs
function perSessionKpisHTML(s, ctx) {
     const vals = Object.values(s.char_stats || {});
     const ps = s.party_stats || {};
     const c = ps.coins || {};

     // totals from chars
     const meleeHits = vals.reduce((a, v) => a + (v.melee_hits || 0), 0);
     const meleeMisses = vals.reduce((a, v) => a + (v.melee_misses || 0), 0);
     const spellHits = vals.reduce((a, v) => a + (v.spell_hits || 0), 0);
     const spellMisses = vals.reduce((a, v) => a + (v.spell_misses || 0), 0);

     const meleeAtt = meleeHits + meleeMisses;
     const spellAtt = spellHits + spellMisses;
     const meleeRate = meleeAtt ? Math.round((meleeHits / meleeAtt) * 100) : 0;
     const spellRate = spellAtt ? Math.round((spellHits / spellAtt) * 100) : 0;

     const meleeDmg = vals.reduce((a, v) => a + (v.total_melee_dmg || 0), 0);
     const spellDmg = vals.reduce((a, v) => a + (v.total_spell_dmg || 0), 0);
     const aoeDmg = vals.reduce((a, v) => a + (v.total_aoe_dmg || 0), 0);

     const dmgDealt = meleeDmg + spellDmg + aoeDmg;
     const dmgTaken = vals.reduce((a, v) => a + (v.damage_taken || 0), 0);
     const healGiven = vals.reduce((a, v) => a + (v.healing_delivered || 0), 0);
     const healRecv = vals.reduce((a, v) => a + (v.healing_received || 0), 0);

     const crits = vals.reduce((a, v) => a + (v.crits || 0), 0);
     const fumbles = vals.reduce((a, v) => a + (v.fumbles || 0), 0);
     const bestHit = Math.max(0, ...vals.map((v) => v.highest_dmg_dealt || 0));
     const bestHeal = Math.max(
          0,
          ...vals.map((v) => v.biggest_heal_delivered || 0)
     );

     const inspA = vals.reduce((a, v) => a + (v.inspiration_awarded || 0), 0);
     const inspU = vals.reduce((a, v) => a + (v.inspiration_used || 0), 0);
     const inspBank = inspA - inspU;
     const facepalms = vals.reduce((a, v) => a + (v.dm_facepalms || 0), 0);

     const kb = vals.reduce((a, v) => a + (v.killing_blows || 0), 0);
     const deaths = vals.reduce((a, v) => a + (v.deaths || 0), 0);
     const rGiven = vals.reduce((a, v) => a + (v.revives_delivered || 0), 0);
     const rRecv = vals.reduce((a, v) => a + (v.revives_received || 0), 0);
     const skills = vals.reduce((a, v) => a + (v.skill_checks_made || 0), 0);
     const dsf = vals.reduce((a, v) => a + (v.death_saves_failed || 0), 0);

     const coinsLine = `PP ${fmtInt(c.pp || 0)} • GP ${fmtInt(
          c.gp || 0
     )} • SP ${fmtInt(c.sp || 0)} • CP ${fmtInt(c.cp || 0)}`;

     return `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Encounters</div><div class="kpi-value">${fmtInt(
           ps.combat_encounters || 0
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Opponents Defeated</div><div class="kpi-value">${fmtInt(
           ps.opponents_defeated || 0
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Coins</div><div class="kpi-value small">${coinsLine}</div></div>

      <div class="kpi-card"><div class="kpi-label">Party Damage Dealt</div><div class="kpi-value">${fmtInt(
           dmgDealt
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Party Damage Taken</div><div class="kpi-value">${fmtInt(
           dmgTaken
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Healing Delivered</div><div class="kpi-value">${fmtInt(
           healGiven
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Healing Received</div><div class="kpi-value">${fmtInt(
           healRecv
      )}</div></div>

      <div class="kpi-card"><div class="kpi-label">Melee DMG</div><div class="kpi-value">${fmtInt(
           meleeDmg
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Spell DMG</div><div class="kpi-value">${fmtInt(
           spellDmg
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">AOE DMG</div><div class="kpi-value">${fmtInt(
           aoeDmg
      )}</div></div>

      <div class="kpi-card"><div class="kpi-label">Melee Hit Rate</div><div class="kpi-value">${fmtInt(
           meleeRate
      )}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Spell Hit Rate</div><div class="kpi-value">${fmtInt(
           spellRate
      )}%</div></div>

      <div class="kpi-card"><div class="kpi-label">PC Crits</div><div class="kpi-value">${fmtInt(
           crits
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">PC Fumbles</div><div class="kpi-value">${fmtInt(
           fumbles
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Biggest Hit</div><div class="kpi-value">${
           bestHit ? fmtInt(bestHit) : "—"
      }</div></div>
      <div class="kpi-card"><div class="kpi-label">Biggest Heal</div><div class="kpi-value">${
           bestHeal ? fmtInt(bestHeal) : "—"
      }</div></div>

      <div class="kpi-card"><div class="kpi-label">Party Insp Awarded</div><div class="kpi-value">${fmtInt(
           inspA
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Party Insp Used</div><div class="kpi-value">${fmtInt(
           inspU
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Party Insp Banked</div><div class="kpi-value">${fmtInt(
           inspBank
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">DM Facepalms</div><div class="kpi-value">${fmtInt(
           facepalms
      )}</div></div>

      <div class="kpi-card"><div class="kpi-label">Killing Blows</div><div class="kpi-value">${fmtInt(
           kb
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Deaths</div><div class="kpi-value">${fmtInt(
           deaths
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Revives Given</div><div class="kpi-value">${fmtInt(
           rGiven
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Revives Received</div><div class="kpi-value">${fmtInt(
           rRecv
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Skill Checks</div><div class="kpi-value">${fmtInt(
           skills
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Death Saves Failed</div><div class="kpi-value">${fmtInt(
           dsf
      )}</div></div>
    </div>
  `;
}

function coinsLine(ps) {
     const c = ps?.coins || {};
     return `PP ${fmtInt(c.pp || 0)} • GP ${fmtInt(c.gp || 0)} • SP ${fmtInt(
          c.sp || 0
     )} • CP ${fmtInt(c.cp || 0)}`;
}

function renderSessionDetail(centerMount, s, ctx) {
     const { byId } = ctx;

     // helpers over per-char stats
     const cstats = s.char_stats || {};
     const entries = Object.entries(cstats);
     const sum = (k) => entries.reduce((a, [, c]) => a + Number(c[k] || 0), 0);
     const maxWithActor = (k) => {
          let amount = 0,
               actor = null;
          for (const [id, c] of entries) {
               const v = Number(c[k] || 0);
               if (v > amount) {
                    amount = v;
                    actor = id;
               }
          }
          return { amount, actor };
     };

     // KPIs (session)
     const pcDamage =
          sum("total_melee_dmg") +
          sum("total_spell_dmg") +
          sum("total_aoe_dmg");
     const pcHealingDelivered = sum("healing_delivered");
     const pcCrits = sum("crits");
     const pcFumbles = sum("fumbles");
     const bestHit = maxWithActor("highest_dmg_dealt");
     const biggestHeal = maxWithActor("biggest_heal_delivered");
     const bestHitStr = bestHit.amount
          ? `${esc(byId[bestHit.actor]?.name || bestHit.actor)} — ${fmtInt(
                 bestHit.amount
            )} dmg`
          : "—";
     const biggestHealStr = biggestHeal.amount
          ? `${esc(
                 byId[biggestHeal.actor]?.name || biggestHeal.actor
            )} — ${fmtInt(biggestHeal.amount)} HP`
          : "—";

     // party + coins
     const ps = s.party_stats || {};
     const coins = ps.coins || {};
     const coinRowsHTML = [
          ["pp", coins.pp],
          ["gp", coins.gp],
          ["sp", coins.sp],
          ["cp", coins.cp],
     ]
          .map(
               ([u, n], i) => `
      <tr>
        <td class="tb-kv-key">${i === 0 ? "Coins" : ""}</td>
        <td>${n && n !== 0 ? fmtInt(n) : "—"} ${u}</td>
      </tr>
    `
          )
          .join("");
     // If you'd rather HIDE rows with 0, change the line above to:
     // .filter(([_,n]) => n !== 0).map(...).join("");

     const partyNames = (s.party || [])
          .map((id) => esc(byId[id]?.name || id))
          .join(", ");

     // inspiration (no bullets)
     const insp = s.inspiration || {};
     const inspAwarded =
          (insp.awarded || [])
               .map(
                    (a) =>
                         `<div><strong>${esc(
                              byId[a.to]?.name || a.to
                         )}</strong> — ${esc(a.reason || "")}</div>`
               )
               .join("") || `<div class="muted">None</div>`;
     const inspUsed =
          (insp.used || [])
               .map(
                    (u) =>
                         `<div><strong>${esc(
                              byId[u.by]?.name || u.by
                         )}</strong> — ${esc(u.reason || "")}</div>`
               )
               .join("") || `<div class="muted">None</div>`;

     centerMount.innerHTML = `
    <section class="session-header">
      <h2>${esc(s.title || s.id)}</h2>
      <div class="session-meta">
        <span class="pill">${fmtDate(s.date)}</span>
        <span class="pill">${
             s.milestone_awarded ? "Milestone Awarded" : "No Milestone"
        }</span>
        <span class="pill">Party: ${partyNames || "—"}</span>
      </div>

      <div class="kpi-grid kpi-mini">
        <div class="kpi-card"><div class="kpi-label">PC Damage</div><div class="kpi-value">${fmtInt(
             pcDamage
        )}</div></div>
        <div class="kpi-card"><div class="kpi-label">Healing Delivered</div><div class="kpi-value">${fmtInt(
             pcHealingDelivered
        )}</div></div>
        <div class="kpi-card"><div class="kpi-label">PC Crits</div><div class="kpi-value">${fmtInt(
             pcCrits
        )}</div></div>
        <div class="kpi-card"><div class="kpi-label">PC Fumbles</div><div class="kpi-value">${fmtInt(
             pcFumbles
        )}</div></div>
        <div class="kpi-card"><div class="kpi-label">Best Hit</div><div class="kpi-value">${bestHitStr}</div></div>
        <div class="kpi-card"><div class="kpi-label">Biggest Heal</div><div class="kpi-value">${biggestHealStr}</div></div>
      </div>
    </section>

    <div class="tb-grid">
      <section class="tb-panel">
        <h3>Party (this session)</h3>
        <table class="tb-table" style="width:auto">
          <tbody>
            <tr><td class="tb-kv-key">Combat Encounters</td><td class="num">${fmtInt(
                 ps.combat_encounters || 0
            )}</td></tr>
            <tr><td class="tb-kv-key">Opponents Defeated</td><td class="num">${fmtInt(
                 ps.opponents_defeated || 0
            )}</td></tr>
            ${coinRowsHTML}  <!-- <- THIS is where that snippet lives -->
          </tbody>
        </table>
      </section>

      <section class="tb-panel inspiration-session">
        <h3>Inspiration (this session)</h3>
        <div><h5>Awarded</h5><div class="insp-list">${inspAwarded}</div></div>
        <div style="margin-top:10px"><h5>Used</h5><div class="insp-list">${inspUsed}</div></div>
      </section>
    </div>

    <section class="summary">
      <h3>Session Report</h3>
      <div class="markdown">${mdToHtml(s.summary_markdown || "")}</div>
    </section>
  `;
}

function renderCharactersRight(mount, ctx) {
     const rows = Object.values(ctx.agg.perChar)
          .map((c) => {
               const meleeAtt = c.melee_hits + c.melee_misses;
               const spellAtt = c.spell_hits + c.spell_misses;
               const meleeRate = meleeAtt
                    ? Math.round((c.melee_hits / meleeAtt) * 100)
                    : 0;
               const spellRate = spellAtt
                    ? Math.round((c.spell_hits / spellAtt) * 100)
                    : 0;

               const dmgTotal =
                    (c.total_melee_dmg || 0) +
                    (c.total_spell_dmg || 0) +
                    (c.total_aoe_dmg || 0);

               return `
      <div class="char-card">
        <div class="tb-kv">
          <div class="tb-kv-row">
            <div class="tb-kv-key"><strong>${esc(
                 c.name
            )}</strong></div><div class="tb-kv-val"></div>
          </div>

          <!-- Attacks & Rates -->
          <div class="tb-kv-row"><div class="tb-kv-key">Melee</div><div class="tb-kv-val">${fmtInt(
               c.melee_hits
          )} hits · ${fmtInt(c.melee_misses)} misses</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Spell</div><div class="tb-kv-val">${fmtInt(
               c.spell_hits
          )} hits · ${fmtInt(c.spell_misses)} misses</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Hit Rate</div><div class="tb-kv-val nowrap">
            <span>M&nbsp;${fmtInt(
                 meleeRate
            )}%</span><span class="sep">·</span><span>S&nbsp;${fmtInt(
                    spellRate
               )}%</span>
          </div></div>

          <!-- Damage -->
          <div class="tb-kv-row"><div class="tb-kv-key">Damage</div><div class="tb-kv-val">${fmtInt(
               dmgTotal
          )}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key small muted">— Melee / Spell / AOE</div>
            <div class="tb-kv-val small muted">${fmtInt(
                 c.total_melee_dmg
            )} / ${fmtInt(c.total_spell_dmg)} / ${fmtInt(c.total_aoe_dmg)}</div>
          </div>
          <div class="tb-kv-row"><div class="tb-kv-key">Highest Hit</div><div class="tb-kv-val">${fmtInt(
               c.highest_dmg_dealt
          )}</div></div>

          <!-- Healing -->
          <div class="tb-kv-row"><div class="tb-kv-key">Healing</div><div class="tb-kv-val">Given ${fmtInt(
               c.healing_delivered
          )} · Got ${fmtInt(c.healing_received)}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Biggest Heal</div><div class="tb-kv-val">${fmtInt(
               c.biggest_heal_delivered
          )}</div></div>

          <!-- Durability -->
          <div class="tb-kv-row"><div class="tb-kv-key">Damage Taken</div><div class="tb-kv-val">${fmtInt(
               c.damage_taken
          )}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Deaths</div><div class="tb-kv-val">${fmtInt(
               c.deaths
          )}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Death Saves Failed</div><div class="tb-kv-val">${fmtInt(
               c.death_saves_failed
          )}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Healing Potions Used</div><div class="tb-kv-val">${fmtInt(
               c.healing_potions_used
          )}</div></div>

          <!-- Revives -->
          <div class="tb-kv-row"><div class="tb-kv-key">Revives</div><div class="tb-kv-val">Given ${fmtInt(
               c.revives_delivered
          )} · Got ${fmtInt(c.revives_received)}</div></div>

          <!-- Inspiration -->
          <div class="tb-kv-row"><div class="tb-kv-key">Inspiration</div><div class="tb-kv-val">A ${fmtInt(
               c.inspiration_awarded
          )} · U ${fmtInt(c.inspiration_used)} · Bank ${fmtInt(
                    c.bank
               )}</div></div>

          <!-- Misc -->
          <div class="tb-kv-row"><div class="tb-kv-key">Crits · Fumbles</div><div class="tb-kv-val">${fmtInt(
               c.crits
          )} · ${fmtInt(c.fumbles)}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Killing Blows</div><div class="tb-kv-val">${fmtInt(
               c.killing_blows
          )}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Skill Checks</div><div class="tb-kv-val">${fmtInt(
               c.skill_checks_made
          )}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">DM Facepalms</div><div class="tb-kv-val">${fmtInt(
               c.dm_facepalms
          )}</div></div>
        </div>
      </div>
    `;
          })
          .join("");

     mount.innerHTML = rows || "<p>No characters.</p>";
}

// ---------- Exports ----------
function download(filename, data, type = "application/json") {
     const blob = new Blob([data], { type });
     const url = URL.createObjectURL(blob);
     const a = document.createElement("a");
     a.href = url;
     a.download = filename;
     document.body.appendChild(a);
     a.click();
     a.remove();
     URL.revokeObjectURL(url);
}

function exportSelectedSession() {
     if (!CURRENT_SESSION) return;
     download(
          `${CURRENT_SESSION.id}.json`,
          JSON.stringify(CURRENT_SESSION, null, 2),
          "application/json"
     );
}

function exportTotalsJSON(ctx) {
     const { data, agg, byId } = ctx;
     const out = {
          campaign: data.campaign || "Campaign",
          version: 2,
          generated_at: new Date().toISOString(),
          sessions_count: agg.sessionsCount,
          encounters_count: agg.encountersCount,
          opponents_defeated: agg.opponentsDefeated,
          coins: agg.coins,
          totals: {
               damage_dealt: agg.damageDealt,
               damage_taken: agg.damageTaken,
               healing_delivered: agg.healingDelivered,
               crits: agg.crits,
               fumbles: agg.fumbles,
               dm_facepalms: agg.dmFacepalms,
          },
          records: {
               biggest_hit: agg.biggestHit
                    ? {
                           amount: agg.biggestHit.amount,
                           actorId: agg.biggestHit.actor,
                           actorName:
                                byId[agg.biggestHit.actor]?.name ||
                                agg.biggestHit.actor,
                           sessionId: agg.biggestHit.sessionId,
                      }
                    : null,
               biggest_heal: agg.biggestHeal
                    ? {
                           amount: agg.biggestHeal.amount,
                           actorId: agg.biggestHeal.actor,
                           actorName:
                                byId[agg.biggestHeal.actor]?.name ||
                                agg.biggestHeal.actor,
                           sessionId: agg.biggestHeal.sessionId,
                      }
                    : null,
          },
          inspiration: {
               party_awarded: agg.inspiration.partyAwarded,
               party_used: agg.inspiration.partyUsed,
               party_banked: agg.inspiration.partyBanked,
          },
          per_character: Object.values(agg.perChar).map((c) => {
               const meleeAtt = c.melee_hits + c.melee_misses;
               const spellAtt = c.spell_hits + c.spell_misses;
               return {
                    id: c.id,
                    name: byId[c.id]?.name || c.id,
                    melee_hits: c.melee_hits,
                    melee_misses: c.melee_misses,
                    spell_hits: c.spell_hits,
                    spell_misses: c.spell_misses,
                    melee_hit_rate: meleeAtt
                         ? Math.round((c.melee_hits / meleeAtt) * 100)
                         : 0,
                    spell_hit_rate: spellAtt
                         ? Math.round((c.spell_hits / spellAtt) * 100)
                         : 0,
                    total_melee_dmg: c.total_melee_dmg,
                    total_spell_dmg: c.total_spell_dmg,
                    total_aoe_dmg: c.total_aoe_dmg,
                    highest_dmg_dealt: c.highest_dmg_dealt,
                    healing_received: c.healing_received,
                    healing_delivered: c.healing_delivered,
                    biggest_heal_delivered: c.biggest_heal_delivered,
                    damage_taken: c.damage_taken,
                    crits: c.crits,
                    fumbles: c.fumbles,
                    inspiration_awarded: c.inspiration_awarded,
                    inspiration_used: c.inspiration_used,
                    inspiration_bank: c.bank,
                    dm_facepalms: c.dm_facepalms,
                    killing_blows: c.killing_blows,
                    deaths: c.deaths,
                    revives_received: c.revives_received,
                    revives_delivered: c.revives_delivered,
                    death_saves_failed: c.death_saves_failed,
                    healing_potions_used: c.healing_potions_used,
                    skill_checks_made: c.skill_checks_made,
               };
          }),
     };
     download("totals.json", JSON.stringify(out, null, 2), "application/json");
}

function exportPerCharacterCSV(ctx) {
     const { agg, byId } = ctx;
     const header = [
          "Character",
          "MeleeHits",
          "MeleeMisses",
          "MeleeHitRate%",
          "SpellHits",
          "SpellMisses",
          "SpellHitRate%",
          "Crits",
          "Fumbles",
          "TotalMeleeDMG",
          "TotalSpellDMG",
          "TotalAOEDMG",
          "HighestDMGDealt",
          "HealingReceived",
          "HealingDelivered",
          "BiggestHealDelivered",
          "DamageTaken",
          "InspAwarded",
          "InspUsed",
          "InspBank",
          "DMFacepalms",
          "KillingBlows",
          "Deaths",
          "RevivesRecvd",
          "RevivesDelvd",
          "DeathSavesFailed",
          "HealingPotionsUsed",
          "SkillChecksMade",
     ];
     const rows = [header];
     for (const c of Object.values(agg.perChar)) {
          const name = byId[c.id]?.name || c.id;
          const meleeAtt = c.melee_hits + c.melee_misses;
          const spellAtt = c.spell_hits + c.spell_misses;
          const meleeRate = meleeAtt
               ? Math.round((c.melee_hits / meleeAtt) * 100)
               : 0;
          const spellRate = spellAtt
               ? Math.round((c.spell_hits / spellAtt) * 100)
               : 0;

          rows.push([
               name,
               c.melee_hits,
               c.melee_misses,
               meleeRate,
               c.spell_hits,
               c.spell_misses,
               spellRate,
               c.crits,
               c.fumbles,
               c.total_melee_dmg,
               c.total_spell_dmg,
               c.total_aoe_dmg,
               c.highest_dmg_dealt,
               c.healing_received,
               c.healing_delivered,
               c.biggest_heal_delivered,
               c.damage_taken,
               c.inspiration_awarded,
               c.inspiration_used,
               c.bank,
               c.dm_facepalms,
               c.killing_blows,
               c.deaths,
               c.revives_received,
               c.revives_delivered,
               c.death_saves_failed,
               c.healing_potions_used,
               c.skill_checks_made,
          ]);
     }
     const csv = rows
          .map((r) =>
               r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")
          )
          .join("\n");
     download("per-character.csv", csv, "text/csv");
}

function updateExportButtons() {
     const btn = $("#btnExportSession");
     if (btn) btn.disabled = !CURRENT_SESSION;
}

function renderAll(rootKpis, rootLB, rootDetail, listMount, rightMount, ctx) {
     renderKpis(rootKpis, ctx);
     renderLeaderboards(rootLB, ctx);
     renderSessionList(listMount, ctx, (session) => {
          renderSessionDetail(rootDetail, session, ctx);
     });
     renderCharactersRight(rightMount, ctx);

     // ensure the session list viewport gets a fixed height with scroll
     fixSessionListViewport(listMount);
}

// ---------- init ----------
async function init() {
     const statsMount = document.getElementById("stats-detail");
     if (!statsMount) return; // self-gating

     const listMount = document.getElementById("stats-session-list");
     const rightMount = document.getElementById("stats-characters");
     const kpisMount = document.getElementById("stats-kpis");
     const lbMount = document.getElementById("stats-leaderboards");

     try {
          const data = await loadData();
          const ctx = aggregate(data);

          // exports
          $("#btnExportSession")?.addEventListener("click", () =>
               exportSelectedSession()
          );
          $("#btnExportTotalsJSON")?.addEventListener("click", () =>
               exportTotalsJSON(ctx)
          );
          $("#btnExportPerCharCSV")?.addEventListener("click", () =>
               exportPerCharacterCSV(ctx)
          );
          updateExportButtons();

          // build search index once
          buildSessionSearchIndex(ctx);

          // initial render
          renderAll(kpisMount, lbMount, statsMount, listMount, rightMount, ctx);

          // hook the search input
          const searchEl = document.getElementById("sessionSearch");
          if (searchEl) {
               searchEl.addEventListener("input", (e) => {
                    const raw = e.target.value || "";
                    SESSION_QUERY = norm(raw);
                    renderSessionList(
                         listMount,
                         ctx,
                         (session) => {
                              renderSessionDetail(statsMount, session, ctx);
                         },
                         raw
                    );
               });

               // if the box already has text (e.g., browser restore), trigger filter
               if (searchEl.value) {
                    searchEl.dispatchEvent(new Event("input"));
               }
          }
     } catch (e) {
          console.error(e);
          statsMount.innerHTML = `<p>Failed to load stats. Ensure <code>${esc(
               DATA_URL
          )}</code> exists and is valid JSON.</p>`;
     }
}

if (document.readyState === "loading") {
     document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
     init();
}
