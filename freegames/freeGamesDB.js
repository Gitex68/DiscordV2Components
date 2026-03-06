// freegames/freeGamesDB.js — SQLite
'use strict';

const sql = require('../utils/db.js');

const DEFAULT_CONFIG = {
  enabled:         false,
  channelId:       null,
  pingRoleId:      null,
  accessRoleId:    null,
  sources: {
    epic:  true,
    steam: true,
  },
  postedEntries:   [],
  checkInterval:   6,
  showExpiry:      true,
  showDescription: true,
};

const TWO_WEEKS_MS = 14 * 24 * 3600 * 1000;

const _ins = sql.prepare(
  'INSERT OR IGNORE INTO freegames_config (guild_id, config_json) VALUES (?, ?)'
);
const _sel = sql.prepare('SELECT * FROM freegames_config WHERE guild_id = ?');
const _selA = sql.prepare('SELECT guild_id FROM freegames_config');

function _ensure(guildId) {
  _ins.run(guildId, JSON.stringify({ ...DEFAULT_CONFIG, sources: { ...DEFAULT_CONFIG.sources }, postedEntries: [] }));
}

function _get(guildId) {
  _ensure(guildId);
  const row = _sel.get(guildId);
  const saved = row.config_json ? JSON.parse(row.config_json) : {};
  const cfg = { ...DEFAULT_CONFIG, ...saved };
  if (!cfg.sources)              cfg.sources = { ...DEFAULT_CONFIG.sources };
  if (cfg.sources.epic  === undefined) cfg.sources.epic  = true;
  if (cfg.sources.steam === undefined) cfg.sources.steam = true;
  if (!Array.isArray(cfg.postedEntries)) cfg.postedEntries = [];
  if (cfg.checkInterval   === undefined) cfg.checkInterval   = 6;
  if (cfg.showExpiry      === undefined) cfg.showExpiry      = true;
  if (cfg.showDescription === undefined) cfg.showDescription = true;
  if (cfg.accessRoleId    === undefined) cfg.accessRoleId    = null;
  return cfg;
}

function _save(guildId, cfg) {
  sql.prepare('UPDATE freegames_config SET config_json = ? WHERE guild_id = ?')
     .run(JSON.stringify(cfg), guildId);
}

// ─── API ─────────────────────────────────────────────────────────────────────

function getConfig(guildId)     { return _get(guildId); }
function getAllGuilds()          { return _selA.all().map(r => r.guild_id); }
function isEnabled(guildId)     { const c = _get(guildId); return c.enabled === true && !!c.channelId; }

function set(guildId, key, value) {
  const cfg = _get(guildId);
  cfg[key] = value;
  _save(guildId, cfg);
}

function setSource(guildId, source, value) {
  const cfg = _get(guildId);
  if (!cfg.sources) cfg.sources = {};
  cfg.sources[source] = value;
  _save(guildId, cfg);
}

function markPosted(guildId, id) {
  const cfg = _get(guildId);
  if (!cfg.postedEntries.some(e => e.id === id)) {
    cfg.postedEntries.push({ id, postedAt: Date.now() });
    _save(guildId, cfg);
  }
}

function isPosted(guildId, id) {
  return _get(guildId).postedEntries.some(e => e.id === id);
}

function purgeOldEntries(guildId) {
  const cfg = _get(guildId);
  const cutoff = Date.now() - TWO_WEEKS_MS;
  const before = cfg.postedEntries.length;
  cfg.postedEntries = cfg.postedEntries.filter(e => e.postedAt > cutoff);
  const after = cfg.postedEntries.length;
  if (before !== after) _save(guildId, cfg);
  return before - after;
}

function resetPostedIds(guildId) {
  const cfg = _get(guildId);
  cfg.postedEntries = [];
  _save(guildId, cfg);
}

function reset(guildId) {
  _ensure(guildId);
  _save(guildId, { ...DEFAULT_CONFIG, sources: { ...DEFAULT_CONFIG.sources }, postedEntries: [] });
}

module.exports = {
  getConfig, getAllGuilds, isEnabled,
  set, setSource, markPosted, isPosted, resetPostedIds, purgeOldEntries, reset,
  DEFAULT_CONFIG,
};
