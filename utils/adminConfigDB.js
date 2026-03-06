// utils/adminConfigDB.js — SQLite
'use strict';

const sql = require('./db.js');

const DEFAULT_CONFIG = {
  adminRoleId: null,
  muteRoleId:  null,
  muteMode:    'timeout',
};

const _ins = sql.prepare(
  'INSERT OR IGNORE INTO admin_config (guild_id, admin_role_id, mute_role_id, mute_mode) VALUES (?, ?, ?, ?)'
);
const _sel = sql.prepare('SELECT * FROM admin_config WHERE guild_id = ?');

function _ensure(guildId) {
  _ins.run(guildId, null, null, 'timeout');
}

function getConfig(guildId) {
  _ensure(guildId);
  const row = _sel.get(guildId);
  return {
    adminRoleId: row.admin_role_id ?? null,
    muteRoleId:  row.mute_role_id  ?? null,
    muteMode:    row.mute_mode     ?? 'timeout',
  };
}

const COL_MAP = { adminRoleId: 'admin_role_id', muteRoleId: 'mute_role_id', muteMode: 'mute_mode' };

function setConfig(guildId, key, value) {
  _ensure(guildId);
  const col = COL_MAP[key];
  if (!col) throw new Error('[adminConfigDB] Clé inconnue : ' + key);
  sql.prepare('UPDATE admin_config SET ' + col + ' = ? WHERE guild_id = ?').run(value ?? null, guildId);
}

module.exports = { getConfig, setConfig, DEFAULT_CONFIG };
