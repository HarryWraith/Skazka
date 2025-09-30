// stats.js — stats page module (self-gating)
const DATA_URL = "./data/sessions.json";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
const fmtInt = (n) => (n || 0).toLocaleString();
const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
    : "";

// ---------- markdown (tiny)
function mdToHtml(md) {
  let t = String(md || "").replace(/\r\n?/g, "\n");
  t = t
    .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  t = t
    .split(/\n{2,}/)
    .map((b) =>
      /^<h[1-3]>/.test(b) ? b : `<p>${b.replace(/\n/g, "<br>")}</p>`
    )
    .join("\n");
  return t;
}

async function loadData() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
  return res.json();
}

// ---------- aggregate
function aggregate(data) {
  const chars = data.characters || [];
  const sessions = data.sessions || [];
  const byId = Object.fromEntries(chars.map((c) => [c.id, c]));
  const isPC = (id) => !!byId[id];

  const agg = {
    sessionsCount: sessions.length,
    encountersCount: 0,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    crits: 0,
    fumbles: 0,
    biggestHit: null,
    biggestHeal: null,
    perChar: {},
    inspiration: { partyAwarded: 0, partySpent: 0, partyBanked: 0 },
  };

  for (const c of chars) {
    agg.perChar[c.id] = {
      id: c.id,
      name: c.name,
      damage: 0,
      healing: 0,
      crits: 0,
      fumbles: 0,
      attackCount: 0,
      hitCount: 0,
      inspiration: { awarded: 0, spent: 0, bank: 0 },
    };
  }

  for (const s of sessions) {
    agg.encountersCount += (s.encounters || []).length;

    for (const a of s.inspiration?.awarded || []) {
      if (agg.perChar[a.to]) {
        agg.perChar[a.to].inspiration.awarded++;
        agg.perChar[a.to].inspiration.bank++;
        agg.inspiration.partyAwarded++;
        agg.inspiration.partyBanked++;
      }
    }
    for (const sp of s.inspiration?.spent || []) {
      if (agg.perChar[sp.by]) {
        agg.perChar[sp.by].inspiration.spent++;
        agg.perChar[sp.by].inspiration.bank = Math.max(
          0,
          agg.perChar[sp.by].inspiration.bank - 1
        );
        agg.inspiration.partySpent++;
        agg.inspiration.partyBanked = Math.max(
          0,
          agg.inspiration.partyBanked - 1
        );
      }
    }

    for (const e of s.events || []) {
      const dmg = e.damage?.total || 0;
      const heal = e.healing || 0;
      const actorIsPC = isPC(e.actor);
      const targetIsPC = isPC(e.target);

      if (dmg > 0 && actorIsPC) {
        agg.damageDealt += dmg;
        agg.perChar[e.actor].damage += dmg;
        if (!agg.biggestHit || dmg > agg.biggestHit.amount) {
          agg.biggestHit = {
            amount: dmg,
            actor: e.actor,
            sessionId: s.id,
            when: e.t || null,
          };
        }
      }
      if (dmg > 0) {
        if (e.type === "damage-taken" && targetIsPC) agg.damageTaken += dmg;
        else if (!actorIsPC && targetIsPC) agg.damageTaken += dmg;
      }
      if (heal > 0 && actorIsPC) {
        agg.healingDone += heal;
        agg.perChar[e.actor].healing += heal;
        if (!agg.biggestHeal || heal > agg.biggestHeal.amount) {
          agg.biggestHeal = {
            amount: heal,
            actor: e.actor,
            sessionId: s.id,
            when: e.t || null,
          };
        }
      }

      if (
        actorIsPC &&
        (e.type === "attack" || e.type === "spell") &&
        e.roll &&
        typeof e.roll.hit === "boolean"
      ) {
        agg.perChar[e.actor].attackCount++;
        if (e.roll.hit) agg.perChar[e.actor].hitCount++;
      }
      if (actorIsPC && e.roll) {
        if (e.roll.critical) {
          agg.crits++;
          agg.perChar[e.actor].crits++;
        }
        if (e.roll.fumble) {
          agg.fumbles++;
          agg.perChar[e.actor].fumbles++;
        }
      }
    }
  }

  return { data, chars, sessions, byId, agg };
}

// ---------- KPIs / Leaderboards
function renderKpis(mount, ctx) {
  const { agg, byId } = ctx;
  const bh = agg.biggestHit
    ? `${esc(
        byId[agg.biggestHit.actor]?.name || agg.biggestHit.actor
      )} — ${fmtInt(agg.biggestHit.amount)} dmg`
    : "—";
  const bheal = agg.biggestHeal
    ? `${esc(
        byId[agg.biggestHeal.actor]?.name || agg.biggestHeal.actor
      )} — ${fmtInt(agg.biggestHeal.amount)} HP`
    : "—";

  mount.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Sessions</div><div class="kpi-value">${fmtInt(
        agg.sessionsCount
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Encounters</div><div class="kpi-value">${fmtInt(
        agg.encountersCount
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Party Damage Dealt</div><div class="kpi-value">${fmtInt(
        agg.damageDealt
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Party Damage Taken</div><div class="kpi-value">${fmtInt(
        agg.damageTaken
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Healing</div><div class="kpi-value">${fmtInt(
        agg.healingDone
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Crits</div><div class="kpi-value">${fmtInt(
        agg.crits
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Fumbles</div><div class="kpi-value">${fmtInt(
        agg.fumbles
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Biggest Hit</div><div class="kpi-value">${bh}</div></div>
      <div class="kpi-card"><div class="kpi-label">Biggest Heal</div><div class="kpi-value">${bheal}</div></div>
    </div>

    <div class="inspiration-strip">
      <div class="insp-row">
        <div><span class="pill">Party Awarded</span> ${fmtInt(
          agg.inspiration.partyAwarded
        )}</div>
        <div><span class="pill">Party Spent</span> ${fmtInt(
          agg.inspiration.partySpent
        )}</div>
        <div><span class="pill">Party Banked</span> ${fmtInt(
          agg.inspiration.partyBanked
        )}</div>
      </div>
    </div>
  `;
}

function leaderboardRows(entries, byId, key) {
  return Object.values(entries)
    .map((x) => ({
      id: x.id,
      name: byId[x.id]?.name || x.id,
      val: x[key] || 0,
    }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 5)
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td style="text-align:right">${fmtInt(
          r.val
        )}</td></tr>`
    )
    .join("");
}

function renderLeaderboards(mount, ctx) {
  const { agg, byId } = ctx;
  const per = agg.perChar;
  mount.innerHTML = `
    <div class="leaderboards tb-grid">
      <div class="lb"><h4>Damage — Top 5</h4><table class="tb-table"><tbody>${leaderboardRows(
        per,
        byId,
        "damage"
      )}</tbody></table></div>
      <div class="lb"><h4>Healing — Top 5</h4><table class="tb-table"><tbody>${leaderboardRows(
        per,
        byId,
        "healing"
      )}</tbody></table></div>
      <div class="lb"><h4>Crits — Top 5</h4><table class="tb-table"><tbody>${leaderboardRows(
        per,
        byId,
        "crits"
      )}</tbody></table></div>
      <div class="lb"><h4>Fumbles — Top 5</h4><table class="tb-table"><tbody>${leaderboardRows(
        per,
        byId,
        "fumbles"
      )}</tbody></table></div>
    </div>
  `;
}

// ---------- LEFT LIST (always a 10-row viewport)
let CURRENT_SESSION = null;
const SESSIONS_VIEW_ROWS = 10;

function fixSessionListViewport(listMount) {
  // allow overflow in grid parents
  listMount.style.minHeight = "0";
  const parent = listMount.parentElement;
  if (parent) parent.style.minHeight = "0";

  const ul = listMount.querySelector(".sl-items");
  const first = ul?.querySelector(".sl-item");
  if (!ul || !first) return;

  // measure after layout/fonts settle
  requestAnimationFrame(() => {
    const itemH = first.getBoundingClientRect().height || 0;
    const cs = getComputedStyle(ul);
    // row-gap works for flex in modern browsers
    const gap = parseFloat(cs.rowGap || cs.gap || "0") || 0;
    const h = Math.round(
      SESSIONS_VIEW_ROWS * itemH + (SESSIONS_VIEW_ROWS - 1) * gap
    );
    ul.style.setProperty("--sl-max-h", `${h}px`); // feeds the CSS height
  });
}

function renderSessionList(listMount, ctx, onSelect) {
  const { sessions } = ctx;
  listMount.innerHTML = `
    <ul class="sl-items">
      ${sessions
        .map(
          (s) => `
        <li class="sl-item" data-sid="${esc(s.id)}">
          <div class="sl-top">
            <strong>${esc(s.title || s.id)}</strong>
            <span class="sl-date">${fmtDate(s.date)}</span>
          </div>
          <div class="sl-tags">${(s.arc_tags || [])
            .map((t) => `<span class="tag">${esc(t)}</span>`)
            .join(" ")}</div>
        </li>
      `
        )
        .join("")}
    </ul>
  `;

  // ALWAYS fix viewport to 10 rows (scroll appears once content exceeds it)
  fixSessionListViewport(listMount);
  if (!renderSessionList._resizeHooked) {
    window.addEventListener("resize", () => fixSessionListViewport(listMount));
    renderSessionList._resizeHooked = true;
  }

  $$(".sl-item", listMount).forEach((li) => {
    li.addEventListener("click", () => {
      $$(".sl-item.active", listMount).forEach((n) =>
        n.classList.remove("active")
      );
      li.classList.add("active");
      const sid = li.getAttribute("data-sid");
      const s = ctx.sessions.find((x) => x.id === sid);
      CURRENT_SESSION = s || null;
      onSelect(CURRENT_SESSION);
      updateExportButtons();
    });
  });

  // auto-select most recent
  if (sessions.length) {
    const mostRecent = [...sessions].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    )[0];
    const li = listMount.querySelector(
      `.sl-item[data-sid="${CSS.escape(mostRecent.id)}"]`
    );
    if (li) li.click();
  }
}

// ---------- per-session detail
function perSessionKpisHTML(s, ctx) {
  const byId = ctx.byId;
  let dmg = 0,
    heal = 0,
    crits = 0,
    fumbles = 0,
    bestHit = 0,
    bestHeal = 0;
  for (const e of s.events || []) {
    const actorIsPC = !!byId[e.actor];
    const d = e.damage?.total || 0;
    const h = e.healing || 0;
    if (actorIsPC && d > 0) {
      dmg += d;
      bestHit = Math.max(bestHit, d);
    }
    if (actorIsPC && h > 0) {
      heal += h;
      bestHeal = Math.max(bestHeal, h);
    }
    if (actorIsPC && e.roll?.critical) crits++;
    if (actorIsPC && e.roll?.fumble) fumbles++;
  }
  return `
    <div class="kpi-grid kpi-mini">
      <div class="kpi-card"><div class="kpi-label">PC Damage</div><div class="kpi-value">${fmtInt(
        dmg
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">PC Healing</div><div class="kpi-value">${fmtInt(
        heal
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">PC Crits</div><div class="kpi-value">${fmtInt(
        crits
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">PC Fumbles</div><div class="kpi-value">${fmtInt(
        fumbles
      )}</div></div>
      <div class="kpi-card"><div class="kpi-label">Best Hit</div><div class="kpi-value">${
        bestHit ? fmtInt(bestHit) : "—"
      }</div></div>
      <div class="kpi-card"><div class="kpi-label">Best Heal</div><div class="kpi-value">${
        bestHeal ? fmtInt(bestHeal) : "—"
      }</div></div>
    </div>
  `;
}

function renderSessionDetail(centerMount, s, ctx) {
  const { byId } = ctx;

  const partyNames = (s.party || [])
    .map((id) => esc(byId[id]?.name || id))
    .join(", ");
  const encRows = (s.encounters || [])
    .map(
      (enc) => `
    <tr>
      <td><strong>${esc(enc.name)}</strong></td>
      <td>${esc(enc.type || "—")}</td>
      <td>${esc(enc.difficulty || "—")}</td>
      <td>${esc(enc.outcome || "—")}</td>
      <td>${enc.notes ? esc(enc.notes) : "—"}</td>
    </tr>
  `
    )
    .join("");

  const insp = s.inspiration || {};
  const inspAwarded =
    (insp.awarded || [])
      .map(
        (a) =>
          `<li><strong>${esc(byId[a.to]?.name || a.to)}</strong> — ${esc(
            a.reason || ""
          )}</li>`
      )
      .join("") || "<li>None</li>";
  const inspSpent =
    (insp.spent || [])
      .map(
        (sp) =>
          `<li><strong>${esc(byId[sp.by]?.name || sp.by)}</strong> — ${esc(
            sp.reason || ""
          )}</li>`
      )
      .join("") || "<li>None</li>";

  const lootRows = (s.loot || [])
    .map(
      (l) => `
    <tr>
      <td>${esc(byId[l.who]?.name || l.who)}</td>
      <td>${esc(l.item)}</td>
      <td>${esc(l.rarity || "—")}</td>
      <td style="text-align:right">${fmtInt(l.value_gp || 0)}</td>
      <td>${l.attunement ? "Yes" : "No"}</td>
      <td>${l.consumed ? "Yes" : "No"}</td>
    </tr>
  `
    )
    .join("");

  const summary = mdToHtml(s.summary_markdown || "");

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
      ${perSessionKpisHTML(s, ctx)}
    </section>

    <section class="encounters">
      <h4>Encounters</h4>
      <table class="tb-table">
        <thead><tr><th>Name</th><th>Type</th><th>Difficulty</th><th>Outcome</th><th>Notes</th></tr></thead>
        <tbody>${
          encRows || `<tr><td colspan="5">No encounters recorded.</td></tr>`
        }</tbody>
      </table>
    </section>

    <section class="inspiration-session">
      <h4>Inspiration (this session)</h4>
      <div class="tb-grid">
        <div><h5>Awarded</h5><ul>${inspAwarded}</ul></div>
        <div><h5>Spent</h5><ul>${inspSpent}</ul></div>
      </div>
    </section>

    <section class="loot">
      <h4>Loot</h4>
      <table class="tb-table">
        <thead><tr><th>Who</th><th>Item</th><th>Rarity</th><th>Value (gp)</th><th>Attune</th><th>Used</th></tr></thead>
        <tbody>${
          lootRows || `<tr><td colspan="6">No loot recorded.</td></tr>`
        }</tbody>
      </table>
    </section>

    <section class="summary">
      <h4>Session Summary</h4>
      <div class="markdown">${summary}</div>
    </section>

    <details class="event-log">
      <summary>Show detailed event log</summary>
      <ul class="events">
        ${(s.events || [])
          .map((e) => {
            const who = esc(ctx.byId[e.actor]?.name || e.actor || "—");
            const tgt = esc(ctx.byId[e.target]?.name || e.target || "");
            const bits = [];
            if (e.type) bits.push(`<span class="pill">${esc(e.type)}</span>`);
            if (e.roll?.critical)
              bits.push(`<span class="tag good">CRIT</span>`);
            if (e.roll?.fumble)
              bits.push(`<span class="tag bad">FUMBLE</span>`);
            if (e.damage?.total)
              bits.push(
                `<span class="tag">${fmtInt(e.damage.total)} dmg</span>`
              );
            if (e.healing)
              bits.push(`<span class="tag">${fmtInt(e.healing)} heal</span>`);
            return `<li><span class="ev-time">${fmtDate(
              e.t
            )}</span> <strong>${who}</strong>${
              tgt ? ` → ${tgt}` : ""
            } ${bits.join(" ")} <em>${esc(e.notes || "")}</em></li>`;
          })
          .join("")}
      </ul>
    </details>
  `;
}

function renderCharactersRight(mount, ctx) {
  const rows = Object.values(ctx.agg.perChar)
    .map((c) => {
      const hitRate = c.attackCount
        ? Math.round((c.hitCount / c.attackCount) * 100)
        : 0;
      return `
      <div class="char-card">
        <div class="tb-kv">
          <div class="tb-kv-row"><div class="tb-kv-key"><strong>${esc(
            c.name
          )}</strong></div><div class="tb-kv-val"></div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Damage</div><div class="tb-kv-val">${fmtInt(
            c.damage
          )}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Healing</div><div class="tb-kv-val">${fmtInt(
            c.healing
          )}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Crits</div><div class="tb-kv-val">${fmtInt(
            c.crits
          )}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Fumbles</div><div class="tb-kv-val">${fmtInt(
            c.fumbles
          )}</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Hit Rate</div><div class="tb-kv-val">${fmtInt(
            hitRate
          )}%</div></div>
          <div class="tb-kv-row"><div class="tb-kv-key">Inspiration</div><div class="tb-kv-val">Bank ${fmtInt(
            c.inspiration.bank
          )} · Awarded ${fmtInt(c.inspiration.awarded)} · Spent ${fmtInt(
        c.inspiration.spent
      )}</div></div>
        </div>
      </div>
    `;
    })
    .join("");

  mount.innerHTML = rows || "<p>No characters.</p>";
}

function renderAll(rootKpis, rootLB, rootDetail, listMount, rightMount, ctx) {
  renderKpis(rootKpis, ctx);
  renderLeaderboards(rootLB, ctx);
  renderSessionList(listMount, ctx, (session) => {
    renderSessionDetail(rootDetail, session, ctx);
  });
  renderCharactersRight(rightMount, ctx);
}

// ---------- Exports
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
    version: data.version || 1,
    generated_at: new Date().toISOString(),
    sessions_count: agg.sessionsCount,
    encounters_count: agg.encountersCount,
    totals: {
      damage_dealt: agg.damageDealt,
      damage_taken: agg.damageTaken,
      healing_done: agg.healingDone,
      crits: agg.crits,
      fumbles: agg.fumbles,
    },
    records: {
      biggest_hit: agg.biggestHit
        ? {
            amount: agg.biggestHit.amount,
            actorId: agg.biggestHit.actor,
            actorName: byId[agg.biggestHit.actor]?.name || agg.biggestHit.actor,
            sessionId: agg.biggestHit.sessionId,
            when: agg.biggestHit.when,
          }
        : null,
      biggest_heal: agg.biggestHeal
        ? {
            amount: agg.biggestHeal.amount,
            actorId: agg.biggestHeal.actor,
            actorName:
              byId[agg.biggestHeal.actor]?.name || agg.biggestHeal.actor,
            sessionId: agg.biggestHeal.sessionId,
            when: agg.biggestHeal.when,
          }
        : null,
    },
    inspiration: {
      party_awarded: agg.inspiration.partyAwarded,
      party_spent: agg.inspiration.partySpent,
      party_banked: agg.inspiration.partyBanked,
    },
    per_character: Object.values(agg.perChar).map((c) => ({
      id: c.id,
      name: byId[c.id]?.name || c.id,
      damage: c.damage,
      healing: c.healing,
      crits: c.crits,
      fumbles: c.fumbles,
      attackCount: c.attackCount,
      hitCount: c.hitCount,
      hitRate: c.attackCount
        ? Math.round((c.hitCount / c.attackCount) * 100)
        : 0,
      inspiration: {
        awarded: c.inspiration.awarded,
        spent: c.inspiration.spent,
        bank: c.inspiration.bank,
      },
    })),
  };
  download("totals.json", JSON.stringify(out, null, 2), "application/json");
}

function exportPerCharacterCSV(ctx) {
  const { agg, byId } = ctx;
  const rows = [
    [
      "Character",
      "Damage",
      "Healing",
      "Crits",
      "Fumbles",
      "Attacks",
      "Hits",
      "HitRate%",
      "InspAwarded",
      "InspSpent",
      "InspBank",
    ],
  ];
  for (const c of Object.values(agg.perChar)) {
    const name = byId[c.id]?.name || c.id;
    const hitRate = c.attackCount
      ? Math.round((c.hitCount / c.attackCount) * 100)
      : 0;
    rows.push([
      name,
      c.damage,
      c.healing,
      c.crits,
      c.fumbles,
      c.attackCount,
      c.hitCount,
      hitRate,
      c.inspiration.awarded,
      c.inspiration.spent,
      c.inspiration.bank,
    ]);
  }
  const csv = rows
    .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  download("per-character.csv", csv, "text/csv");
}

function updateExportButtons() {
  const btn = $("#btnExportSession");
  if (btn) btn.disabled = !CURRENT_SESSION;
}

// ---------- init (self-gating)
async function init() {
  const statsMount = document.getElementById("stats-detail");
  if (!statsMount) return;

  const listMount = document.getElementById("stats-session-list");
  const rightMount = document.getElementById("stats-characters");
  const kpisMount = document.getElementById("stats-kpis");
  const lbMount = document.getElementById("stats-leaderboards");

  try {
    const data = await loadData();
    const ctx = aggregate(data);

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

    renderAll(kpisMount, lbMount, statsMount, listMount, rightMount, ctx);
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
