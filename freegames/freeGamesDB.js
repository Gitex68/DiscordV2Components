// freegames/freeGamesDB.js
// Persistance JSON pour la configuration du système "Jeux gratuits"
// Une config par guilde.
//
// Structure :
//   data.guilds[guildId] = {
//     enabled:       boolean,
//     channelId:     string|null,    // Salon où poster les annonces
//     pingRoleId:    string|null,    // Rôle à mentionner (null = pas de ping)
//     accessRoleId:  string|null,    // Rôle requis pour voir le salon (null = tout le monde)
//     sources: {
//       epic:  boolean,              // Activer les jeux gratuits Epic Games
//       steam: boolean,              // Activer les jeux gratuits Steam
//     },
//     postedEntries: [{ id: string, postedAt: number }],
//       // Historique daté des jeux postés. Les entrées > 2 semaines sont purgées
//       // automatiquement à chaque vérification.
//     checkInterval: number,         // Intervalle de vérification en heures (défaut: 6)
//     showExpiry:    boolean,        // Afficher la date de fin de gratuité
//     showDescription: boolean,      // Afficher la description du jeu
//   }

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'freegames_data.json');

let data = { guilds: {} };

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[FreeGamesDB] Erreur de lecture:', e.message);
    data = { guilds: {} };
  }
}

function save() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[FreeGamesDB] Erreur de sauvegarde:', e.message);
  }
}

const DEFAULT_CONFIG = {
  enabled:         false,
  channelId:       null,
  pingRoleId:      null,
  accessRoleId:    null,   // Rôle requis pour voir le salon (null = accès public)
  sources: {
    epic:  true,
    steam: true,
  },
  postedEntries:   [],   // [{ id: string, postedAt: timestamp }]
  checkInterval:   6,    // heures
  showExpiry:      true,
  showDescription: true,
};

function ensureGuild(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    save();
  }
  // Migrer les champs manquants (forward compat)
  const cfg = data.guilds[guildId];
  if (!cfg.sources)            { cfg.sources = { ...DEFAULT_CONFIG.sources }; }
  if (cfg.sources.epic  === undefined) cfg.sources.epic  = true;
  if (cfg.sources.steam === undefined) cfg.sources.steam = true;
  // Migration depuis l'ancien format postedIds (tableau de strings)
  if (Array.isArray(cfg.postedIds) && !cfg.postedEntries) {
    cfg.postedEntries = cfg.postedIds.map(id => ({ id, postedAt: Date.now() }));
    delete cfg.postedIds;
    save();
  }
  if (!Array.isArray(cfg.postedEntries)) cfg.postedEntries = [];
  if (cfg.checkInterval  === undefined) cfg.checkInterval  = 6;
  if (cfg.showExpiry     === undefined) cfg.showExpiry     = true;
  if (cfg.showDescription === undefined) cfg.showDescription = true;
  if (cfg.accessRoleId   === undefined) cfg.accessRoleId   = null;
}

// ─── Getters ──────────────────────────────────────────────────────────────────

function getConfig(guildId) {
  ensureGuild(guildId);
  return data.guilds[guildId];
}

function getAllGuilds() {
  return Object.keys(data.guilds);
}

function isEnabled(guildId) {
  ensureGuild(guildId);
  return data.guilds[guildId].enabled === true && !!data.guilds[guildId].channelId;
}

// ─── Setters ──────────────────────────────────────────────────────────────────

function set(guildId, key, value) {
  ensureGuild(guildId);
  data.guilds[guildId][key] = value;
  save();
}

function setSource(guildId, source, value) {
  ensureGuild(guildId);
  if (!data.guilds[guildId].sources) data.guilds[guildId].sources = {};
  data.guilds[guildId].sources[source] = value;
  save();
}

const TWO_WEEKS_MS = 14 * 24 * 3600 * 1000;

function purgeOldEntries(guildId) {
  ensureGuild(guildId);
  const cutoff = Date.now() - TWO_WEEKS_MS;
  const before  = data.guilds[guildId].postedEntries.length;
  data.guilds[guildId].postedEntries = data.guilds[guildId].postedEntries.filter(e => e.postedAt > cutoff);
  const after = data.guilds[guildId].postedEntries.length;
  if (before !== after) save();
  return before - after; // nombre d'entrées supprimées
}

function markPosted(guildId, id) {
  ensureGuild(guildId);
  const entries = data.guilds[guildId].postedEntries;
  if (!entries.some(e => e.id === id)) {
    entries.push({ id, postedAt: Date.now() });
    save();
  }
}

function isPosted(guildId, id) {
  ensureGuild(guildId);
  return data.guilds[guildId].postedEntries.some(e => e.id === id);
}

function resetPostedIds(guildId) {
  ensureGuild(guildId);
  data.guilds[guildId].postedEntries = [];
  save();
}

function reset(guildId) {
  data.guilds[guildId] = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  save();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

load();

module.exports = {
  getConfig, getAllGuilds, isEnabled,
  set, setSource, markPosted, isPosted, resetPostedIds, purgeOldEntries, reset,
  DEFAULT_CONFIG,
};
