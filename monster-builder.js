// monster-builder.js — Skazka • Monster Statblock Builder (auto-calc saves + override)
(function(){
  const $  = (sel, root=document)=>root.querySelector(sel);
  const $$ = (sel, root=document)=>Array.from(root.querySelectorAll(sel));

  /* ========== Small helpers ========== */
  const mod    = (score)=> Math.floor((Number(score||0)-10)/2);
  const signed = (n)=> (n>=0?`+${n}`:`${n}`);
  const cap    = (s)=> s ? s.charAt(0).toUpperCase()+s.slice(1) : "";
  const num    = (v)=>{ const n=Number(v); return Number.isFinite(n)?n:0; };
  const slugify= (s)=> String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  // CR → PB
  function parseCR(s){
    if(!s) return null;
    s = String(s).trim();
    if (s.includes("/")){
      const [a,b] = s.split("/").map(Number);
      if (!a || !b) return null;
      return a/b;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function profByCR(crStr){
    const v = parseCR(crStr);
    if (v == null) return null;
    if (v <= 4)  return 2;
    if (v <= 8)  return 3;
    if (v <= 12) return 4;
    if (v <= 16) return 5;
    return 6;
  }
  function ordinal(n){
    const s=["th","st","nd","rd"], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]);
  }

  // AC / HP / Speed parsers (for Open5e export)
  function parseAC(s){
    if(!s) return {acVal: 10, acDesc: ""};
    const m = s.match(/(\d+)/);
    return { acVal: m? Number(m[1]) : 10, acDesc: (s.replace(/^\d+\s*/, "")||"").replace(/^[()]+|[()]+$/g,"").trim() };
  }
  function parseHP(s){
    if(!s) return {hpVal: 1, hdStr: ""};
    const mAvg = s.match(/^\s*(\d+)/);
    const mDice = s.match(/\(([^)]+)\)/);
    return { hpVal: mAvg? Number(mAvg[1]) : 1, hdStr: mDice? mDice[1].trim().replace(/\s+/g," ") : "" };
  }
  function parseSpeed(s){
    const out = {};
    if(!s){ out.walk = 30; return out; }
    s.split(",").forEach(part=>{
      const p = part.trim();
      const m = p.match(/^(?:(walk|burrow|climb|fly|swim))?\s*(\d+)\s*ft/i);
      if(m){ const key = (m[1]||"walk").toLowerCase(); out[key] = Number(m[2]); }
    });
    return out;
  }

  // passive Perception helper
  function ensurePassivePerceptionLine(senses, wisScore, skills){
    const auto = inputs.autoPassive?.checked;
    if (!auto) return senses;
    const wisMod = mod(wisScore);
    const profMatch = /Perception\s*\+([-\d]+)/i.exec(skills||"");
    const percMod = profMatch ? Number(profMatch[1]) : wisMod;
    const passive = 10 + percMod;
    if(/passive\s*Perception\s*\d+/i.test(senses||"")){
      return senses.replace(/passive\s*Perception\s*\d+/i, `passive Perception ${passive}`);
    }
    return [senses||"", `passive Perception ${passive}`].filter(Boolean).join(", ");
  }

  /* ========== Inputs & lists ========== */
  const inputs = {
    name: $("#name"),
    size: $("#size"),

    // Type (dropdown + optional custom + tags)
    typeMain: $("#typeMain"),
    typeCustom: $("#typeCustom"),
    typeTags: $("#typeTags"),

    // Alignment (dropdown)
    alignMain: $("#alignMain"),
    align: $("#align"), // legacy fallback if present

    ac: $("#ac"),
    hp: $("#hp"),
    speed: $("#speed"),
    cr: $("#cr"),

    // Abilities
    str: $("#str"), dex: $("#dex"), con: $("#con"),
    int: $("#int"), wis: $("#wis"), cha: $("#cha"),

    // Saving throws selectors + override + manual field
    save_str: $("#save_str"), save_dex: $("#save_dex"), save_con: $("#save_con"),
    save_int: $("#save_int"), save_wis: $("#save_wis"), save_cha: $("#save_cha"),
    saveOverride: $("#saveOverride"),
    saves: $("#saves"),

    // Other lines
    skills: $("#skills"),
    vuln: $("#vuln"), resist: $("#resist"), imm: $("#imm"),
    condImm: $("#condImm"),
    senses: $("#senses"),
    langs: $("#langs"),
    autoPassive: $("#autoPassive")
  };

  const lists = {
    traits: $("#traits"),
    actions: $("#actions"),
    bonus: $("#bonus"),
    reactions: $("#reactions"),
    legendary: $("#legendary"),
    lair: $("#lair")
  };

  /* ========== Type & Alignment helpers ========== */
  function getTypeParts(){
    let base = inputs.typeMain?.value || "Humanoid";
    if (base === "_custom_") base = (inputs.typeCustom?.value.trim() || "Humanoid");
    const tags = inputs.typeTags?.value.trim();
    const typeStr = tags ? `${base.toLowerCase()} (${tags})` : base.toLowerCase();
    return { base, tags, typeStr };
  }
  function reflectCustomType(){
    if(!inputs.typeMain || !inputs.typeCustom) return;
    const isCustom = inputs.typeMain.value === "_custom_";
    inputs.typeCustom.style.display = isCustom ? "" : "none";
  }
  inputs.typeMain?.addEventListener("change", ()=>{ reflectCustomType(); render(); });
  reflectCustomType();

  const ALIGN_CANON = new Set([
    "lawful good","neutral good","chaotic good",
    "lawful neutral","neutral","chaotic neutral",
    "lawful evil","neutral evil","chaotic evil",
    "unaligned","any alignment"
  ]);
  function getAlignment(){
    const raw = (inputs.alignMain?.value || inputs.align?.value || "").trim();
    if (!raw) return "unaligned";
    const lc = raw.toLowerCase();
    return ALIGN_CANON.has(lc) ? lc : lc || "unaligned";
  }

  /* ========== Saving Throws (auto by default, manual override) ========== */
  const ORDER = ["str","dex","con","int","wis","cha"];
  const LABEL = {str:"Str", dex:"Dex", con:"Con", int:"Int", wis:"Wis", cha:"Cha"};

  function getSaveMultipliers(){
    return {
      str: Number(inputs.save_str?.value||0),
      dex: Number(inputs.save_dex?.value||0),
      con: Number(inputs.save_con?.value||0),
      int: Number(inputs.save_int?.value||0),
      wis: Number(inputs.save_wis?.value||0),
      cha: Number(inputs.save_cha?.value||0),
    };
  }

  function parseManualSaves(str){
    const map = {};
    const extras = [];
    if (!str) return {map, extras};
    const parts = str.split(/[;,]/).map(s=>s.trim()).filter(Boolean);
    for(const p of parts){
      const m = p.match(/^(Str|Dex|Con|Int|Wis|Cha)\s*\+?\s*(-?\d+)$/i);
      if(m){
        const key = m[1].toLowerCase();
        map[key] = Number(m[2]);
      }else{
        extras.push(p);
      }
    }
    return {map, extras};
  }

  function computeFinalSaves(){
    const overrideOn = !!inputs.saveOverride?.checked;

    // Manual parsing (used in both modes)
    const manualRaw = inputs.saves?.value.trim() || "";
    const {map: manualMap, extras} = parseManualSaves(manualRaw);

    // If override is ON: use ONLY manual values
    if (overrideOn){
      const parts = [];
      for (const k of ORDER){
        if (manualMap[k] != null){
          parts.push(`${LABEL[k]} ${signed(manualMap[k])}`);
        }
      }
      if (extras.length) parts.push(extras.join(", "));
      return { map: manualMap, extras, line: parts.join(", ") };
    }

    // Otherwise: AUTO mode (default)
    const pb = profByCR(inputs.cr?.value) || 0;
    const mults = getSaveMultipliers();

    const autoMap = {};
    for(const k of ORDER){
      const m = Number(mults[k]||0);          // 0 none, 1 prof, 2 expertise
      if (m > 0){
        const abil = Number(inputs[k]?.value||0);
        autoMap[k] = mod(abil) + m * pb;
      }
    }

    // manual overrides take precedence per ability
    const finalMap = {...autoMap, ...manualMap};

    const parts = [];
    for(const k of ORDER){
      if(finalMap[k] != null){
        parts.push(`${LABEL[k]} ${signed(finalMap[k])}`);
      }
    }
    if (extras.length) parts.push(extras.join(", "));
    return { map: finalMap, extras, line: parts.join(", ") };
  }

  function reflectSaveOverride(){
    const on = !!inputs.saveOverride?.checked;
    [inputs.save_str, inputs.save_dex, inputs.save_con, inputs.save_int, inputs.save_wis, inputs.save_cha]
      .forEach(el => { if (el) el.disabled = on; });
  }
  inputs.saveOverride?.addEventListener("change", ()=>{ reflectSaveOverride(); render(); });
  reflectSaveOverride();

  /* ========== Repeaters (traits/actions/etc.) ========== */
  function addItem(where, kind){
    const container = lists[where];
    if(!container) return;
    const wrap = document.createElement("div");
    wrap.className = "sb-item";
    wrap.innerHTML = `
      <div class="sb-two">
        <input class="sb-input sb-title" placeholder="${cap(kind.slice(0, -1))} title (e.g., Multiattack)"/>
        <input class="sb-input sb-inline-note" placeholder="(optional inline note, e.g., Recharge 5–6)"/>
      </div>
      <textarea class="sb-input sb-body" placeholder="Rules text. For attacks, use the standard layout:
Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 12 (2d6 + 5) slashing damage."></textarea>
      <div style="display:flex; gap:8px; justify-content:flex-end">
        <button type="button" class="sb-ghost-btn sb-del">Delete</button>
      </div>
    `;
    wrap.querySelector(".sb-del").addEventListener("click", ()=>{ wrap.remove(); render(); });
    container.appendChild(wrap);
  }
  document.querySelectorAll("[data-add]").forEach(btn=>{
    btn.addEventListener("click", ()=> addItem(btn.dataset.add, btn.dataset.add));
  });

  /* ========== Attack Builder ========== */
  const atk = {
    name: $("#atk_name"), kind: $("#atk_kind"), ability: $("#atk_ability"),
    prof: $("#atk_prof"), bonusExtra: $("#atk_bonus_extra"),
    range: $("#atk_range"), targets: $("#atk_targets"),
    dice: $("#atk_dice"), addMod: $("#atk_add_mod"), dtype: $("#atk_dtype"),
    rider: $("#atk_rider"),
    previewBtn: $("#atk_preview"), addBtn: $("#atk_add_action"), out: $("#atk_preview_out")
  };
  function parseDice(ndx){
    const m = String(ndx||"").trim().match(/^(\d+)\s*d\s*(\d+)$/i);
    if(!m) return null;
    return {n: +m[1], x: +m[2]};
  }
  function diceAverage({n,x}){ return n * (x + 1) / 2; }
  function buildAttackLine(){
    if(!atk.kind) return "";
    const abilityKey = atk.ability.value;
    const abilityScore = Number(inputs[abilityKey.toLowerCase()]?.value || 0);
    const abilityMod = mod(abilityScore);
    const pb = atk.prof.checked ? (profByCR(inputs.cr?.value) || 0) : 0;
    const toHit = abilityMod + pb + (Number(atk.bonusExtra.value||0));
    const dice = parseDice(atk.dice.value);
    const addMod = atk.addMod.checked;
    if(!dice) return "Enter damage dice (e.g., 1d8).";
    const baseAvg = diceAverage(dice);
    const dmgAvg = Math.floor(baseAvg + (addMod ? abilityMod : 0));
    const dmgText = `${dmgAvg} (${dice.n}d${dice.x}${addMod?` ${signed(abilityMod)}`:""}) ${atk.dtype.value||"damage"}`;
    const reachRange = atk.range.value.trim() || "reach 5 ft.";
    const targets = atk.targets.value.trim() || "one target";
    const rider = atk.rider.value.trim();
    const kind = atk.kind.value;

    return `${kind}: ${signed(toHit)} to hit, ${reachRange}, ${targets}. ` +
           `Hit: ${dmgText}${rider?`, ${rider}`:""}.`;
  }
  function addAttackAsAction(){
    const name = atk.name.value.trim() || "Attack";
    const line = buildAttackLine();
    const wrap = document.createElement("div");
    wrap.className = "sb-item";
    wrap.innerHTML = `
      <div class="sb-two">
        <input class="sb-input sb-title" value="${escapeHtml(name)}"/>
        <input class="sb-input sb-inline-note" placeholder="(optional inline note)"/>
      </div>
      <textarea class="sb-input sb-body">${escapeHtml(line)}</textarea>
      <div style="display:flex; gap:8px; justify-content:flex-end">
        <button type="button" class="sb-ghost-btn sb-del">Delete</button>
      </div>
    `;
    wrap.querySelector(".sb-del").addEventListener("click", ()=>{ wrap.remove(); render(); });
    lists.actions?.appendChild(wrap);
    render();
  }
  atk.previewBtn?.addEventListener("click", ()=>{ if(atk.out) atk.out.textContent = buildAttackLine(); });
  atk.addBtn?.addEventListener("click", addAttackAsAction);

  /* ========== Spellcasting Helper ========== */
  const sc = {
    mode: $("#sc_mode"), ability: $("#sc_ability"), prof: $("#sc_prof"),
    level: $("#sc_level"), klass: $("#sc_class"),
    preparedWrap: $("#sc_prepared"), innateWrap: $("#sc_innate"),
    c0: $("#sc_c0"), s1: $("#sc_s1"), c1: $("#sc_c1"), s2: $("#sc_s2"), c2: $("#sc_c2"),
    s3: $("#sc_s3"), c3: $("#sc_c3"), higher: $("#sc_higher"),
    i_at: $("#si_atwill"), i1: $("#si_1"), i2: $("#si_2"), i3: $("#si_3"), iOther: $("#si_other"),
    insertBtn: $("#sc_insert_trait"), previewBtn: $("#sc_preview"), out: $("#sc_preview_out")
  };
  sc.mode?.addEventListener("change", ()=>{
    if(!sc.preparedWrap || !sc.innateWrap) return;
    sc.preparedWrap.style.display = sc.mode.value==="prepared" ? "" : "none";
    sc.innateWrap.style.display   = sc.mode.value==="innate"   ? "" : "none";
  });
  function scMath(){
    const ab = sc.ability?.value || "CHA";
    const m = mod(inputs[ab.toLowerCase()]?.value);
    const pb = sc.prof?.checked ? (profByCR(inputs.cr?.value)||0) : 0;
    return { dc: 8 + m + pb, atk: m + pb, mod: m, pb };
  }
  function buildSpellcastingBlock(){
    const {dc, atk} = scMath();
    const abilityName = ({INT:"Intelligence", WIS:"Wisdom", CHA:"Charisma"})[sc.ability?.value] || "Charisma";
    const name = inputs.name?.value.trim() || "The creature";

    if ((sc.mode?.value || "prepared") === "prepared"){
      const lvl = Number(sc.level?.value||1);
      const klass = sc.klass?.value.trim() || "wizard";
      const parts = [];
      if (sc.c0?.value.trim()) parts.push(`Cantrips (at will): ${sc.c0.value.trim()}`);
      if (sc.c1?.value.trim()) parts.push(`1st level (${sc.s1?.value.trim()||"—"} slots): ${sc.c1.value.trim()}`);
      if (sc.c2?.value.trim()) parts.push(`2nd level (${sc.s2?.value.trim()||"—"} slots): ${sc.c2.value.trim()}`);
      if (sc.c3?.value.trim()) parts.push(`3rd level (${sc.s3?.value.trim()||"—"} slots): ${sc.c3.value.trim()}`);
      if (sc.higher?.value.trim()) parts.push(sc.higher.value.trim());
      const pre = `${name} is a ${lvl}${ordinal(lvl)}-level spellcaster. Its spellcasting ability is ${abilityName} (spell save DC ${dc}, ${signed(atk)} to hit with spell attacks). The ${name.toLowerCase()} has the following ${klass} spells prepared:`;
      return `${pre}\n${parts.join("\n")}`;
    }else{
      const lines = [];
      if (sc.i_at?.value.trim()) lines.push(`At will: ${sc.i_at.value.trim()}`);
      if (sc.i1?.value.trim())   lines.push(`1/day each: ${sc.i1.value.trim()}`);
      if (sc.i2?.value.trim())   lines.push(`2/day each: ${sc.i2.value.trim()}`);
      if (sc.i3?.value.trim())   lines.push(`3/day each: ${sc.i3.value.trim()}`);
      if (sc.iOther?.value.trim()) lines.push(sc.iOther.value.trim());
      return `Innate Spellcasting. The ${name.toLowerCase()}'s spellcasting ability is ${abilityName} (spell save DC ${dc}, ${signed(atk)} to hit with spell attacks). It can innately cast the following spells, requiring no material components:\n${lines.join("\n")}`;
    }
  }
  sc.previewBtn?.addEventListener("click", ()=>{ if(sc.out) sc.out.textContent = buildSpellcastingBlock(); });
  sc.insertBtn?.addEventListener("click", ()=>{
    const block = buildSpellcastingBlock();
    const wrap = document.createElement("div");
    wrap.className = "sb-item";
    wrap.innerHTML = `
      <div class="sb-two">
        <input class="sb-input sb-title" value="${(sc.mode?.value==="innate")?"Innate Spellcasting":"Spellcasting"}"/>
        <input class="sb-input sb-inline-note" placeholder="(e.g., Pact Magic, psionics)"/>
      </div>
      <textarea class="sb-input sb-body">${escapeHtml(block)}</textarea>
      <div style="display:flex; gap:8px; justify-content:flex-end">
        <button type="button" class="sb-ghost-btn sb-del">Delete</button>
      </div>
    `;
    wrap.querySelector(".sb-del").addEventListener("click", ()=>{ wrap.remove(); render(); });
    lists.traits?.appendChild(wrap);
    render();
  });

  /* ========== WotC Text Export ========== */
  function xpByCR(crStr){
    const t = {
      "0":"0", "1/8":"25", "1/4":"50", "1/2":"100",
      "1":"200","2":"450","3":"700","4":"1100","5":"1800","6":"2300","7":"2900","8":"3900",
      "9":"5000","10":"5900","11":"7200","12":"8400","13":"10000","14":"11500","15":"13000","16":"15000",
      "17":"18000","18":"20000","19":"22000","20":"25000","21":"33000","22":"41000","23":"50000","24":"62000",
      "25":"75000","26":"90000","27":"105000","28":"120000","29":"135000","30":"155000"
    };
    const s = String(crStr||"").trim();
    return t[s] ? `${t[s]} XP` : "";
  }

  function sectionFromList(title, preface, container){
    const blocks = $$(".sb-item", container||document).map(el=>{
      const title = el.querySelector(".sb-title")?.value.trim() || "";
      const note  = el.querySelector(".sb-inline-note")?.value.trim() || "";
      const body  = el.querySelector(".sb-body")?.value.trim() || "";
      const head  = title ? `${title}${note?`. ${note}`:""}` : "";
      return [head, body].filter(Boolean).join("\n");
    }).filter(Boolean);
    if (!blocks.length && !preface) return "";
    const header = title ? `${title}\n` : "";
    const pre = preface ? `${preface}\n` : "";
    return `${header}${pre}${blocks.join("\n\n")}`;
  }

  function buildText(){
    const name  = inputs.name?.value.trim() || "Unnamed Creature";
    const size  = inputs.size?.value.trim() || "Medium";
    const { typeStr } = getTypeParts();
    const align = getAlignment();
    const ac    = inputs.ac?.value.trim() || "12";
    const hp    = inputs.hp?.value.trim() || "11 (2d8)";
    const speed = inputs.speed?.value.trim() || "30 ft.";
    const cr    = inputs.cr?.value.trim() || "";
    const pb    = profByCR(cr);

    const abilities = ["str","dex","con","int","wis","cha"].map(k => {
      const score = Number(inputs[k]?.value||0);
      return `${String(score)} (${signed(mod(score))})`;
    }).join("  ");

    const skills = inputs.skills?.value.trim() || "";
    const vuln   = inputs.vuln?.value.trim() || "";
    const resist = inputs.resist?.value.trim() || "";
    const imm    = inputs.imm?.value.trim() || "";
    const condImm= inputs.condImm?.value.trim() || "";
    const senses = ensurePassivePerceptionLine(inputs.senses?.value.trim(), inputs.wis?.value, inputs.skills?.value);
    const langs  = inputs.langs?.value.trim() || "—";

    const savesInfo = computeFinalSaves(); // uses override logic
    const savesLine = savesInfo.line;

    const head =
`${name}
${size} ${typeStr}, ${align}

Armor Class ${ac}
Hit Points ${hp}
Speed ${speed}

STR  DEX  CON  INT  WIS  CHA
${abilities}
${savesLine ? `\nSaving Throws ${savesLine}` : ""}${skills ? `\nSkills ${skills}` : ""}
${vuln ? `Damage Vulnerabilities ${vuln}\n` : ""}${resist ? `Damage Resistances ${resist}\n` : ""}${imm ? `Damage Immunities ${imm}\n` : ""}${condImm ? `Condition Immunities ${condImm}\n` : ""}Senses ${senses}
Languages ${langs}
Challenge ${cr || "—"}${cr ? ` (${xpByCR(cr)})` : ""}${pb!=null?`\nProficiency Bonus ${signed(pb)}`:""}`;

    const traits    = sectionFromList("","", lists.traits);
    const actions   = sectionFromList("Actions","", lists.actions);
    const bonus     = sectionFromList("Bonus Actions","", lists.bonus);
    const reactions = sectionFromList("Reactions","", lists.reactions);
    const legendary = sectionFromList("Legendary Actions","", lists.legendary);
    const lair      = sectionFromList("Lair Actions","", lists.lair);

    return [head, traits, actions, bonus, reactions, legendary, lair]
      .filter(Boolean)
      .join("\n\n")
      .replace(/\n{3,}/g,"\n\n");
  }

  /* ========== Open5e JSON Export ========== */
  function blocksToArray(container, includeAttackMeta=false){
    return $$(".sb-item", container||document).map(el=>{
      const name = el.querySelector(".sb-title")?.value.trim() || "";
      const inline = el.querySelector(".sb-inline-note")?.value.trim() || "";
      const body = el.querySelector(".sb-body")?.value.trim() || "";
      const desc = (inline ? `${inline}. ` : "") + body;
      const out = { name: name || "Feature", desc };
      if (includeAttackMeta){
        const mAtk = body.match(/to hit,.*?Hit:\s*\d+\s*\((\d+)d(\d+)(\s*[+\-]\s*\d+)?\)/i);
        const mBon = body.match(/:\s*([+\-]?\d+)\s*to hit/i);
        if (mAtk){ out.damage_dice = `${mAtk[1]}d${mAtk[2]}${(mAtk[3]||"").replace(/\s+/g,"")}`; }
        if (mBon){ out.attack_bonus = Number(mBon[1]); }
      }
      return out;
    });
  }

  function toOpen5e(){
    const name = inputs.name?.value.trim() || "Unnamed Creature";
    const size = cap(inputs.size?.value.trim() || "Medium");
    const tp   = getTypeParts();
    const alignment = getAlignment();
    const {acVal, acDesc} = parseAC(inputs.ac?.value.trim());
    const {hpVal, hdStr}  = parseHP(inputs.hp?.value.trim());
    const speedObj = parseSpeed(inputs.speed?.value.trim());
    const crStr = inputs.cr?.value.trim() || "—";
    const crNum = parseCR(crStr);

    const skillsObj = {};
    (inputs.skills?.value||"").split(",").forEach(part=>{
      const m = part.trim().match(/^([A-Za-z ]+)\s*\+?(-?\d+)/);
      if(m){ skillsObj[m[1].trim().toLowerCase()] = Number(m[2]); }
    });

    const savesFinal = computeFinalSaves().map;

    const specials  = blocksToArray(lists.traits);
    const actions   = blocksToArray(lists.actions, true);
    const bonus     = blocksToArray(lists.bonus);
    const reactions = blocksToArray(lists.reactions);
    const legendary = blocksToArray(lists.legendary);

    return {
      slug: slugify(name),
      name,
      size,
      type: tp.base.toLowerCase(),
      subtype: tp.tags || "",
      group: null,
      alignment,
      armor_class: acVal,
      armor_desc: acDesc || "",
      hit_points: hpVal,
      hit_dice: hdStr || "",
      speed: speedObj,
      strength: num(inputs.str?.value), dexterity: num(inputs.dex?.value), constitution: num(inputs.con?.value),
      intelligence: num(inputs.int?.value), wisdom: num(inputs.wis?.value), charisma: num(inputs.cha?.value),

      strength_save:   (savesFinal.str ?? null),
      dexterity_save:  (savesFinal.dex ?? null),
      constitution_save:(savesFinal.con ?? null),
      intelligence_save:(savesFinal.int ?? null),
      wisdom_save:     (savesFinal.wis ?? null),
      charisma_save:   (savesFinal.cha ?? null),

      perception: null,
      skills: Object.keys(skillsObj).length ? skillsObj : {},
      damage_vulnerabilities: inputs.vuln?.value.trim() || "",
      damage_resistances:    inputs.resist?.value.trim() || "",
      damage_immunities:     inputs.imm?.value.trim() || "",
      condition_immunities:  inputs.condImm?.value.trim() || "",
      senses: ensurePassivePerceptionLine(inputs.senses?.value.trim(), inputs.wis?.value, inputs.skills?.value),
      languages: inputs.langs?.value.trim() || "—",
      challenge_rating: String(crStr),
      cr: crNum ?? null,
      actions,
      bonus_actions: bonus.length ? bonus : null,
      reactions: reactions.length ? reactions : null,
      legendary_desc: "",
      legendary_actions: legendary.length ? legendary : null,
      special_abilities: specials,
      spell_list: [],
      page_no: null,
      environments: [],
      img_main: null,
      document__slug: "homebrew",
      document__title: "Homebrew",
      document__license_url: "",
      document__url: ""
    };
  }

  /* ========== UI wiring: preview & export & autosave ========== */
  function render(){ const out=$("#previewOut"); if(out) out.textContent = buildText(); }

  // live updates
  document.querySelectorAll("#sb-builder input, #sb-builder select, #sb-builder textarea")
    .forEach(el=> el.addEventListener("input", render));

  // copy / download
  function flash(sel, msg){
    const btn = $(sel);
    if(!btn) return;
    const old = btn.textContent;
    btn.textContent = msg;
    setTimeout(()=> btn.textContent = old, 900);
  }
  function download(filename, text){
    const blob = new Blob([text], {type: "text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  $("#copyText")?.addEventListener("click", ()=>{
    const text = buildText();
    navigator.clipboard?.writeText(text);
    flash("#copyText","Copied!");
  });
  $("#downloadTxt")?.addEventListener("click", ()=>{
    download("monster.txt", buildText());
  });

  // Builder JSON save/load
  const LS_KEY = "skzMonsterBuilderV1";
  function serializeState(){
    const state = {};
    for (const [k, el] of Object.entries(inputs)){
      if (!el) continue;
      if (el.type === "checkbox") state[k] = el.checked;
      else state[k] = el.value;
    }
    for (const key of Object.keys(lists)){
      const container = lists[key];
      state[key] = $$(".sb-item", container||document).map(el=>({
        title: el.querySelector(".sb-title")?.value || "",
        inline: el.querySelector(".sb-inline-note")?.value || "",
        body: el.querySelector(".sb-body")?.value || ""
      }));
    }
    // helpers snapshot (kept minimal)
    state._helpers = {
      attack: {
        name: $("#atk_name")?.value, kind: $("#atk_kind")?.value, ability: $("#atk_ability")?.value, prof: !!$("#atk_prof")?.checked,
        bonusExtra: $("#atk_bonus_extra")?.value, range: $("#atk_range")?.value, targets: $("#atk_targets")?.value,
        dice: $("#atk_dice")?.value, addMod: !!$("#atk_add_mod")?.checked, dtype: $("#atk_dtype")?.value, rider: $("#atk_rider")?.value
      },
      spellcasting: {
        mode: $("#sc_mode")?.value, ability: $("#sc_ability")?.value, prof: !!$("#sc_prof")?.checked,
        level: $("#sc_level")?.value, klass: $("#sc_class")?.value,
        c0: $("#sc_c0")?.value, s1: $("#sc_s1")?.value, c1: $("#sc_c1")?.value,
        s2: $("#sc_s2")?.value, c2: $("#sc_c2")?.value, s3: $("#sc_s3")?.value, c3: $("#sc_c3")?.value, higher: $("#sc_higher")?.value,
        i_at: $("#si_atwill")?.value, i1: $("#si_1")?.value, i2: $("#si_2")?.value, i3: $("#si_3")?.value, iOther: $("#si_other")?.value
      }
    };
    return state;
  }
  function hydrateFromState(state){
    if(!state) return;
    for (const [k, v] of Object.entries(state)){
      if (k in inputs && inputs[k]){
        const el = inputs[k];
        if (el.type === "checkbox") el.checked = !!v; else el.value = v ?? el.value;
      }
    }
    reflectCustomType();

    for (const key of Object.keys(lists)){
      const container = lists[key];
      if(!container) continue;
      container.innerHTML = "";
      (state?.[key] || []).forEach(item=>{
        addItem(key, key);
        const last = container.lastElementChild;
        if(!last) return;
        last.querySelector(".sb-title").value        = item.title || "";
        last.querySelector(".sb-inline-note").value  = item.inline || "";
        last.querySelector(".sb-body").value         = item.body || "";
      });
    }

    // show correct spellcasting section
    const pre = $("#sc_prepared"), inn = $("#sc_innate"), modeSel = $("#sc_mode");
    if(pre && inn && modeSel){
      pre.style.display = modeSel.value==="prepared" ? "" : "none";
      inn.style.display = modeSel.value==="innate"   ? "" : "none";
    }

    reflectSaveOverride();
    render();
  }

  // Auto-load last draft, autosave
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) hydrateFromState(JSON.parse(saved));
  } catch {}
  document.addEventListener("input", ()=>{
    try{ localStorage.setItem(LS_KEY, JSON.stringify(serializeState())); }catch{}
  });

  // Manual Download/Import of JSON
  $("#downloadJson")?.addEventListener("click", ()=>{
    const state = serializeState();
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "monster-builder.json"; a.click();
    URL.revokeObjectURL(url);
  });
  $("#importJsonBtn")?.addEventListener("click", ()=> $("#importJsonFile")?.click());
  $("#importJsonFile")?.addEventListener("change", async (e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    try{
      const text = await file.text();
      const state = JSON.parse(text);
      hydrateFromState(state);
      const btn = $("#importJsonBtn"); if(btn){ const t=btn.textContent; btn.textContent="Imported!"; setTimeout(()=>btn.textContent=t, 900); }
    }catch{
      alert("Could not import JSON. Check the file and try again.");
    }finally{
      e.target.value = "";
    }
  });

  // Open5e JSON export
  $("#downloadO5e")?.addEventListener("click", ()=>{
    const o = toOpen5e();
    const blob = new Blob([JSON.stringify(o, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "monster.open5e.json"; a.click();
    URL.revokeObjectURL(url);
  });

  // Copy WotC text
  $("#copyText")?.addEventListener("click", ()=>{
    const text = buildText();
    navigator.clipboard?.writeText(text);
  });

  // One default Action row on first visit
  if (!lists.actions?.children.length) addItem("actions", "actions");

  // Initial render
  render();
})();
