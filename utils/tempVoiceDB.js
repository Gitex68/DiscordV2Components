// utils/tempVoiceDB.js
// Persistance JSON pour le système de salons vocaux temporaires.
//
// Structure :
//   data.guilds[guildId] = {
//     enabled:       boolean,         // Système activé/désactivé
//     hubChannelId:  string|null,      // Salon "hub" — rejoindre crée un salon perso
//     categoryId:    string|null,      // Catégorie dans laquelle créer les salons temp
//     defaultLimit:  number,           // Limite de membres par défaut (0 = illimitée)
//     nameTemplate:  string,           // Template ex: "🎮 {username}" → "{username}'s channel"
//     allowRename:   boolean,          // L'owner peut-il renommer son salon ?
//     allowLimit:    boolean,          // L'owner peut-il changer la limite ?
//     allowLock:     boolean,          // L'owner peut-il verrouiller son salon ?
//   }
//   data.channels[channelId] = {
//     guildId:  string,
//     ownerId:  string,
//     private:  boolean,
//   }

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/tempvoice_data.json');

let data = { guilds: {}, channels: {} };

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (!data.guilds)   data.guilds   = {};
      if (!data.channels) data.channels = {};
    }
  } catch (e) {
    console.error('[TempVoiceDB] Erreur de lecture:', e.message);
    data = { guilds: {}, channels: {} };
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[TempVoiceDB] Erreur de sauvegarde:', e.message);
  }
}

const DEFAULT_CONFIG = {
  enabled:      false,
  hubChannelId: null,
  categoryId:   null,
  defaultLimit: 0,
  nameTemplate: '🎮 {username}',
  allowRename:  true,
  allowLimit:   true,
  allowLock:    true,
};

// ─── Guild config ─────────────────────────────────────────────────────────────

function ensureGuild(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = { ...DEFAULT_CONFIG };
    save();
  }
  const cfg = data.guilds[guildId];
  for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
    if (cfg[k] === undefined) cfg[k] = v;
  }
}

function getConfig(guildId) {
  ensureGuild(guildId);
  return data.guilds[guildId];
}

function set(guildId, key, value) {
  ensureGuild(guildId);
  data.guilds[guildId][key] = value;
  save();
}

function reset(guildId) {
  data.guilds[guildId] = { ...DEFAULT_CONFIG };
  save();
}

// ─── Channel registry ─────────────────────────────────────────────────────────

function registerChannel(channelId, guildId, ownerId) {
  data.channels[channelId] = { guildId, ownerId, private: false };
  save();
}

function unregisterChannel(channelId) {
  if (data.channels[channelId]) {
    delete data.channels[channelId];
    save();
  }
}

function getChannel(channelId) {
  return data.channels[channelId] ?? null;
}

function isTempChannel(channelId) {
  return !!data.channels[channelId];
}

function setChannelOwner(channelId, ownerId) {
  if (data.channels[channelId]) {
    data.channels[channelId].ownerId = ownerId;
    save();
  }
}

function setChannelPrivate(channelId, value) {
  if (data.channels[channelId]) {
    data.channels[channelId].private = value;
    save();
  }
}

/** Retourne tous les channelIds enregistrés pour une guild */
function getGuildChannels(guildId) {
  return Object.entries(data.channels)
    .filter(([, v]) => v.guildId === guildId)
    .map(([id]) => id);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

load();

module.exports = {
  getConfig, set, reset,
  registerChannel, unregisterChannel, getChannel, isTempChannel,
  setChannelOwner, setChannelPrivate, getGuildChannels,
  DEFAULT_CONFIG,
};
