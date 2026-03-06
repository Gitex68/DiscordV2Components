// utils/tempVoiceDB.js — SQLite
'use strict';

const sql = require('./db.js');

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

const _insGuild = sql.prepare(
  'INSERT OR IGNORE INTO tempvoice_config (guild_id, enabled, hub_channel_id, category_id, default_limit, name_template, allow_rename, allow_limit, allow_lock) VALUES (?, 0, NULL, NULL, 0, ?, 1, 1, 1)'
);
const _selGuild = sql.prepare('SELECT * FROM tempvoice_config WHERE guild_id = ?');

const _insChan  = sql.prepare('INSERT OR IGNORE INTO tempvoice_channels (channel_id, guild_id, owner_id, private) VALUES (?, ?, ?, 0)');
const _selChan  = sql.prepare('SELECT * FROM tempvoice_channels WHERE channel_id = ?');
const _delChan  = sql.prepare('DELETE FROM tempvoice_channels WHERE channel_id = ?');
const _selGuildChans = sql.prepare('SELECT channel_id FROM tempvoice_channels WHERE guild_id = ?');

const COL_MAP = {
  enabled:      'enabled',
  hubChannelId: 'hub_channel_id',
  categoryId:   'category_id',
  defaultLimit: 'default_limit',
  nameTemplate: 'name_template',
  allowRename:  'allow_rename',
  allowLimit:   'allow_limit',
  allowLock:    'allow_lock',
};

function _ensure(guildId) {
  _insGuild.run(guildId, DEFAULT_CONFIG.nameTemplate);
}

function _rowToConfig(row) {
  if (!row) return { ...DEFAULT_CONFIG };
  return {
    enabled:      !!row.enabled,
    hubChannelId: row.hub_channel_id ?? null,
    categoryId:   row.category_id   ?? null,
    defaultLimit: row.default_limit  ?? 0,
    nameTemplate: row.name_template  ?? DEFAULT_CONFIG.nameTemplate,
    allowRename:  !!row.allow_rename,
    allowLimit:   !!row.allow_limit,
    allowLock:    !!row.allow_lock,
  };
}

function getConfig(guildId) {
  _ensure(guildId);
  return _rowToConfig(_selGuild.get(guildId));
}

function set(guildId, key, value) {
  _ensure(guildId);
  const col = COL_MAP[key];
  if (!col) throw new Error('[tempVoiceDB] Clé inconnue : ' + key);
  const v = typeof value === 'boolean' ? (value ? 1 : 0) : (value ?? null);
  sql.prepare('UPDATE tempvoice_config SET ' + col + ' = ? WHERE guild_id = ?').run(v, guildId);
}

function reset(guildId) {
  const d = DEFAULT_CONFIG;
  sql.prepare('UPDATE tempvoice_config SET enabled=0, hub_channel_id=NULL, category_id=NULL, default_limit=0, name_template=?, allow_rename=1, allow_limit=1, allow_lock=1 WHERE guild_id = ?')
     .run(d.nameTemplate, guildId);
}

function registerChannel(channelId, guildId, ownerId) {
  _insChan.run(channelId, guildId, ownerId);
}

function unregisterChannel(channelId) {
  _delChan.run(channelId);
}

function getChannel(channelId) {
  const row = _selChan.get(channelId);
  if (!row) return null;
  return { guildId: row.guild_id, ownerId: row.owner_id, private: !!row.private };
}

function isTempChannel(channelId) {
  return !!_selChan.get(channelId);
}

function setChannelOwner(channelId, ownerId) {
  sql.prepare('UPDATE tempvoice_channels SET owner_id = ? WHERE channel_id = ?').run(ownerId, channelId);
}

function setChannelPrivate(channelId, value) {
  sql.prepare('UPDATE tempvoice_channels SET private = ? WHERE channel_id = ?').run(value ? 1 : 0, channelId);
}

function getGuildChannels(guildId) {
  return _selGuildChans.all(guildId).map(r => r.channel_id);
}

module.exports = {
  getConfig, set, reset,
  registerChannel, unregisterChannel, getChannel, isTempChannel,
  setChannelOwner, setChannelPrivate, getGuildChannels,
  DEFAULT_CONFIG,
};
