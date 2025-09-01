/* dice-roller.js — center dice roller + left attribute roller (drag & drop) */
(function () {
  /* ---------- Shared utilities ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const formatSigned = n => (n >= 0 ? `+${n}` : `${n}`);
  const rollDie = sides => Math.floor(Math.random() * sides) + 1;

  /* ======================================================================
     CENTER DICE ROLLER (adv/normal/disadv + modifier + history)
     ====================================================================== */
  const MODE_MAP = { 0: "disadvantage", 1: "normal", 2: "advantage" };
  const MODE_LABEL = { disadvantage: "Disadvantage", normal: "Normal", advantage: "Advantage" };
  const HISTORY_LIMIT = 100;
  const LS_KEY = "skzRollHistoryV1";

  function ensureHistoryMount() {
    let el = document.getElementById("skz-history");
    if (el) return el;
    const right = document.querySelector(".right-column");
    if (!right) return null;
    right.insertAdjacentHTML(
      "afterbegin",
      `<section id="skz-history" class="skz-history">
         <h2 class="skz-history-title">History</h2>
         <ol id="skz-history-list" class="skz-history-list" reversed></ol>
         <div class="skz-history-actions">
           <button id="skz-clear-history" class="skz-ghost-btn" type="button">Clear</button>
         </div>
       </section>`
    );
    return document.getElementById("skz-history");
  }

  function parseModifier(raw) {
    const s = String(raw || "").trim();
    if (s === "" || s === "+") return 0;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function computeRoll(sides, mode, mod) {
    const r1 = rollDie(sides);
    let rolls = [r1], kept = r1;
    if (mode === "advantage" || mode === "disadvantage") {
      const r2 = rollDie(sides);
      rolls.push(r2);
      kept = mode === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
    }
    const total = kept + mod;
    return { sides, mode, mod, rolls, kept, total, timestamp: new Date().toISOString() };
  }

  function renderLast(result) {
    const last = document.getElementById("skz-last-body");
    if (!last) return;
    const { sides, mode, mod, rolls, kept, total } = result;
    let detail = "";
    if (mode === "normal") {
      detail = `d${sides}: ${rolls[0]} ${formatSigned(mod)} = <strong>${total}</strong>`;
    } else {
      const label = mode === "advantage" ? "Adv" : "Dis";
      detail = `d${sides} <em>(${label})</em> — rolls ${JSON.stringify(rolls)} → keep <strong>${kept}</strong> ${formatSigned(mod)} = <strong>${total}</strong>`;
    }
    last.innerHTML = detail;
  }

  function historyLoad() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") || []; } catch { return []; }
  }
  function historySave(arr) { try { localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(-HISTORY_LIMIT))); } catch {} }

  function appendHistory(result) {
    ensureHistoryMount();
    const list = document.getElementById("skz-history-list");
    if (!list) return;
    const { sides, mode, mod, rolls, kept, total, timestamp } = result;
    const li = document.createElement("li");
    li.innerHTML = (mode === "normal")
      ? `<code>d${sides}</code> = ${rolls[0]} ${formatSigned(mod)} → <strong>${total}</strong>`
      : `<code>d${sides}</code> <em>(${mode === "advantage" ? "Adv" : "Dis"})</em> ${JSON.stringify(rolls)} → keep ${kept} ${formatSigned(mod)} → <strong>${total}</strong>`;
    li.setAttribute("data-time", timestamp);
    list.insertBefore(li, list.firstChild);
    const store = historyLoad(); store.push(result); historySave(store);
  }

  function hydrateHistory() {
    ensureHistoryMount();
    const list = document.getElementById("skz-history-list");
    if (!list) return;
    const store = historyLoad();
    list.innerHTML = "";
    store.forEach(entry => {
      const li = document.createElement("li");
      const { sides, mode, mod, rolls, kept, total, timestamp } = entry;
      li.setAttribute("data-time", timestamp);
      li.innerHTML = (mode === "normal")
        ? `<code>d${sides}</code> = ${rolls[0]} ${formatSigned(mod)} → <strong>${total}</strong>`
        : `<code>d${sides}</code> <em>(${mode === "advantage" ? "Adv" : "Dis"})</em> ${JSON.stringify(rolls)} → keep ${kept} ${formatSigned(mod)} → <strong>${total}</strong>`;
      list.appendChild(li);
    });
  }

  function initCenterRoller() {
    const roller = document.getElementById("skz-dice-roller");
    if (!roller) return;

    const modeSlider = $("#skz-mode", roller);
    const modeLabel  = $("#skz-mode-label", roller);
    const modInput   = $("#skz-mod-input", roller);
    const sliderWrap = $(".skz-slider-wrap", roller);

    function updateModeLabel() {
      const mode = MODE_MAP[Number(modeSlider.value) || 1];
      modeLabel.textContent = MODE_LABEL[mode];
      modeSlider.setAttribute("aria-valuenow", String(modeSlider.value));
      modeSlider.setAttribute("aria-valuetext", MODE_LABEL[mode]);
      sliderWrap.dataset.mode = mode;
    }
    updateModeLabel();
    modeSlider.addEventListener("input", updateModeLabel);
    modeSlider.addEventListener("change", updateModeLabel);

    roller.querySelectorAll(".skz-die").forEach(btn => {
      btn.addEventListener("click", () => {
        const sides = parseInt(btn.dataset.die, 10);
        const mode = MODE_MAP[Number(modeSlider.value) || 1];
        const mod  = parseModifier(modInput.value);
        const result = computeRoll(sides, mode, mod);
        renderLast(result);
        appendHistory(result);
      });
    });

    const copyBtn = document.getElementById("skz-copy-last");
    copyBtn?.addEventListener("click", () => {
      const last = document.getElementById("skz-last-body");
      if (!last) return;
      const text = last.textContent || "";
      navigator.clipboard?.writeText(text).then(() => {
        copyBtn.textContent = "Copied!"; setTimeout(() => (copyBtn.textContent = "Copy"), 900);
      }).catch(() => {
        copyBtn.textContent = "Copy failed"; setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
      });
    });

    hydrateHistory();
    document.getElementById("skz-clear-history")?.addEventListener("click", () => {
      if (!confirm("Clear roll history?")) return;
      historySave([]); hydrateHistory();
    });

    const observer = new MutationObserver(() => {
      if (!document.getElementById("skz-history-list")) { ensureHistoryMount(); hydrateHistory(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ======================================================================
     LEFT ATTRIBUTE ROLLER (4d6 drop lowest ×6) with drag & drop
     ====================================================================== */
  const ATTRS = ["Strength", "Intelligence", "Constitution", "Dexterity", "Wisdom", "Charisma"];
  const LS_ATTR_KEY = "skzAttrV3"; // stores rolls + assignment

  let attrState = {
    rolls: null,        // array of 6 scores {id, rolls, kept, dropped, total}
    assignment: null,   // array[6]: row index -> score index
    selectedAttr: null, // for click-to-swap keyboard fallback
  };

  function roll4d6DropLowest() {
    const rolls = [rollDie(6), rollDie(6), rollDie(6), rollDie(6)];
    const min = Math.min(...rolls);
    const idx = rolls.indexOf(min); // drop one instance (even if multiple are equal)
    const kept = rolls.slice(0, idx).concat(rolls.slice(idx + 1));
    return { rolls, kept, dropped: min, total: sum(kept) };
  }

  function generateSixScores() {
    return Array.from({ length: 6 }, (_, i) => ({ id: i, ...roll4d6DropLowest() }));
  }

  function attrSave() {
    try { localStorage.setItem(LS_ATTR_KEY, JSON.stringify({ rolls: attrState.rolls, assignment: attrState.assignment })); } catch {}
  }
  function attrLoad() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LS_ATTR_KEY) || "null");
      if (!parsed || !Array.isArray(parsed.rolls) || !Array.isArray(parsed.assignment)) return null;
      return parsed;
    } catch { return null; }
  }

  function swapAssignments(fromAttr, toAttr) {
    const a = attrState.assignment;
    [a[fromAttr], a[toAttr]] = [a[toAttr], a[fromAttr]];
    attrSave();
    renderAttrTable();
  }

  function bindDnDHandlers() {
    const cards = document.querySelectorAll(".skz-card");
    const cells = document.querySelectorAll(".skz-attr-cell");

    cards.forEach(card => {
      card.addEventListener("dragstart", e => {
        const fromAttr = Number(card.dataset.attrIndex);
        e.dataTransfer.setData("text/plain", String(fromAttr));
        e.dataTransfer.effectAllowed = "move";
        card.classList.add("selected");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("selected");
        document.querySelectorAll(".skz-attr-cell.dragover").forEach(el => el.classList.remove("dragover"));
      });

      // Click-to-swap fallback
      card.addEventListener("click", () => {
        const from = Number(card.dataset.attrIndex);
        const prev = attrState.selectedAttr;
        // clear other selections
        document.querySelectorAll(".skz-card.selected").forEach(el => {
          if (Number(el.dataset.attrIndex) !== from) el.classList.remove("selected");
        });
        if (prev === null || prev === undefined) {
          attrState.selectedAttr = from;
          card.classList.add("selected");
        } else if (prev === from) {
          attrState.selectedAttr = null;
          card.classList.remove("selected");
        } else {
          swapAssignments(prev, from);
          attrState.selectedAttr = null;
        }
      });

      card.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); card.click(); }
        else if (ev.key === "Escape") { attrState.selectedAttr = null; card.classList.remove("selected"); }
      });
    });

    cells.forEach(cell => {
      cell.addEventListener("dragover", e => { e.preventDefault(); cell.classList.add("dragover"); });
      cell.addEventListener("dragleave", () => cell.classList.remove("dragover"));
      cell.addEventListener("drop", e => {
        e.preventDefault();
        cell.classList.remove("dragover");
        const fromAttr = Number(e.dataTransfer.getData("text/plain"));
        const toAttr = Number(cell.dataset.attrIndex);
        if (Number.isFinite(fromAttr) && Number.isFinite(toAttr) && fromAttr !== toAttr) {
          swapAssignments(fromAttr, toAttr);
        }
      });
    });
  }

  // Renders two columns (Ability + Score card). Hint lives once under the table.
  function renderAttrTable() {
    const tbody = document.getElementById("skz-attr-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!attrState.rolls || !attrState.assignment) return;

    ATTRS.forEach((name, rowIdx) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = name;

      const tdTotal = document.createElement("td");
      tdTotal.className = "skz-attr-cell";
      tdTotal.dataset.attrIndex = String(rowIdx);

      const scoreIndex = attrState.assignment[rowIdx];
      const score = attrState.rolls[scoreIndex];

      const card = document.createElement("div");
      card.className = "skz-card";
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      card.draggable = true;
      card.dataset.attrIndex = String(rowIdx);
      card.dataset.scoreId = String(score.id);
      card.setAttribute("aria-label", `Score ${score.total} for ${name}, drag to swap`);

      const totalEl = document.createElement("span");
      totalEl.className = "skz-card-total";
      totalEl.innerHTML = `<strong>${score.total}</strong>`;

      const chips = document.createElement("span");
      chips.className = "skz-card-chips";
      chips.innerHTML = score.kept.map(v => `<span class="skz-chip">${v}</span>`).join("")
                    + `<span class="skz-chip skz-chip--dropped">${score.dropped}</span>`;

      card.appendChild(totalEl);
      card.appendChild(chips);
      tdTotal.appendChild(card);

      tr.appendChild(tdName);
      tr.appendChild(tdTotal);
      tbody.appendChild(tr);
    });

    bindDnDHandlers();
  }

  function initAttr() {
    const root = document.getElementById("skz-attr-roller");
    if (!root) return;

    const btnGen = document.getElementById("skz-attr-generate");
    const btnCopy = document.getElementById("skz-attr-copy");
    const btnClear = document.getElementById("skz-attr-clear");
    const tbody   = document.getElementById("skz-attr-tbody");

    const saved = attrLoad();
    if (saved) { attrState.rolls = saved.rolls; attrState.assignment = saved.assignment; renderAttrTable(); }

    btnGen?.addEventListener("click", () => {
      attrState.rolls = Array.from({ length: 6 }, (_, i) => ({ id: i, ...roll4d6DropLowest() }));
      attrState.assignment = [0,1,2,3,4,5]; // default: in-order
      attrState.selectedAttr = null;
      attrSave();
      renderAttrTable();
    });

    btnCopy?.addEventListener("click", () => {
      if (!attrState.rolls || !attrState.assignment) return;
      const abbr = { Strength:"STR", Intelligence:"INT", Constitution:"CON", Dexterity:"DEX", Wisdom:"WIS", Charisma:"CHA" };
      const line = ATTRS.map((name, i) => {
        const scoreIndex = attrState.assignment[i];
        const total = attrState.rolls[scoreIndex].total;
        return `${abbr[name]} ${total}`;
      }).join(", ");
      navigator.clipboard?.writeText(line).then(() => {
        btnCopy.textContent = "Copied!"; setTimeout(() => (btnCopy.textContent = "Copy"), 900);
      }).catch(() => {
        btnCopy.textContent = "Copy failed"; setTimeout(() => (btnCopy.textContent = "Copy"), 1200);
      });
    });

    btnClear?.addEventListener("click", () => {
      try { localStorage.removeItem(LS_ATTR_KEY); } catch {}
      attrState.rolls = null; attrState.assignment = null; attrState.selectedAttr = null;
      if (tbody) tbody.innerHTML = "";
    });
  }

  /* ======================================================================
     BOOT BOTH
     ====================================================================== */
  function boot() {
    initCenterRoller();
    initAttr();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
