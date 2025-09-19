// npc.js — data-driven NPCs (occup. + setting selectors, lifespans, names.json)
// + temperament hints from JSON, compact card, clear (×) buttons
(() => {
  // ---------- CONFIG ----------
  const DATA_URL = "data/npc.json";
  const NAMES_URL = "data/names.json";

  // ---------- DOM / RNG ----------
  const $ = (id) => document.getElementById(id);
  const seedFromURL = () => {
    const sp = new URLSearchParams(location.search);
    const s = sp.get("seed");
    return s && /^\d+$/.test(s) ? parseInt(s, 10) : null;
  };
  const rngMulberry32 = (seed) => {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------- weighting helpers ----------
  const overlap = (a = [], b = []) => a.filter((t) => b.includes(t)).length;
  const filterByReq = (item, ctx) =>
    (!item?.requiresAny || item.requiresAny.some((t) => ctx.includes(t))) &&
    (!item?.excludesAny || !item.excludesAny.some((t) => ctx.includes(t)));
  const prep = (table = [], ctx = []) =>
    table
      .filter((it) => filterByReq(it, ctx))
      .map((it) => ({
        ...it,
        _w: (it.weight || 1) * (1 + 0.25 * overlap(it.tags || [], ctx)),
      }));
  const wPick = (list, rnd) => {
    if (!list?.length) return null;
    const total = list.reduce((s, i) => s + (i._w || i.weight || 1), 0);
    let n = rnd() * total;
    for (const i of list) {
      n -= i._w || i.weight || 1;
      if (n <= 0) return i;
    }
    return list[list.length - 1];
  };
  const sampleNoRep = (table, k, ctx, rnd) => {
    const pool = prep(table || [], ctx).slice();
    const out = [];
    while (out.length < k && pool.length) {
      const c = wPick(pool, rnd);
      if (!c) break;
      out.push(c);
      pool.splice(
        pool.findIndex((p) => p.id === c.id),
        1
      );
    }
    return out;
  };

  // ---------- data stores ----------
  let DB = null,
    NAMES = null;
  let OCCUPATIONS = [],
    CONTEXTS = [];
  let currentOcc = null,
    currentCtx = null;

  // ---------- ancestry / lifespans ----------
  const pickAncestry = (db, rnd) => {
    const bias = (db.defaults && db.defaults.ancestry_bias) || ["human:1"];
    const list = bias.map((x) => {
      const [id, w] = x.split(":");
      return { id, weight: +w || 1 };
    });
    return wPick(list, rnd)?.id || "human";
  };
  function ageFor(ancestry, rnd) {
    const L = DB?.defaults?.lifespans || DB?.tables?.lifespans || {};
    const spec = L[ancestry] ||
      L.human || {
        adult: 18,
        elderly: 60,
        max: 90,
        stage_weights: [50, 35, 15],
      };
    const [wYoung = 50, wPrime = 35, wElder = 15] = spec.stage_weights || [];
    const total = wYoung + wPrime + wElder || 1;
    let r = rnd() * total;
    let lo, hi;
    if ((r -= wYoung) <= 0) {
      lo = spec.adult;
      hi = Math.max(lo + 6, Math.floor((spec.adult + spec.elderly) / 2));
    } else if ((r -= wPrime) <= 0) {
      lo = Math.max(
        spec.adult + 5,
        Math.floor((spec.adult + spec.elderly) / 2)
      );
      hi = spec.elderly;
    } else {
      lo = spec.elderly;
      hi = spec.max;
    }
    const t = (rnd() + rnd()) / 2;
    return Math.max(
      spec.adult,
      Math.min(spec.max, Math.floor(lo + t * (hi - lo)))
    );
  }

  // ---------- names.json integration ----------
  const HUMAN_VARIANTS = ["human_sken", "human_kaij", "human_caratania"];

  // NEW: aliases requested
  const NAME_ALIASES = {
    duergar: "dwarf",
    changeling: "HUMAN_ANY",
    aasimar: "HUMAN_ANY",
  };

  // NEW: merge all human variants into one bucket
  function mergeHumanVariants(ppl) {
    const male = [];
    const female = [];
    for (const key of HUMAN_VARIANTS) {
      const b = ppl[key];
      if (!b) continue;
      const m = Array.isArray(b.male) ? b.male : b.m;
      const f = Array.isArray(b.female) ? b.female : b.f;
      if (Array.isArray(m)) male.push(...m);
      if (Array.isArray(f)) female.push(...f);
    }
    return {
      male: Array.from(new Set(male)),
      female: Array.from(new Set(female)),
    };
  }

  function getExternalNameBucket(ancestry, ctxTags, rnd) {
    if (!NAMES || !NAMES.people) return null;
    const ppl = NAMES.people;

    // NEW: resolve aliases first
    const alias = NAME_ALIASES[ancestry];
    if (alias === "HUMAN_ANY") {
      return mergeHumanVariants(ppl);
    }
    if (typeof alias === "string") {
      ancestry = alias; // e.g., duergar -> dwarf
    }

    let key = ancestry;
    if (ancestry === "human") {
      const hv = ctxTags.find((t) => t.startsWith("human:"));
      if (hv) {
        const candidate = `human_${hv.split(":")[1]}`;
        if (ppl[candidate]) key = candidate;
      }
      if (key === "human") {
        const hvKey = HUMAN_VARIANTS[Math.floor(rnd() * HUMAN_VARIANTS.length)];
        if (ppl[hvKey]) key = hvKey;
      }
    }
    // If the requested key exists, return it
    if (ppl[key]) return ppl[key];

    // Fallbacks for humans if a specific variant is missing
    if (key.startsWith("human")) return mergeHumanVariants(ppl);

    // Final fallback: merged humans so you still get a sane name
    return mergeHumanVariants(ppl);
  }

  function pickNameAndSex(ancestry, ctxTags, rnd) {
    const sexTag = ctxTags.find((t) => t.startsWith("sex:"));
    const sexPref = sexTag ? sexTag.split(":")[1] : null;
    const bucket = getExternalNameBucket(ancestry, ctxTags, rnd);
    if (bucket) {
      const male = Array.isArray(bucket.male) ? bucket.male : bucket.m;
      const female = Array.isArray(bucket.female) ? bucket.female : bucket.f;
      if (sexPref === "male" && male?.length)
        return { name: male[Math.floor(rnd() * male.length)], sex: "male" };
      if (sexPref === "female" && female?.length)
        return {
          name: female[Math.floor(rnd() * female.length)],
          sex: "female",
        };
      if (male?.length && female?.length) {
        const pickMale = rnd() < 0.5;
        const list = pickMale ? male : female;
        return {
          name: list[Math.floor(rnd() * list.length)],
          sex: pickMale ? "male" : "female",
        };
      }
      if (male?.length)
        return { name: male[Math.floor(rnd() * male.length)], sex: "male" };
      if (female?.length)
        return {
          name: female[Math.floor(rnd() * female.length)],
          sex: "female",
        };
    }
    const pool = DB.tables?.names?.[ancestry] || DB.tables?.names?.human || {};
    const male = pool.male || [],
      female = pool.female || [];
    if (sexPref === "male" && male.length)
      return { name: male[Math.floor(rnd() * male.length)], sex: "male" };
    if (sexPref === "female" && female.length)
      return { name: female[Math.floor(rnd() * female.length)], sex: "female" };
    if (male.length && female.length) {
      const pickMale = rnd() < 0.5;
      const list = pickMale ? male : female;
      return {
        name: list[Math.floor(rnd() * list.length)],
        sex: pickMale ? "male" : "female",
      };
    }
    if (male.length)
      return { name: male[Math.floor(rnd() * male.length)], sex: "male" };
    if (female.length)
      return { name: female[Math.floor(rnd() * female.length)], sex: "female" };
    return { name: ["Alex", "Sam", "Jordan"][Math.floor(rnd() * 3)], sex: "—" };
  }

  // ---------- NPC builder (includes temperament hint) ----------
  function buildNPC(seed, ctxTags, occLocked) {
    const rnd = rngMulberry32(seed);
    const ancestry = pickAncestry(DB, rnd);
    const { name, sex } = pickNameAndSex(ancestry, ctxTags, rnd);

    const occ = occLocked || wPick(prep(OCCUPATIONS, ctxTags), rnd);
    const temperamentItem = wPick(
      prep(DB.tables?.temperaments || [], ctxTags),
      rnd
    );
    const temperament = temperamentItem?.label || "Even-tempered";
    const temperament_hint = temperamentItem?.hint || null;
    const traits = sampleNoRep(
      DB.tables?.personality_traits || [],
      2,
      ctxTags,
      rnd
    ).map((t) => t.label);

    const workplaceList = occ?.details?.workplaces || [];
    const workplace = workplaceList.length
      ? workplaceList[Math.floor(rnd() * workplaceList.length)]
      : undefined;

    return {
      name,
      sex,
      ancestry,
      age: ageFor(ancestry, rnd),
      occupation: occ
        ? { id: occ.id, label: occ.label, workplace }
        : { id: "unknown", label: "Commoner" },
      social_class: ["peasant", "burgher", "burgher", "burgher", "gentry"][
        Math.floor(rnd() * 5)
      ],
      wealth_hint: ["poor", "modest", "modest", "comfortable"][
        Math.floor(rnd() * 4)
      ],
      temperament,
      temperament_hint, // <<— NEW
      personality: traits?.length ? traits : ["Ordinary", "Dutiful"],
      primary_motivation:
        wPick(prep(DB.tables?.motivations || [], ctxTags), rnd)?.label ||
        "Make ends meet",
      short_term_goal: [
        "Secure a small loan",
        "Find reliable help",
        "Avoid a rival for a week",
      ][Math.floor(rnd() * 3)],
      long_term_goal: [
        "Own a second shop",
        "Be granted a charter",
        "Retire to a small holding",
      ][Math.floor(rnd() * 3)],
      secret:
        wPick(prep(DB.tables?.secrets || [], ctxTags), rnd)?.label ||
        "Carries a minor shame",
      fear: ["Losing livelihood", "Public shame", "Officials taking notice"][
        Math.floor(rnd() * 3)
      ],
      vice_or_virtue: [
        "Keeps meticulous ledgers",
        "Gives alms quietly",
        "Cannot refuse a gamble",
      ][Math.floor(rnd() * 3)],
      quirk:
        wPick(prep(DB.tables?.quirks || [], ctxTags), rnd)?.label ||
        "Taps foot while thinking",
      speech_pattern:
        wPick(prep(DB.tables?.speech_patterns || [], ctxTags), rnd)?.label ||
        "Plainspoken",
      appearance_hook:
        wPick(prep(DB.tables?.appearance_hooks || [], ctxTags), rnd)?.label ||
        "Weathered hands",
      attitude_to_party:
        wPick(prep(DB.tables?.attitudes || [], ctxTags), rnd)?.label ||
        "Neutral",
      faction_affiliation: (() => {
        const f = wPick(prep(DB.tables?.factions || [], ctxTags), rnd);
        return f
          ? {
              id: f.id,
              label: f.label,
              standing: ["petitioner", "member", "ally"][Math.floor(rnd() * 3)],
            }
          : { id: "none", label: "Unaffiliated", standing: "—" };
      })(),
      micro_hook:
        wPick(prep(DB.tables?.micro_hooks || [], ctxTags), rnd)?.label ||
        "Needs a small, doable favor",
      complication:
        wPick(prep(DB.tables?.complications || [], ctxTags), rnd)?.label ||
        "A rumor obscures the truth",
      relationships: [],
      scene_starter: [
        "“I can make something for that—if the ledger balances.”",
        "“State your business, and be quick about it.”",
        "“You look like folk who can keep a secret.”",
      ][Math.floor(rnd() * 3)],
      tags: ctxTags,
    };
  }

  // ---------- Compact card ----------
  function pretty(npc) {
    const badge = (t) => `<span class="tb-badge">${t}</span>`;
    const tags = npc.tags?.length
      ? `<div class="npc-tags">${npc.tags.map(badge).join("")}</div>`
      : "";
    const headerLine = `${npc.name} — ${npc.ancestry}, ${npc.age}, ${
      npc.sex || "—"
    }`;
    const occ = `${npc.occupation.label}${
      npc.occupation.workplace ? " — " + npc.occupation.workplace : ""
    }`;
    return `
      <div class="npc-card npc-tight">
        <header class="npc-header">
          <div class="npc-name">${headerLine}</div>
          ${tags}
        </header>

        <div class="npc-meta">
          <div class="row"><span class="k">Occupation:</span><span class="v">${occ}</span></div>
          <div class="row"><span class="k">Temperament:</span><span class="v">${
            npc.temperament
          }${
      npc.temperament_hint ? " — " + npc.temperament_hint : ""
    }</span></div>
          <div class="row"><span class="k">Traits:</span><span class="v">${npc.personality.join(
            ", "
          )}</span></div>
          <div class="row"><span class="k">Appearance:</span><span class="v">${
            npc.appearance_hook
          }</span></div>
          <div class="row"><span class="k">Speech:</span><span class="v">${
            npc.speech_pattern
          }</span></div>
          <div class="row"><span class="k">Attitude:</span><span class="v">${
            npc.attitude_to_party
          }</span></div>
          <div class="row"><span class="k">Faction:</span><span class="v">${
            npc.faction_affiliation.label
          } (${npc.faction_affiliation.standing})</span></div>
        </div>

        <section class="npc-hooks">
          <h4>Story Hooks</h4>
          <ul class="hooks">
            <li><span class="k">Motivation:</span> ${
              npc.primary_motivation
            }</li>
            <li><span class="k">Short Goal:</span> ${npc.short_term_goal}</li>
            <li><span class="k">Long Goal:</span> ${npc.long_term_goal}</li>
            <li><span class="k">Secret:</span> ${npc.secret}</li>
            <li><span class="k">Complication:</span> ${npc.complication}</li>
            <li><span class="k">Hook:</span> ${npc.micro_hook}</li>
          </ul>
        </section>

        <blockquote class="npc-opener">${npc.scene_starter}</blockquote>
      </div>
    `;
  }
  function textCard(npc) {
    const L = [];
    L.push(`${npc.name} — ${npc.ancestry}, ${npc.age}, ${npc.sex || "—"}`);
    L.push(
      `Occupation: ${npc.occupation.label}${
        npc.occupation.workplace ? " — " + npc.occupation.workplace : ""
      }`
    );
    L.push(
      `Temperament: ${npc.temperament}${
        npc.temperament_hint ? " — " + npc.temperament_hint : ""
      }`
    );
    L.push(`Traits: ${npc.personality.join(", ")}`);
    L.push(`Appearance: ${npc.appearance_hook}`);
    L.push(`Speech: ${npc.speech_pattern}`);
    L.push(`Attitude: ${npc.attitude_to_party}`);
    L.push(
      `Faction: ${npc.faction_affiliation.label} (${npc.faction_affiliation.standing})`
    );
    L.push(`Motivation: ${npc.primary_motivation}`);
    L.push(`Short Goal: ${npc.short_term_goal}`);
    L.push(`Long Goal: ${npc.long_term_goal}`);
    L.push(`Secret: ${npc.secret}`);
    L.push(`Complication: ${npc.complication}`);
    L.push(`Hook: ${npc.micro_hook}`);
    L.push(`Opener: ${npc.scene_starter}`);
    if (npc.tags?.length) L.push(`Tags: ${npc.tags.join(", ")}`);
    return L.join("\n");
  }

  // ---------- Combobox with clear (×) ----------
  function makeCombo({ mount, idPrefix, placeholder, options, sharedSpacer }) {
    const wrap = document.createElement("div");
    wrap.id = `${idPrefix}-combobox`;
    wrap.className = "tb-combobox";
    wrap.style.position = "relative";

    const input = document.createElement("input");
    input.id = `${idPrefix}-input`;
    input.type = "text";
    input.className = "tb-input";
    input.placeholder = placeholder || "";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.autocomplete = "off";
    input.style.width = "100%";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "tb-clear";
    clearBtn.setAttribute("aria-label", "Clear");
    clearBtn.title = "Clear";
    clearBtn.textContent = "×";
    clearBtn.style.display = "none";

    const list = document.createElement("div");
    list.id = `${idPrefix}-list`;
    list.className = "tb-list";
    list.style.position = "absolute";
    list.style.left = "0";
    list.style.right = "0";
    list.style.maxHeight = "240px";
    list.style.overflowY = "auto";
    list.style.display = "none";
    list.style.zIndex = "20";

    wrap.appendChild(input);
    wrap.appendChild(clearBtn);
    wrap.appendChild(list);
    mount.appendChild(wrap);

    let _options = options || [];
    let currentSelection = null;

    function setSpacerHeight(h) {
      if (!sharedSpacer) return;
      const cur = parseInt(sharedSpacer.dataset.h || "0", 10);
      if (h !== cur) {
        sharedSpacer.style.height = `${h}px`;
        sharedSpacer.dataset.h = String(h);
      }
    }
    function closeList() {
      list.style.display = "none";
      input.setAttribute("aria-expanded", "false");
      setSpacerHeight(0);
    }
    function openWithFilter(filterText = "") {
      const needle = filterText.trim().toLowerCase();
      const filtered = _options.filter((o) =>
        o.label.toLowerCase().includes(needle)
      );
      list.innerHTML = filtered.map((o, i) => `<div role="option" class="tb-option" data-index="${i}" style="padding:.4rem .6rem; cursor:pointer;">${o.label}</div>`).join("");

      const open = filtered.length > 0;
      list.style.display = open ? "block" : "none";
      input.setAttribute("aria-expanded", String(open));

      if (!open) {
        setSpacerHeight(0);
        list.style.top = "100%";
        list.style.bottom = "auto";
        return;
      }

      const rInput = input.getBoundingClientRect();
      const desired = Math.min(240, list.scrollHeight || 240);
      const spaceBelow = window.innerHeight - rInput.bottom;
      const spaceAbove = rInput.top;
      const openUp = spaceBelow < desired && spaceAbove > spaceBelow;

      if (openUp) {
        list.style.top = "auto";
        list.style.bottom = `${input.offsetHeight}px`;
        setSpacerHeight(0);
      } else {
        list.style.top = "100%";
        list.style.bottom = "auto";
        setSpacerHeight(desired + 8);
      }

      [...list.children].forEach((el, i) =>
        el.addEventListener("click", () => {
          currentSelection = filtered[i];
          input.value = currentSelection.label;
          clearBtn.style.display = input.value ? "inline-flex" : "none";
          closeList();
      // Also handle mousedown so selection happens before input blur (mobile/desktop)
      Array.from(list.children).forEach((el, i) => {
        el.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          currentSelection = filtered[i];
          input.value = currentSelection.label;
          clearBtn.style.display = input.value ? "inline-flex" : "none";
          closeList();
          wrap.dispatchEvent(new CustomEvent("combo:change", { detail: currentSelection }));
        });
      });

          wrap.dispatchEvent(
            new CustomEvent("combo:change", { detail: currentSelection })
          );
        })
      );
    }
    function clearSelection() {
      currentSelection = null;
      input.value = "";
      clearBtn.style.display = "none";
      closeList();
      wrap.dispatchEvent(new CustomEvent("combo:change", { detail: null }));
    }

    input.addEventListener("input", () => {
      clearBtn.style.display = input.value ? "inline-flex" : "none";
      openWithFilter(input.value);
    });
    input.addEventListener("focus", () => openWithFilter(input.value));
    input.addEventListener("blur", () => setTimeout(closeList, 200));
    input.addEventListener("keydown", (e) => {
      const opts = [...list.children];
      const idx = opts.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        (opts[idx + 1] || opts[0] || input).focus();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        (opts[idx - 1] || opts.at(-1) || input).focus();
      }
      if (e.key === "Enter" && document.activeElement !== input) {
        e.preventDefault();
        document.activeElement.click();
      }
      if (e.key === "Escape") {
        clearSelection();
        input.blur();
      }
    });
    clearBtn.addEventListener("click", clearSelection);
    document.addEventListener("mousedown", (ev) => {
      if (!wrap.contains(ev.target)) closeList();
    });

    input.value = "";
    closeList();

    return {
      setOptions(arr) {
        _options = arr || [];
      },
      onChange(fn) {
        wrap.addEventListener("combo:change", (e) => fn(e.detail));
      },
      setValue(label) {
        input.value = label || "";
        clearBtn.style.display = input.value ? "inline-flex" : "none";
      },
      getSelection() {
        return currentSelection;
      },
      clear: clearSelection,
    };
  }

  // ---------- Generate ----------
  const getCtxTags = () => (currentCtx?.tags || []).slice();
  async function generate() {
    if (!DB || !currentOcc) {
      $("npc-pretty").innerHTML = "";
      const dbg = $("npc-debug");
      if (dbg) dbg.textContent = "Pick an occupation and setting to generate.";
      return;
    }
    const seed = seedFromURL() ?? Math.floor(Math.random() * 1e9);
    const npc = buildNPC(seed, getCtxTags(), currentOcc);
    $("npc-pretty").innerHTML = pretty(npc).trim(); // trim to avoid stray whitespace
    const dbg = $("npc-debug");
    if (dbg)
      dbg.textContent = `Seed: ${seed} | Setting: ${
        currentCtx?.label || "—"
      } | Occupation: ${currentOcc?.label || "—"}`;

    const btn = $("npc-copy-text");
    if (btn) {
      btn.onclick = async () => {
        await navigator.clipboard.writeText(textCard(npc));
        const old = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = old || "Copy text"), 900);
      };
    }
  }

  // ---------- init ----------
  async function init() {
    try {
      const [dbRes, namesRes] = await Promise.allSettled([
        fetch(DATA_URL, { cache: "no-cache" }),
        fetch(NAMES_URL, { cache: "no-cache" }),
      ]);
      if (dbRes.status === "fulfilled") DB = await dbRes.value.json();
      else DB = { tables: {}, defaults: {} };
      if (namesRes.status === "fulfilled") NAMES = await namesRes.value.json();
    } catch (e) {
      console.error("Loading data failed:", e);
      DB = DB || { tables: {}, defaults: {} };
    }

    OCCUPATIONS = (DB.tables?.occupations || [])
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label));
    const JSON_CTX = DB.tables?.contexts || [];
    const FALLBACK_CTX = [
      { label: "Village / Rural", tags: ["village", "rural"] },
      { label: "Town", tags: ["town", "urban"] },
      { label: "City", tags: ["city", "urban"] },
      { label: "Dockside (City)", tags: ["city", "dockside", "riverport"] },
      { label: "Seaport", tags: ["seaport", "dockside"] },
      { label: "Frontier", tags: ["frontier"] },
    ];
    CONTEXTS = JSON_CTX.length ? JSON_CTX : FALLBACK_CTX;
    // —— Interlocking filters between Occupation and Context ——
    function ctxOptionsForOcc(occ) {
      if (!occ) return CONTEXTS.map((c) => ({ label: c.label, value: c.label }));
      const need = new Set((occ.requiresAny || []).map(String));
      const out = CONTEXTS.filter((c) => (c.tags || []).some((t) => need.has(String(t))))
        .map((c) => ({ label: c.label, value: c.label }));
      return out.length ? out : CONTEXTS.map((c) => ({ label: c.label, value: c.label }));
    }
    function occOptionsForCtx(ctx) {
      if (!ctx) return OCCUPATIONS.map((o) => ({ label: o.label, value: o.id }));
      const have = new Set((ctx.tags || []).map(String));
      const out = OCCUPATIONS.filter((o) => !(o.requiresAny && o.requiresAny.length) || o.requiresAny.some((t) => have.has(String(t))))
        .map((o) => ({ label: o.label, value: o.id }));
      return out.length ? out : OCCUPATIONS.map((o) => ({ label: o.label, value: o.id }));
    }


    // Ensure controls mount exists
    let controlsMount = $("npc-controls");
    if (!controlsMount) {
      const main = document.querySelector("main.grid-even") || document.body;
      const firstArticle = main.querySelector("article") || main;
      controlsMount = document.createElement("div");
      controlsMount.id = "npc-controls";
      firstArticle.prepend(controlsMount);
    }

    // Shared spacer to keep dropdowns from overlapping content
    let sharedSpacer = document.getElementById("npc-controls-spacer");
    if (!sharedSpacer) {
      sharedSpacer = document.createElement("div");
      sharedSpacer.id = "npc-controls-spacer";
      sharedSpacer.style.height = "0px";
      sharedSpacer.dataset.h = "0";
      controlsMount.after(sharedSpacer);
    }

    // Build comboboxes
    const occCombo = makeCombo({
      mount: controlsMount,
      idPrefix: "occ",
      placeholder: "Search occupation…",
      options: OCCUPATIONS.map((o) => ({ label: o.label, value: o.id })),
      sharedSpacer,
    });
    const ctxCombo = makeCombo({
      mount: controlsMount,
      idPrefix: "ctx",
      placeholder: "Search setting/context…",
      options: CONTEXTS.map((c) => ({ label: c.label, value: c.label })),
      sharedSpacer,
    });

    
    // Initialize with full lists (no selection yet)
    occCombo.setOptions(occOptionsForCtx(currentCtx));
    ctxCombo.setOptions(ctxOptionsForOcc(currentOcc));

    // Handlers (null-safe for clear) — either-first selection
    occCombo.onChange((sel) => {
      currentOcc = sel ? OCCUPATIONS.find((o) => o.id === sel.value) : null;

      // Update location options based on occupation
      ctxCombo.setOptions(ctxOptionsForOcc(currentOcc));

      // If current context no longer valid, clear it
      if (currentCtx) {
        const valid = ctxOptionsForOcc(currentOcc).some((opt) => opt.value === currentCtx.label);
        if (!valid) { currentCtx = null; ctxCombo.setValue(""); }
      }
      generate();
    });

    ctxCombo.onChange((sel) => {
      currentCtx = sel ? CONTEXTS.find((c) => c.label === sel.value) : null;

      // Update occupation options based on location
      occCombo.setOptions(occOptionsForCtx(currentCtx));

      // If current occupation no longer valid, clear it
      if (currentOcc) {
        const valid = occOptionsForCtx(currentCtx).some((opt) => opt.value === currentOcc.id);
        if (!valid) { currentOcc = null; occCombo.setValue(""); }
      }
      generate();
    });
// Reroll
    $("npc-reroll")?.addEventListener("click", () => {
      const url = new URL(location.href);
      url.searchParams.set("seed", Math.floor(Math.random() * 1e9));
      history.replaceState(null, "", url.toString());
      generate();
    });

    // Start empty/closed
    generate();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
