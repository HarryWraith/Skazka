/* dice-roller.js — center dice roller (adv/normal/disadv, macros, notation, export, hotkeys, per-die counts + ROLL button)
   + left attribute roller (4d6 drop lowest ×6, pool, locks, reroll, sort, standard array)
*/
(function(){
  /* ================= Shared Utilities ================= */
  const $ = (sel, root=document)=>root.querySelector(sel);
  const sum = arr => arr.reduce((a,b)=>a+b,0);
  const clamp = (n,min,max)=>Math.min(max,Math.max(min,n));
  const nowISO = ()=>new Date().toISOString();

  // Secure RNG (uniform) via rejection sampling
  function rollDie(sides){
    const s = Math.floor(sides);
    if (s<=1) return 1;
    const cryptoObj = (typeof window!=="undefined") && window.crypto;
    if (cryptoObj?.getRandomValues){
      const buf = new Uint32Array(1);
      const max = 0xFFFFFFFF;
      const limit = Math.floor((max+1)/s)*s - 1;
      let x;
      do { cryptoObj.getRandomValues(buf); x = buf[0]; } while (x > limit);
      return (x % s) + 1;
    }
    return Math.floor(Math.random()*s)+1;
  }

  const MODE_MAP = {0:"disadvantage",1:"normal",2:"advantage"};
  const MODE_LABEL = {disadvantage:"Disadvantage", normal:"Normal", advantage:"Advantage"};
  const fmtSigned=n=> (n>=0?`+${n}`:`${n}`);

  /* ================= Tiny Sound (WebAudio tick) ================= */
  const SOUND_LS = "skzSoundOnV1";
  let audioCtx = null;
  function playTick(){
    const on = localStorage.getItem(SOUND_LS);
    if (on==="0") return;
    try{
      audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "triangle"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.09);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
    }catch{}
  }

  /* ======================= HISTORY ======================= */
  const HISTORY_LIMIT=100, LS_HIST="skzRollHistoryV2";
  function historyLoad(){ try{ return JSON.parse(localStorage.getItem(LS_HIST)||"[]") }catch{ return [] } }
  function historySave(arr){ try{ localStorage.setItem(LS_HIST, JSON.stringify(arr.slice(-HISTORY_LIMIT))) }catch{} }
  function appendHistoryEntry(text, total=null){
    const store = historyLoad();
    store.push({text, total, ts: nowISO()});
    historySave(store);
  }

  function ensureHistoryMount(){
    let el = document.getElementById("skz-history");
    if (el) return el;
    const right = document.querySelector(".right-column");
    if (!right) return null;
    right.insertAdjacentHTML("afterbegin",
      `<section id="skz-history" class="skz-history">
         <h2 class="skz-history-title">History</h2>
         <ol id="skz-history-list" class="skz-history-list" reversed></ol>
         <div class="skz-history-actions">
           <button id="skz-clear-history" class="skz-ghost-btn" type="button">Clear</button>
         </div>
       </section>`);
    return document.getElementById("skz-history");
  }
  function hydrateHistory(){
    ensureHistoryMount();
    const list = $("#skz-history-list"); if(!list) return;
    list.innerHTML="";
    historyLoad().forEach(h=>{
      const li=document.createElement("li");
      li.textContent = h.text;
      li.setAttribute("data-time", h.ts);
      list.appendChild(li);
    });
    $("#skz-clear-history")?.addEventListener("click",()=>{
      if(!confirm("Clear roll history?"))return;
      historySave([]); hydrateHistory();
    });
  }

  /* =================== CENTER DICE ROLLER =================== */
  // Read ability modifiers from left roller (for +STR etc in notation)
  function getAbilityModsFromLeft(){
    try{
      const saved = JSON.parse(localStorage.getItem("skzAttrV3")||"null");
      if(!saved || !Array.isArray(saved.rolls) || !Array.isArray(saved.assignment)) return null;
      const ATTRS=["Strength","Intelligence","Constitution","Dexterity","Wisdom","Charisma"];
      const map = {};
      ATTRS.forEach((name,i)=>{
        const idx = saved.assignment[i];
        if(idx==null) return;
        const total = saved.rolls[idx]?.total;
        if(!Number.isFinite(total)) return;
        const mod = Math.floor((total-10)/2);
        const abbr = {Strength:"STR", Intelligence:"INT", Constitution:"CON", Dexterity:"DEX", Wisdom:"WIS", Charisma:"CHA"}[name];
        map[abbr]=mod;
      });
      return map;
    }catch{return null}
  }

  // Parse "NdMkh1+3", "4d6dl1-1", "3d8+DEX" etc.
  function parseNotation(str){
    const s = (str||"").trim().toUpperCase();
    const m = s.match(/^(\d*)D(\d+)(?:(K[HL]|D[HL])(\d+))?\s*([+\-]\s*(\d+|STR|DEX|CON|INT|WIS|CHA))?$/i);
    if(!m) return null;
    const n = parseInt(m[1]||"1",10);
    const sides = parseInt(m[2],10);
    const op = (m[3]||"").toLowerCase(); // kh, kl, dh, dl
    const x = m[4]? parseInt(m[4],10): null;
    let mod = 0, modSrc=null;
    if(m[5]){
      const raw = m[5].replace(/\s+/g,"");
      const sign = raw.startsWith("-")? -1 : 1;
      const val = raw.slice(1);
      if(/^\d+$/.test(val)) mod = sign*parseInt(val,10);
      else{
        const abbr = val.toUpperCase(); // STR etc
        const map = getAbilityModsFromLeft()||{};
        if(Number.isFinite(map[abbr])){ mod = sign*map[abbr]; modSrc=abbr; }
      }
    }

    const all = Array.from({length:n}, ()=> rollDie(sides));
    let kept=[...all], dropped=[];
    if(op && x){
      const count = clamp(x,0,n);
      const sortedIdx = all.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v); // asc
      if(op==="kh"){ const keep=new Set(sortedIdx.slice(-count).map(o=>o.i));
        kept=all.filter((_,i)=>keep.has(i)); dropped=all.filter((_,i)=>!keep.has(i));
      }else if(op==="kl"){ const keep=new Set(sortedIdx.slice(0,count).map(o=>o.i));
        kept=all.filter((_,i)=>keep.has(i)); dropped=all.filter((_,i)=>!keep.has(i));
      }else if(op==="dh"){ const drop=new Set(sortedIdx.slice(-count).map(o=>o.i));
        kept=all.filter((_,i)=>!drop.has(i)); dropped=all.filter((_,i)=>drop.has(i));
      }else if(op==="dl"){ const drop=new Set(sortedIdx.slice(0,count).map(o=>o.i));
        kept=all.filter((_,i)=>!drop.has(i)); dropped=all.filter((_,i)=>drop.has(i));
      }
    }
    const subtotal = sum(kept);
    const total = subtotal + mod;
    return {n, sides, all, kept, dropped, mod, modSrc, total, op, x};
  }

  function announce(msg){
    const live = document.getElementById("skz-live");
    if(live){ live.textContent = ""; setTimeout(()=> live.textContent = msg, 10); }
  }

  /* ---------- sparkline (inline SVG) ---------- */
  function sparkline(values){
    if(!values?.length) return "";
    const w=100,h=20, pad=2;
    const min=Math.min(...values), max=Math.max(...values);
    const scaleX=(w-pad*2)/(values.length-1||1);
    const scaleY=(h-pad*2)/(max-min||1);
    const points = values.map((v,i)=>{
      const x=pad+i*scaleX; const y= h-pad - ( (v-min)*scaleY );
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return ` <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="vertical-align:middle"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1"/></svg>`;
  }

  /* ================= Macros (center) ================= */
  const LS_MACROS="skzMacrosV1";
  function macrosLoad(){ try{ return JSON.parse(localStorage.getItem(LS_MACROS)||"[]") }catch{return []} }
  function macrosSave(list){ try{ localStorage.setItem(LS_MACROS, JSON.stringify(list)) }catch{} }
  function initMacros(){
    const listEl = $("#skz-macro-list"); if(!listEl) return;
    const render=()=>{
      listEl.innerHTML="";
      macrosLoad().forEach((m,idx)=>{
        const row = document.createElement("div");
        row.className="skz-macro-item";
        row.innerHTML = `<span class="skz-macro-name">${m.name}</span>
                         <code style="opacity:.8">${m.notation}</code>
                         <span style="flex:1"></span>
                         <button class="skz-btn" data-action="run" data-idx="${idx}">Roll</button>
                         <button class="skz-ghost-btn" data-action="del" data-idx="${idx}">Delete</button>`;
        listEl.appendChild(row);
      });
      listEl.querySelectorAll("button").forEach(btn=>{
        btn.addEventListener("click",()=>{
          const idx = parseInt(btn.dataset.idx,10);
          const item = macrosLoad()[idx];
          if(btn.dataset.action==="run" && item){
            $("#skz-notation").value = item.notation;
            $("#skz-notation-roll").click();
          }else if(btn.dataset.action==="del"){
            const arr = macrosLoad(); arr.splice(idx,1); macrosSave(arr); render();
          }
        });
      });
    };
    render();

    $("#skz-macro-add")?.addEventListener("click",()=>{
      const name = $("#skz-macro-name").value.trim();
      const notation = $("#skz-macro-notation").value.trim();
      if(!name || !notation) return;
      const arr = macrosLoad(); arr.push({name, notation}); macrosSave(arr);
      $("#skz-macro-name").value=""; $("#skz-macro-notation").value="";
      render();
    });
  }

  /* ================= Export (center history) ================= */
  function bindExport(){
    $("#skz-export-text")?.addEventListener("click", ()=>{
      const lines = historyLoad().map(h=>h.text).join("\n");
      navigator.clipboard?.writeText(lines);
      announce("History copied as text");
    });
    $("#skz-export-csv")?.addEventListener("click", ()=>{
      const rows = historyLoad().map(h=>`"${h.ts}","${(h.text||"").replace(/"/g,'""')}"`);
      navigator.clipboard?.writeText("timestamp,text\n"+rows.join("\n"));
      announce("History copied as CSV");
    });
    $("#skz-export-json")?.addEventListener("click", ()=>{
      navigator.clipboard?.writeText(JSON.stringify(historyLoad(),null,2));
      announce("History copied as JSON");
    });
    $("#skz-export-print")?.addEventListener("click", ()=>{
      const w = window.open("", "_blank");
      const html = `<pre style="font:14px/1.4 ui-monospace,Menlo,Consolas,monospace;padding:16px">${historyLoad().map(h=>`${h.ts}  ${h.text}`).join("\n")}</pre>`;
      if(w){ w.document.write(html); w.document.close(); w.focus(); w.print(); }
    });
  }

  /* ================= initCenter (per-die counts + ROLL button) ================= */
  function initCenter(){
    const root = document.getElementById("skz-dice-roller");
    if(!root) return;

    const modeSlider = $("#skz-mode", root);
    const modeLabel  = $("#skz-mode-label", root);
    const modInput   = $("#skz-mod-input", root);
    const sliderWrap = $(".skz-slider-wrap", root);

    const updateMode = ()=>{
      const mode = MODE_MAP[Number(modeSlider.value)||1];
      modeLabel.textContent = MODE_LABEL[mode];
      modeSlider.setAttribute("aria-valuenow", String(modeSlider.value));
      modeSlider.setAttribute("aria-valuetext", MODE_LABEL[mode]);
      sliderWrap.dataset.mode = mode;
    };
    updateMode();
    modeSlider.addEventListener("input", updateMode);
    modeSlider.addEventListener("change", updateMode);

    /* ---------- Per-die planned counts (click to add; right-click set to 1) ---------- */
    const MAX_COUNT = 20;                     // prevents huge accidental rolls
    const counts = {};                        // { sides: plannedCount }
    const tips = {
      4:"Damage dice (daggers)",6:"Common damage / heals",8:"Martial damage",
      10:"Percentile tens",12:"Greataxe etc.",20:"Checks & attacks",100:"Percentile"
    };

    // Set up each die button: increment count (no immediate roll)
    root.querySelectorAll(".skz-die").forEach(btn=>{
      const sides = parseInt(btn.dataset.die,10);
      counts[sides] = 0; // start at 0 so nothing rolls by default

      // badge element
      let badge = btn.querySelector(".skz-count-badge");
      if(!badge){
        badge = document.createElement("span");
        badge.className = "skz-count-badge";
        badge.textContent = "×0";
        badge.style.display = "none"; // hidden when 0
        btn.appendChild(badge);
      }
      const updateBadge = ()=>{
        badge.textContent = `×${counts[sides]}`;
        badge.style.display = counts[sides] > 0 ? "" : "none";
      };

      // tooltip text
      const coreTip = tips[sides] ? ` • ${tips[sides]}` : "";
      const setTitle = ()=> btn.title = `Left-click: add 1 (${counts[sides]}d${sides} planned)\nRight-click: set to 1${coreTip}`;
      setTitle();

      // LEFT-CLICK: increment planned count
      btn.addEventListener("click", ()=>{
        counts[sides] = Math.min(counts[sides] + 1, MAX_COUNT);
        updateBadge(); setTitle();
      });

      // RIGHT-CLICK: set planned count to 1 (no roll)
      btn.addEventListener("contextmenu", (e)=>{
        e.preventDefault();
        counts[sides] = 1;
        updateBadge(); setTitle();
      });
    });

    // Help tip (once)
    {
      const grid = root.querySelector(".skz-die-grid");
      if (grid && !root.querySelector("#skz-click-tip")) {
        const tip = document.createElement("p");
        tip.id = "skz-click-tip";
        tip.className = "skz-help-tip";
        tip.textContent = "Tip: Left-click adds to the dice count. Right-click sets it to 1. Click Roll to roll all selected dice.";
        grid.insertAdjacentElement("afterend", tip);
      }
    }

    // ROLL SELECTED button (injected under the tip)
    let rollBar = root.querySelector("#skz-combo-rollbar");
    if(!rollBar){
      rollBar = document.createElement("div");
      rollBar.id = "skz-combo-rollbar";
      rollBar.style.marginTop = "6px";
      rollBar.innerHTML = `<button id="skz-roll-selected" class="skz-btn" type="button" aria-label="Roll selected dice">🎲 Roll</button>`;
      const tip = root.querySelector("#skz-click-tip");
      (tip || root.querySelector(".skz-die-grid")).insertAdjacentElement("afterend", rollBar);
    }

    function renderLastCombo({mode, mod, breakdown, totalText, totalValue}){
      const lastBody = $("#skz-last-body"); const panel = lastBody?.parentElement;
      if(!lastBody) return;
      panel?.classList.remove("skz-crit","skz-fumble");
      panel?.classList.add("skz-pulse");
      lastBody.innerHTML = `${breakdown.join("<br>")}<br><em>${mode}</em> ${fmtSigned(mod)} → <strong>${totalText}</strong>`;
      appendHistoryEntry(`${breakdown.join(" | ")} ${mode} ${fmtSigned(mod)} = ${totalText}`, totalValue);
      playTick(); hydrateHistory();
    }

    // Perform a combined roll across selected dice
    function rollSelected(){
      const mode = MODE_MAP[Number(modeSlider.value)||1];
      const mod  = parseInt((modInput.value||"0"),10) || 0;

      // gather selected dice (count > 0)
      const selected = Object.keys(counts)
        .map(k=>({sides:parseInt(k,10), n:counts[k]}))
        .filter(x=>x.n>0)
        .sort((a,b)=>a.sides-b.sides);

      if(selected.length===0){ announce("No dice selected"); return; }

      let grandTotal = 0;
      const parts = [];

      if(mode==="normal"){
        selected.forEach(({sides,n})=>{
          const rolls = Array.from({length:n}, ()=> rollDie(sides));
          const subtotal = sum(rolls);
          grandTotal += subtotal;
          parts.push(`${n}d${sides}: ${JSON.stringify(rolls)} = ${subtotal}`);
        });
      }else{
        selected.forEach(({sides,n})=>{
          const pairs = Array.from({length:n}, ()=> [rollDie(sides), rollDie(sides)]);
          const kept  = pairs.map(([a,b])=> mode==="advantage" ? Math.max(a,b) : Math.min(a,b));
          const subtotal = sum(kept);
          grandTotal += subtotal;
          const pairsStr = pairs.map(([a,b])=>`(${a},${b})`).join(" ");
          parts.push(`${n}d${sides} (${mode}): ${pairsStr} → keep [${kept.join(", ")}] = ${subtotal}`);
        });
      }

      const final = grandTotal + mod;
      renderLastCombo({mode, mod, breakdown:parts, totalText: `${grandTotal} ${fmtSigned(mod)} = ${final}`, totalValue: final});
    }

    $("#skz-roll-selected")?.addEventListener("click", rollSelected);

    // Copy last
    $("#skz-copy-last")?.addEventListener("click", ()=>{
      const last = $("#skz-last-body");
      if(!last) return;
      const text = last.textContent||"";
      navigator.clipboard?.writeText(text).then(()=>{
        $("#skz-copy-last").textContent="Copied!";
        setTimeout(()=> $("#skz-copy-last").textContent="Copy", 900);
      });
    });

    // Inject toolbar: notation + burst + sound toggle
    const toolbar = document.createElement("div");
    toolbar.className = "skz-toolbar";
    toolbar.innerHTML = `
      <div class="skz-notation">
        <input id="skz-notation" class="skz-input" placeholder="Dice notation e.g. 8d6+3 or 2d20kh1+2">
        <button id="skz-notation-roll" class="skz-btn" type="button">Roll</button>
      </div>
      <label class="skz-toggle">
        <span class="skz-label">Burst</span>
        <select id="skz-burst" class="skz-select">
          <option value="1">1×</option><option value="5">5×</option><option value="10">10×</option><option value="20">20×</option>
        </select>
      </label>
      <button id="skz-sound-toggle" class="skz-btn" type="button" title="Toggle sound">🔊 Sound</button>
    `;
    root.appendChild(toolbar);

    // Sound toggle state
    const soundBtn = $("#skz-sound-toggle");
    const soundOn = (localStorage.getItem(SOUND_LS)!=="0");
    soundBtn.dataset.on = soundOn ? "1":"0";
    const reflectSound = ()=> soundBtn.textContent = (soundBtn.dataset.on==="1" ? "🔊 Sound" : "🔇 Sound");
    reflectSound();
    soundBtn.addEventListener("click", ()=>{
      soundBtn.dataset.on = (soundBtn.dataset.on==="1"?"0":"1");
      localStorage.setItem(SOUND_LS, soundBtn.dataset.on==="1"?"1":"0");
      reflectSound();
    });

    // Notation roll + burst
    $("#skz-notation-roll")?.addEventListener("click", ()=>{
      const notation = $("#skz-notation").value;
      const parsed = parseNotation(notation);
      if(!parsed){ announce("Invalid notation"); return; }
      const count = parseInt($("#skz-burst").value,10) || 1;
      const totals = [];
      for(let i=0;i<count;i++){
        const r = parseNotation(notation); // re-roll each time
        totals.push(r.total);
      }
      const lastBody = $("#skz-last-body");
      const label = `${notation.toUpperCase()} ${parsed.modSrc?`( ${parsed.modSrc} ${fmtSigned(parsed.mod)} )`: (parsed.mod?fmtSigned(parsed.mod):"")}`.trim();
      if(count===1){
        lastBody.innerHTML = `${label}: rolls ${JSON.stringify(parsed.all)} ${parsed.dropped.length?`drop ${JSON.stringify(parsed.dropped)} → keep ${JSON.stringify(parsed.kept)} `:""}= <strong>${parsed.total}</strong>`;
        appendHistoryEntry(`${label} = ${parsed.total}`, parsed.total);
      }else{
        const min = Math.min(...totals), max = Math.max(...totals), avg = (totals.reduce((a,b)=>a+b,0)/totals.length).toFixed(2);
        lastBody.innerHTML = `${label} ×${count}: min <strong>${min}</strong> • avg <strong>${avg}</strong> • max <strong>${max}</strong> ${sparkline(totals)}`;
        appendHistoryEntry(`${label} ×${count}: [${totals.join(", ")}]`, null);
      }
      playTick();
      hydrateHistory();
    });

    // Macros
    const macroWrap = document.createElement("section");
    macroWrap.className="skz-macros";
    macroWrap.innerHTML = `
      <h3 class="skz-title" style="font-size:1.15rem;margin:0;">Macros</h3>
      <div class="skz-macro-list" id="skz-macro-list"></div>
      <div style="display:grid;grid-template-columns:140px 1fr auto;gap:8px;margin-top:8px">
        <input id="skz-macro-name" class="skz-input" placeholder="Name (e.g., Stealth)">
        <input id="skz-macro-notation" class="skz-input" placeholder="Notation (e.g., 1d20+DEX)">
        <button id="skz-macro-add" class="skz-btn" type="button">Add</button>
      </div>
    `;
    root.appendChild(macroWrap);
    initMacros();

    // Export controls
    const exportBar = document.createElement("div");
    exportBar.className="skz-export";
    exportBar.innerHTML = `
      <button id="skz-export-text" class="skz-ghost-btn" type="button">Copy Text</button>
      <button id="skz-export-csv" class="skz-ghost-btn" type="button">Copy CSV</button>
      <button id="skz-export-json" class="skz-ghost-btn" type="button">Copy JSON</button>
      <button id="skz-export-print" class="skz-ghost-btn" type="button">Print</button>
    `;
    root.appendChild(exportBar);
    bindExport();

    // Hotkeys: 1–7 increment die counts; R rolls; A/D/N changes mode; C copies last
    document.addEventListener("keydown",(e)=>{
      if(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const key = e.key.toLowerCase();
      const dieMap = { "1":4,"2":6,"3":8,"4":10,"5":12,"6":20,"7":100 };
      if(dieMap[key]){
        root.querySelector(`.skz-die[data-die="${dieMap[key]}"]`)?.click(); // increments planned count
      }else if(key==="r"){
        $("#skz-roll-selected")?.click();
      }else if(key==="a"||key==="d"||key==="n"){
        const v = key==="a"?2:key==="d"?0:1;
        const slider = $("#skz-mode", root);
        slider.value = String(v); slider.dispatchEvent(new Event("input"));
      }else if(key==="c"){
        $("#skz-copy-last")?.click();
      }
    });

    // a11y live region
    if(!document.getElementById("skz-live")){
      const live = document.createElement("div");
      live.id="skz-live"; live.className="sr-only"; live.setAttribute("aria-live","polite");
      root.appendChild(live);
    }

    hydrateHistory();
  }

  /* ================= LEFT: Attribute Roller ================= */
  const ATTRS=["Strength","Intelligence","Constitution","Dexterity","Wisdom","Charisma"];
  const ABBR={Strength:"STR", Intelligence:"INT", Constitution:"CON", Dexterity:"DEX", Wisdom:"WIS", Charisma:"CHA"};
  const LS_ATTR="skzAttrV3"; // rolls + assignment (+ pool + locks)

  let attrState = {
    rolls: null,          // [{id, rolls, kept, dropped, total, isArray?}]
    assignment: null,     // [scoreIndex|null] length 6
    pool: [],             // scoreIndex[] not assigned
    locks: [false,false,false,false,false,false], // per row
    selectedAttr: null
  };

  function roll4d6DropLowest(){
    const r=[rollDie(6),rollDie(6),rollDie(6),rollDie(6)];
    const min=Math.min(...r), idx=r.indexOf(min);
    const kept=r.slice(0,idx).concat(r.slice(idx+1));
    return {rolls:r, kept, dropped:min, total:sum(kept)};
  }
  function genSix(){ return Array.from({length:6},(_,i)=>({id:i,...roll4d6DropLowest()})); }

  function attrSave(){ try{ localStorage.setItem(LS_ATTR, JSON.stringify(attrState)); }catch{} }
  function attrLoad(){ try{ return JSON.parse(localStorage.getItem(LS_ATTR)||"null") }catch{ return null } }

  function renderAttr(){
    const tbody=$("#skz-attr-tbody"); const pool=$("#skz-attr-pool"); const tools=$(".skz-attr-tools");
    if(!tbody||!pool||!tools) return;

    // Tools (once)
    if(!tools.dataset.inited){
      tools.dataset.inited="1";
      tools.innerHTML = `
        <button id="skz-attr-sort" class="skz-ghost-btn" type="button" title="Sort scores descending into unlocked abilities">Sort ↓</button>
        <button id="skz-attr-std" class="skz-ghost-btn" type="button" title="Use Standard Array (15,14,13,12,10,8)">Standard Array</button>
        <button id="skz-attr-export-mods" class="skz-ghost-btn" type="button" title="Copy assigned with modifiers">Copy with mods</button>
        <span class="skz-badge">Unlocked rows will be changed by Sort/Array</span>
      `;
      $("#skz-attr-sort").addEventListener("click", sortDescIntoUnlocked);
      $("#skz-attr-std").addEventListener("click", useStandardArray);
      $("#skz-attr-export-mods").addEventListener("click", copyWithMods);
    }

    // Pool
    pool.innerHTML="";
    attrState.pool.forEach(idx=>{
      const sc = attrState.rolls[idx];
      const card = document.createElement("div");
      card.className="skz-pool-card";
      card.draggable=true;
      card.dataset.poolScore=String(idx);
      card.innerHTML = `<strong>${sc.total}</strong>${badgeChips(sc)}`;
      pool.appendChild(card);
    });

    // Table rows
    tbody.innerHTML="";
    ATTRS.forEach((name,rowIdx)=>{
      const tr=document.createElement("tr");
      const tdName=document.createElement("td");
      const lockBtn=document.createElement("button");
      lockBtn.className="skz-lock"+(attrState.locks[rowIdx]?" is-locked":"");
      lockBtn.textContent = attrState.locks[rowIdx]?"🔒":"🔓";
      lockBtn.title="Lock/unlock this ability";
      lockBtn.addEventListener("click",()=>{
        attrState.locks[rowIdx]=!attrState.locks[rowIdx];
        lockBtn.classList.toggle("is-locked", attrState.locks[rowIdx]);
        lockBtn.textContent = attrState.locks[rowIdx]?"🔒":"🔓";
        attrSave();
      });
      tdName.textContent = `${name} `;
      tdName.appendChild(lockBtn);

      const tdTotal=document.createElement("td");
      tdTotal.className="skz-attr-cell";
      tdTotal.dataset.attrIndex=String(rowIdx);

      const idx = attrState.assignment[rowIdx];
      if(idx==null){
        const ph = document.createElement("div");
        ph.className="skz-placeholder"; ph.textContent="Drop score here";
        tdTotal.appendChild(ph);
      }else{
        const sc = attrState.rolls[idx];
        const card = document.createElement("div");
        card.className="skz-card"; card.tabIndex=0; card.draggable=true;
        card.dataset.attrIndex=String(rowIdx); card.dataset.scoreId=String(sc.id);
        card.setAttribute("aria-label",`Score ${sc.total} for ${name}, drag to swap`);
        card.innerHTML = `<span class="skz-card-total"><strong>${sc.total}</strong></span>
                          <span class="skz-card-chips">${chipsHTML(sc)}</span>
                          <button class="skz-rebtn" title="Reroll this score" data-re="${sc.id}">⟲</button>`;
        tdTotal.appendChild(card);
      }

      tr.appendChild(tdName); tr.appendChild(tdTotal);
      tbody.appendChild(tr);
    });

    bindAttrDnD();
    // Reroll buttons
    document.querySelectorAll(".skz-rebtn").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const id = parseInt(btn.dataset.re,10);
        const i = attrState.rolls.findIndex(x=>x.id===id);
        if(i>=0){
          attrState.rolls[i] = {id, ...roll4d6DropLowest()};
          attrSave(); renderAttr();
        }
      });
    });

    // Pool drop target (unassign)
    pool.addEventListener("dragover", e=>{e.preventDefault();});
    pool.addEventListener("drop", e=>{
      e.preventDefault();
      const fromAttr = e.dataTransfer.getData("fromAttr");
      if(fromAttr!==""){
        const a = parseInt(fromAttr,10);
        const idx = attrState.assignment[a];
        if(idx!=null){
          attrState.assignment[a]=null;
          if(!attrState.pool.includes(idx)) attrState.pool.push(idx);
          attrSave(); renderAttr();
        }
      }
    });
  }

  function badgeChips(sc){
    if(sc.isArray) return ` <span class="skz-badge">Std</span>`;
    return `<span class="skz-badge">${sc.kept.join("+")}${sc.dropped!=null?` (drop ${sc.dropped})`:""}</span>`;
  }
  function chipsHTML(sc){
    if(sc.isArray) return `<span class="skz-chip">Std</span>`;
    return sc.kept.map(v=>`<span class="skz-chip">${v}</span>`).join("") + `<span class="skz-chip skz-chip--dropped">${sc.dropped}</span>`;
  }

  function bindAttrDnD(){
    const cards = document.querySelectorAll(".skz-card");
    const cells = document.querySelectorAll(".skz-attr-cell");

    cards.forEach(card=>{
      card.addEventListener("dragstart", e=>{
        e.dataTransfer.setData("fromAttr", String(card.dataset.attrIndex));
        e.dataTransfer.effectAllowed="move";
        card.classList.add("selected");
      });
      card.addEventListener("dragend", ()=>{
        card.classList.remove("selected");
        document.querySelectorAll(".skz-attr-cell.dragover").forEach(el=>el.classList.remove("dragover"));
      });
      // Click-to-swap
      card.addEventListener("click", ()=>{
        const from = Number(card.dataset.attrIndex);
        const prev = attrState.selectedAttr;
        document.querySelectorAll(".skz-card.selected").forEach(el=>{
          if(Number(el.dataset.attrIndex)!==from) el.classList.remove("selected");
        });
        if(prev==null){ attrState.selectedAttr=from; card.classList.add("selected"); }
        else if(prev===from){ attrState.selectedAttr=null; card.classList.remove("selected"); }
        else { swapAssignments(prev, from); attrState.selectedAttr=null; }
      });
      card.addEventListener("keydown", e=>{
        if(e.key==="Enter"||e.key===" "){ e.preventDefault(); card.click(); }
        else if(e.key==="Escape"){ attrState.selectedAttr=null; card.classList.remove("selected"); }
      });
    });

    cells.forEach(cell=>{
      cell.addEventListener("dragover", e=>{ e.preventDefault(); cell.classList.add("dragover"); });
      cell.addEventListener("dragleave", ()=> cell.classList.remove("dragover"));
      cell.addEventListener("drop", e=>{
        e.preventDefault(); cell.classList.remove("dragover");
        const toAttr = Number(cell.dataset.attrIndex);
        if(attrState.locks[toAttr]) return; // locked
        const fromAttrData = e.dataTransfer.getData("fromAttr");
        const fromPoolData = e.dataTransfer.getData("fromPool");

        if(fromAttrData!==""){ // swap between rows
          const fromAttr = Number(fromAttrData);
          if(fromAttr===toAttr) return;
          if(attrState.locks[fromAttr]) return;
          swapAssignments(fromAttr, toAttr);
        }else if(fromPoolData!==""){
          const scoreIdx = Number(fromPoolData);
          const prev = attrState.assignment[toAttr];
          attrState.assignment[toAttr] = scoreIdx;
          attrState.pool = attrState.pool.filter(i=>i!==scoreIdx);
          if(prev!=null) attrState.pool.push(prev);
          attrSave(); renderAttr();
        }
      });
    });

    // Pool card drag
    document.querySelectorAll("[data-pool-score]").forEach(card=>{
      card.addEventListener("dragstart", e=>{
        e.dataTransfer.setData("fromPool", String(card.dataset.poolScore));
        e.dataTransfer.effectAllowed="move";
      });
    });
  }

  function swapAssignments(a,b){
    const A=attrState.assignment[a], B=attrState.assignment[b];
    if(attrState.locks[a]||attrState.locks[b]) return;
    [attrState.assignment[a], attrState.assignment[b]] = [B,A];
    attrSave(); renderAttr();
  }

  function sortDescIntoUnlocked(){
    const allIdx = [...Array(attrState.rolls.length).keys()];
    const sorted = allIdx.sort((i,j)=>attrState.rolls[j].total - attrState.rolls[i].total);
    const result = [...attrState.assignment];
    const lockedSet = new Set();
    attrState.locks.forEach((v,i)=>{ if(v && result[i]!=null) lockedSet.add(result[i]); });
    const queue = sorted.filter(i=>!lockedSet.has(i));
    for(let i=0;i<result.length;i++){
      if(attrState.locks[i]) continue;
      result[i] = queue.shift() ?? null;
    }
    attrState.assignment = result;
    attrState.pool = queue;
    attrSave(); renderAttr();
  }

  function useStandardArray(){
    const arr = [15,14,13,12,10,8];
    attrState.rolls = arr.map((v,i)=>({id:i, rolls:[], kept:[], dropped:null, total:v, isArray:true}));
    attrState.assignment = [0,1,2,3,4,5];
    attrState.pool = [];
    attrSave(); renderAttr();
  }

  function copyWithMods(){
    const lines = ATTRS.map((name,i)=>{
      const idx = attrState.assignment[i];
      if(idx==null) return `${ABBR[name]} —`;
      const t = attrState.rolls[idx].total;
      const mod = Math.floor((t-10)/2);
      const sign = mod>=0?"+":"";
      return `${ABBR[name]} ${t} (${sign}${mod})`;
    }).join(", ");
    navigator.clipboard?.writeText(lines);
    announce("Copied with modifiers");
  }

  function initAttr(){
    const root = document.getElementById("skz-attr-roller"); if(!root) return;
    const saved = attrLoad();
    if(saved && saved.rolls && saved.assignment){
      attrState = Object.assign({locks:[false,false,false,false,false,false], pool:[]}, saved);
    }
    $("#skz-attr-generate")?.addEventListener("click", ()=>{
      const rolls = genSix();
      attrState = { rolls, assignment:[0,1,2,3,4,5], pool:[], locks:[false,false,false,false,false,false], selectedAttr:null };
      attrSave(); renderAttr();
    });
    $("#skz-attr-copy")?.addEventListener("click", ()=>{
      const line = ATTRS.map((n,i)=>{
        const idx = attrState.assignment?.[i];
        const t = (idx==null)?"—":attrState.rolls[idx].total;
        return `${ABBR[n]} ${t}`;
      }).join(", ");
      navigator.clipboard?.writeText(line);
      announce("Attributes copied");
    });
    $("#skz-attr-clear")?.addEventListener("click", ()=>{
      try{ localStorage.removeItem(LS_ATTR); }catch{}
      attrState = {rolls:null, assignment:null, pool:[], locks:[false,false,false,false,false,false], selectedAttr:null};
      $("#skz-attr-tbody").innerHTML = "";
      $("#skz-attr-pool").innerHTML = "";
    });
    renderAttr();
  }

  /* ================= Boot ================= */
  function boot(){ initCenter(); initAttr(); }
  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded", boot); } else { boot(); }

  /* ================= Helpers ================= */
  // Drag helper for pool cards
  document.addEventListener("dragstart", e=>{
    const el=e.target;
    if(!(el instanceof HTMLElement)) return;
    if(el.dataset.poolScore!=null){ e.dataTransfer.setData("fromPool", el.dataset.poolScore); }
  });
})();
