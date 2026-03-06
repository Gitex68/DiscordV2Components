// utils/counterDB.js — Persistance JSON pour les salons compteurs dynamiques

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'counters.json');

// Types disponibles avec leurs templates par défaut
const TYPES = {
  members: { emoji: '👥', label: 'Membres',      defaultTemplate: '👥 Membres : {count}' },
  online:  { emoji: '🟢', label: 'En ligne',     defaultTemplate: '🟢 En ligne : {count}' },
  bots:    { emoji: '🤖', label: 'Bots',         defaultTemplate: '🤖 Bots : {count}'    },
  voice:   { emoji: '🔊', label: 'En vocal',     defaultTemplate: '🔊 En vocal : {count}' },
  boosts:  { emoji: '✨', label: 'Boosts',       defaultTemplate: '✨ Boosts : {count}'   },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function load() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DB_PATH)) return {};
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch { return {}; }
}

function save(data) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ─── API ──────────────────────────────────────────────────────────────────────

/** Retourne la config complète d'un serveur */
function getGuild(guildId) {
  const data = load();
  return data[guildId] ?? {};
}

/** Configure (ou remplace) un compteur pour un type donné */
function setCounter(guildId, type, channelId, template) {
  const data = load();
  if (!data[guildId]) data[guildId] = {};
  // Préserver currentName/previousName si le channelId ne change pas
  const prev = data[guildId][type] ?? {};
  data[guildId][type] = {
    channelId,
    template: template ?? TYPES[type]?.defaultTemplate ?? `${type}: {count}`,
    currentName:  (channelId === prev.channelId ? prev.currentName  : null) ?? null,
    previousName: (channelId === prev.channelId ? prev.previousName : null) ?? null,
  };
  save(data);
}

/**
 * Met à jour uniquement les champs currentName / previousName d'un compteur.
 * Appelé après chaque rename réussi pour garder une vérité persistée.
 */
function setChannelName(guildId, type, currentName, previousName) {
  const data = load();
  if (!data[guildId]?.[type]) return;
  data[guildId][type].previousName = previousName ?? data[guildId][type].currentName ?? null;
  data[guildId][type].currentName  = currentName;
  save(data);
}

/** Supprime un compteur pour un type donné */
function removeCounter(guildId, type) {
  const data = load();
  if (!data[guildId]) return;
  delete data[guildId][type];
  if (Object.keys(data[guildId]).length === 0) delete data[guildId];
  save(data);
}

/** Supprime tous les compteurs d'un serveur */
function clearGuild(guildId) {
  const data = load();
  delete data[guildId];
  save(data);
}

/** Retourne tous les guilds configurés */
function allGuilds() {
  return load();
}

module.exports = { TYPES, getGuild, setCounter, setChannelName, removeCounter, clearGuild, allGuilds };
