// utils/mcDB.js — Base de données JSON pour le système Minecraft Status
'use strict';

const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'mc_data.json');

const DEFAULT_CONFIG = {
  enabled:           false,
  serverIp:          '',
  port:              25565,
  statusChannelId:   null,
  notificationRoleId: null,
  statusMessageId:   null,
  checkInterval:     60,      // secondes (15 | 30 | 60 | 120 | 300)
  faviconData:       null,    // data:image/png;base64,... — persisté entre redémarrages
  notifyJoin:        true,    // notifier joueur connecté
  notifyLeave:       true,    // notifier joueur déconnecté
  notifyOnline:      true,    // notifier serveur revenu en ligne
  notifyOffline:     true,    // notifier serveur hors ligne
  joinNotifDuration: 60,      // secondes avant suppression notif join
  leaveNotifDuration: 120,    // secondes avant suppression notif leave
};

function _load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function _save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getConfig(guildId) {
  const all = _load();
  return Object.assign({}, DEFAULT_CONFIG, all[guildId] ?? {});
}

function set(guildId, key, value) {
  const all = _load();
  if (!all[guildId]) all[guildId] = {};
  all[guildId][key] = value;
  _save(all);
}

function setMany(guildId, obj) {
  const all = _load();
  if (!all[guildId]) all[guildId] = {};
  Object.assign(all[guildId], obj);
  _save(all);
}

module.exports = { getConfig, set, setMany, DEFAULT_CONFIG };
