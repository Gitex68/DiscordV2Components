// utils/counterDB.js — SQLite
'use strict';

const sql = require('./db.js');

const TYPES = {
  MEMBERS: 'members',
  BOTS:    'bots',
  HUMANS:  'humans',
  ONLINE:  'online',
  ROLES:   'roles',
  CHANNELS:'channels',
};

const _ins = sql.prepare(
  'INSERT OR IGNORE INTO counters (guild_id, type, channel_id, template, current_name, previous_name) VALUES (?, ?, NULL, NULL, NULL, NULL)'
);
const _sel  = sql.prepare('SELECT * FROM counters WHERE guild_id = ? AND type = ?');
const _selG = sql.prepare('SELECT * FROM counters WHERE guild_id = ?');
const _selA = sql.prepare('SELECT * FROM counters');
const _del  = sql.prepare('DELETE FROM counters WHERE guild_id = ? AND type = ?');
const _delG = sql.prepare('DELETE FROM counters WHERE guild_id = ?');

function _rowToCounter(row) {
  return {
    channelId:    row.channel_id    ?? null,
    template:     row.template      ?? null,
    currentName:  row.current_name  ?? null,
    previousName: row.previous_name ?? null,
  };
}

function getGuild(guildId) {
  const rows = _selG.all(guildId);
  const out = {};
  for (const row of rows) {
    out[row.type] = _rowToCounter(row);
  }
  return out;
}

function setCounter(guildId, type, { channelId = null, template = null } = {}) {
  _ins.run(guildId, type);
  sql.prepare('UPDATE counters SET channel_id = ?, template = ? WHERE guild_id = ? AND type = ?')
     .run(channelId, template, guildId, type);
}

function setChannelName(guildId, type, currentName, previousName) {
  _ins.run(guildId, type);
  sql.prepare('UPDATE counters SET current_name = ?, previous_name = ? WHERE guild_id = ? AND type = ?')
     .run(currentName, previousName, guildId, type);
}

function removeCounter(guildId, type) {
  _del.run(guildId, type);
}

function clearGuild(guildId) {
  _delG.run(guildId);
}

function getAllCounters() {
  const rows = _selA.all();
  const out = {};
  for (const row of rows) {
    if (!out[row.guild_id]) out[row.guild_id] = {};
    out[row.guild_id][row.type] = _rowToCounter(row);
  }
  return out;
}

module.exports = { getGuild, setCounter, setChannelName, removeCounter, clearGuild, getAllCounters, TYPES };
