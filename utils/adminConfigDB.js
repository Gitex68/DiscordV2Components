// utils/adminConfigDB.js
// Persistance JSON pour la configuration des commandes admin par guilde.
//
// Structure :
//   data.guilds[guildId] = {
//     adminRoleId: string|null,   // Rôle ayant accès aux commandes adminOnly
//                                 // (en plus des membres avec ManageGuild)
//     muteRoleId:  string|null,   // Rôle attribué lors d'un .mute (méthode "rôle")
//     muteMode:    'timeout'|'role', // Méthode de mute : timeout Discord ou rôle custom
//   }

'use strict';

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/admin_config.json');

let data = { guilds: {} };

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[AdminConfigDB] Erreur lecture:', e.message);
    data = { guilds: {} };
  }
}

function save() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[AdminConfigDB] Erreur sauvegarde:', e.message);
  }
}

const DEFAULT_CONFIG = {
  adminRoleId: null,
  muteRoleId:  null,
  muteMode:    'timeout', // 'timeout' = Discord timeout | 'role' = attribution d'un rôle
};

function ensureGuild(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = { ...DEFAULT_CONFIG };
    save();
  }
  const cfg = data.guilds[guildId];
  if (cfg.adminRoleId === undefined) cfg.adminRoleId = null;
  if (cfg.muteRoleId  === undefined) cfg.muteRoleId  = null;
  if (cfg.muteMode    === undefined) cfg.muteMode    = 'timeout';
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

/**
 * Vérifie si un GuildMember a accès aux commandes admin.
 * Accès accordé si :
 *   - Il a la permission ManageGuild (admin Discord natif), OU
 *   - Il possède le rôle adminRoleId configuré pour cette guilde
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
function hasAdminAccess(member) {
  if (!member) return false;
  if (member.permissions.has('ManageGuild')) return true;
  const cfg = getConfig(member.guild.id);
  if (cfg.adminRoleId && member.roles.cache.has(cfg.adminRoleId)) return true;
  return false;
}

load();

module.exports = { getConfig, set, reset, hasAdminAccess, DEFAULT_CONFIG };
