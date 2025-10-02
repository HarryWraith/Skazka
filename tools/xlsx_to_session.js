// node tools/xlsx_to_session.js ./data/sessions/session_input.xlsx > session.json
// tools/xlsx_to_session.js
const XLSX = require("xlsx");
const fs = require("fs");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node xlsx_to_session.js <input.xlsx>");
  process.exit(1);
}

const wb = XLSX.readFile(file);
const asJSON = (name) =>
  XLSX.utils.sheet_to_json(wb.Sheets[name] || {}, { defval: "" });

const sessionRows = asJSON("Session");
if (!sessionRows.length) throw new Error("Session sheet is empty");
const s = sessionRows[0];

const partyStats = asJSON("PartyStats")[0] || {};
const coins = {
  pp: Number(partyStats.pp || 0),
  gp: Number(partyStats.gp || 0),
  sp: Number(partyStats.sp || 0),
  cp: Number(partyStats.cp || 0),
};

const roster = Object.fromEntries(
  asJSON("Characters").map((r) => [
    String(r.id || "").trim(),
    { id: String(r.id || "").trim(), name: String(r.name || "").trim() },
  ])
);

const charStats = {};
for (const row of asJSON("CharStats")) {
  const id = String(row.charId || "").trim();
  if (!id) continue;
  charStats[id] = {
    melee_hits: Number(row.melee_hits || 0),
    melee_misses: Number(row.melee_misses || 0),
    spell_hits: Number(row.spell_hits || 0),
    spell_misses: Number(row.spell_misses || 0),
    crits: Number(row.crits || 0),
    fumbles: Number(row.fumbles || 0),
    total_melee_dmg: Number(row.total_melee_dmg || 0),
    total_spell_dmg: Number(row.total_spell_dmg || 0),
    total_aoe_dmg: Number(row.total_aoe_dmg || 0),
    highest_dmg_dealt: Number(row.highest_dmg_dealt || 0),
    healing_received: Number(row.healing_received || 0),
    healing_delivered: Number(row.healing_delivered || 0),
    biggest_heal_delivered: Number(row.biggest_heal_delivered || 0),
    damage_taken: Number(row.damage_taken || 0),
    inspiration_awarded: Number(row.inspiration_awarded || 0),
    inspiration_used: Number(row.inspiration_used || 0),
    dm_facepalms: Number(row.dm_facepalms || 0),
    killing_blows: Number(row.killing_blows || 0),
    deaths: Number(row.deaths || 0),
    revives_received: Number(row.revives_received || 0),
    revives_delivered: Number(row.revives_delivered || 0),
    skill_checks_made: Number(row.skill_checks_made || 0),
    death_saves_failed: Number(row.death_saves_failed || 0),
    healing_potions_used: Number(row.healing_potions_used || 0),
  };
}

// inspiration logs (optional)
const insp = {
  awarded: asJSON("InspAwarded")
    .filter((r) => r.to)
    .map((r) => ({
      to: String(r.to).trim(),
      reason: String(r.reason || "").trim(),
    })),
  used: asJSON("InspUsed")
    .filter((r) => r.by)
    .map((r) => ({
      by: String(r.by).trim(),
      reason: String(r.reason || "").trim(),
    })),
};

const out = {
  id: String(s.id || "").trim(),
  date: String(s.date || "").trim(),
  title: String(s.title || "").trim(),
  arc_tags: String(s.arc_tags || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  party: String(s.party || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
  milestone_awarded: String(s.milestone_awarded).toLowerCase() === "true",
  summary_markdown: String(s.summary_markdown || ""),

  party_stats: {
    combat_encounters: Number(partyStats.combat_encounters || 0),
    opponents_defeated: Number(partyStats.opponents_defeated || 0),
    coins,
  },

  char_stats: charStats,
  inspiration: insp.awarded.length || insp.used.length ? insp : undefined,
};

// Pretty-print session JSON for appending into your sessions file
process.stdout.write(JSON.stringify(out, null, 2));
