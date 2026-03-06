// activity/activityDB.js — SQLite
'use strict';

const sql = require('../utils/db.js');

// ─── Prepared statements ─────────────────────────────────────────────────────

// voice cumulative
const _voiceUpsert = sql.prepare(`
  INSERT INTO activity_voice (guild_id, user_id, channel_id, total_ms)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id, channel_id) DO UPDATE SET total_ms = total_ms + excluded.total_ms
`);
const _voiceSel    = sql.prepare('SELECT channel_id, total_ms FROM activity_voice WHERE guild_id = ? AND user_id = ?');
const _voiceRank   = sql.prepare('SELECT user_id, SUM(total_ms) AS total FROM activity_voice WHERE guild_id = ? GROUP BY user_id');

// voice days (server)
const _vdayUpsert  = sql.prepare(`
  INSERT INTO activity_voice_days_server (guild_id, date, channel_id, total_ms)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(guild_id, date, channel_id) DO UPDATE SET total_ms = total_ms + excluded.total_ms
`);
// voice days (user)
const _uvdayUpsert = sql.prepare(`
  INSERT INTO activity_voice_days (guild_id, user_id, date, channel_id, total_ms)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id, date, channel_id) DO UPDATE SET total_ms = total_ms + excluded.total_ms
`);

// voice sessions
const _vsesIns  = sql.prepare('INSERT OR REPLACE INTO activity_voice_sessions (guild_id, user_id, channel_id, started_at) VALUES (?, ?, ?, ?)');
const _vsesSel  = sql.prepare('SELECT * FROM activity_voice_sessions WHERE guild_id = ? AND user_id = ?');
const _vsesDel  = sql.prepare('DELETE FROM activity_voice_sessions WHERE guild_id = ? AND user_id = ?');

// messages cumulative
const _msgUpsert = sql.prepare(`
  INSERT INTO activity_messages (guild_id, user_id, channel_id, count)
  VALUES (?, ?, ?, 1)
  ON CONFLICT(guild_id, user_id, channel_id) DO UPDATE SET count = count + 1
`);
const _msgSel   = sql.prepare('SELECT channel_id, count FROM activity_messages WHERE guild_id = ? AND user_id = ?');
const _msgRank  = sql.prepare('SELECT user_id, SUM(count) AS total FROM activity_messages WHERE guild_id = ? GROUP BY user_id');

// msg days (server)
const _mdayUpsert = sql.prepare(`
  INSERT INTO activity_msg_days_server (guild_id, date, count)
  VALUES (?, ?, 1)
  ON CONFLICT(guild_id, date) DO UPDATE SET count = count + 1
`);
// msg days (user)
const _umdayUpsert = sql.prepare(`
  INSERT INTO activity_msg_days (guild_id, user_id, date, count)
  VALUES (?, ?, ?, 1)
  ON CONFLICT(guild_id, user_id, date) DO UPDATE SET count = count + 1
`);

// games cumulative
const _gameUpsert = sql.prepare(`
  INSERT INTO activity_games (guild_id, user_id, game_name, total_ms)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id, game_name) DO UPDATE SET total_ms = total_ms + excluded.total_ms
`);
const _gameSel   = sql.prepare('SELECT game_name, total_ms FROM activity_games WHERE guild_id = ? AND user_id = ?');
const _gameRank  = sql.prepare('SELECT game_name, SUM(total_ms) AS total FROM activity_games WHERE guild_id = ? GROUP BY game_name');
const _playerRank = sql.prepare('SELECT user_id, SUM(total_ms) AS total FROM activity_games WHERE guild_id = ? GROUP BY user_id');

// game days (server)
const _gdayUpsert = sql.prepare(`
  INSERT INTO activity_game_days (guild_id, user_id, date, game_name, total_ms)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id, date, game_name) DO UPDATE SET total_ms = total_ms + excluded.total_ms
`);

// game sessions
const _gsesIns = sql.prepare('INSERT OR REPLACE INTO activity_game_sessions (guild_id, user_id, game_name, started_at) VALUES (?, ?, ?, ?)');
const _gsesSel = sql.prepare('SELECT * FROM activity_game_sessions WHERE guild_id = ? AND user_id = ?');
const _gsesDel = sql.prepare('DELETE FROM activity_game_sessions WHERE guild_id = ? AND user_id = ?');

// ─── VOCAL ────────────────────────────────────────────────────────────────────

function voiceStart(guildId, userId, channelId) {
  _vsesIns.run(guildId, userId, channelId, Date.now());
}

function voiceEnd(guildId, userId) {
  const ses = _vsesSel.get(guildId, userId);
  if (!ses) return;
  const ms    = Date.now() - ses.started_at;
  const today = new Date().toISOString().slice(0, 10);

  _voiceUpsert.run(guildId, userId, ses.channel_id, ms);
  _vdayUpsert.run(guildId, today, ses.channel_id, ms);
  _uvdayUpsert.run(guildId, userId, today, ses.channel_id, ms);
  _vsesDel.run(guildId, userId);
}

function getVoice(guildId, userId) {
  const rows = _voiceSel.all(guildId, userId);
  const out = {};
  for (const r of rows) out[r.channel_id] = r.total_ms;
  return out;
}

function getVoiceRanking(guildId) {
  const out = {};
  for (const r of _voiceRank.all(guildId)) out[r.user_id] = r.total;
  return out;
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

function addMessage(guildId, userId, channelId) {
  const today = new Date().toISOString().slice(0, 10);
  _msgUpsert.run(guildId, userId, channelId);
  _mdayUpsert.run(guildId, today);
  _umdayUpsert.run(guildId, userId, today);
}

function getMessages(guildId, userId) {
  const out = {};
  for (const r of _msgSel.all(guildId, userId)) out[r.channel_id] = r.count;
  return out;
}

function getMessageRanking(guildId) {
  const out = {};
  for (const r of _msgRank.all(guildId)) out[r.user_id] = r.total;
  return out;
}

// ─── JEUX ─────────────────────────────────────────────────────────────────────

function gameStart(guildId, userId, gameName) {
  gameEnd(guildId, userId); // ferme session précédente si existe
  _gsesIns.run(guildId, userId, gameName, Date.now());
}

function gameEnd(guildId, userId) {
  const ses = _gsesSel.get(guildId, userId);
  if (!ses) return;
  const ms = Date.now() - ses.started_at;
  if (ms < 60_000) { _gsesDel.run(guildId, userId); return; }
  const today = new Date().toISOString().slice(0, 10);
  _gameUpsert.run(guildId, userId, ses.game_name, ms);
  _gdayUpsert.run(guildId, userId, today, ses.game_name, ms);
  _gsesDel.run(guildId, userId);
}

function getGames(guildId, userId) {
  const out = {};
  for (const r of _gameSel.all(guildId, userId)) out[r.game_name] = r.total_ms;
  return out;
}

function getGameRankingServer(guildId) {
  const out = {};
  for (const r of _gameRank.all(guildId)) out[r.game_name] = r.total;
  return out;
}

function getPlayerRanking(guildId) {
  const out = {};
  for (const r of _playerRank.all(guildId)) out[r.user_id] = r.total;
  return out;
}

// ─── LECTURES PAR PÉRIODE ─────────────────────────────────────────────────────

function _cutoffDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return d.toISOString().slice(0, 10);
}

function getVoicePeriod(guildId, userId, days) {
  if (!days) return getVoice(guildId, userId);
  const cutoff = _cutoffDate(days);
  const rows = sql.prepare(
    'SELECT channel_id, SUM(total_ms) AS ms FROM activity_voice_days WHERE guild_id=? AND user_id=? AND date>=? GROUP BY channel_id'
  ).all(guildId, userId, cutoff);
  const out = {};
  for (const r of rows) out[r.channel_id] = r.ms;
  return out;
}

function getVoiceRankingPeriod(guildId, days) {
  if (!days) return getVoiceRanking(guildId);
  const cutoff = _cutoffDate(days);
  const rows = sql.prepare(
    'SELECT user_id, SUM(total_ms) AS total FROM activity_voice_days WHERE guild_id=? AND date>=? GROUP BY user_id'
  ).all(guildId, cutoff);
  const out = {};
  for (const r of rows) out[r.user_id] = r.total;
  return out;
}

function getMessagesPeriod(guildId, userId, days) {
  if (!days) return getMessages(guildId, userId);
  const cutoff = _cutoffDate(days);
  const row = sql.prepare(
    'SELECT SUM(count) AS total FROM activity_msg_days WHERE guild_id=? AND user_id=? AND date>=?'
  ).get(guildId, userId, cutoff);
  return { total: row?.total || 0 };
}

function getUserMsgTotal(guildId, userId, days) {
  if (!days) {
    const m = getMessages(guildId, userId);
    return Object.values(m).reduce((a, b) => a + b, 0);
  }
  const cutoff = _cutoffDate(days);
  const row = sql.prepare(
    'SELECT SUM(count) AS total FROM activity_msg_days WHERE guild_id=? AND user_id=? AND date>=?'
  ).get(guildId, userId, cutoff);
  return row?.total || 0;
}

function getMessageRankingPeriod(guildId, days) {
  if (!days) return getMessageRanking(guildId);
  const cutoff = _cutoffDate(days);
  const rows = sql.prepare(
    'SELECT user_id, SUM(count) AS total FROM activity_msg_days WHERE guild_id=? AND date>=? GROUP BY user_id'
  ).all(guildId, cutoff);
  const out = {};
  for (const r of rows) out[r.user_id] = r.total;
  return out;
}

function getGamesPeriod(guildId, userId, days) {
  if (!days) return getGames(guildId, userId);
  const cutoff = _cutoffDate(days);
  const rows = sql.prepare(
    'SELECT game_name, SUM(total_ms) AS ms FROM activity_game_days WHERE guild_id=? AND user_id=? AND date>=? GROUP BY game_name'
  ).all(guildId, userId, cutoff);
  const out = {};
  for (const r of rows) out[r.game_name] = r.ms;
  return out;
}

function getGameRankingServerPeriod(guildId, days) {
  if (!days) return getGameRankingServer(guildId);
  const cutoff = _cutoffDate(days);
  const rows = sql.prepare(
    'SELECT game_name, SUM(total_ms) AS total FROM activity_game_days WHERE guild_id=? AND date>=? GROUP BY game_name'
  ).all(guildId, cutoff);
  const out = {};
  for (const r of rows) out[r.game_name] = r.total;
  return out;
}

function getPlayerRankingPeriod(guildId, days) {
  if (!days) return getPlayerRanking(guildId);
  const cutoff = _cutoffDate(days);
  const rows = sql.prepare(
    'SELECT user_id, SUM(total_ms) AS total FROM activity_game_days WHERE guild_id=? AND date>=? GROUP BY user_id'
  ).all(guildId, cutoff);
  const out = {};
  for (const r of rows) out[r.user_id] = r.total;
  return out;
}

// ─── HISTORIQUE MESSAGES ──────────────────────────────────────────────────────

function getMessageHistory(guildId, days = 7) {
  const res = [];
  const now = new Date();
  const rows = sql.prepare(
    'SELECT date, count FROM activity_msg_days_server WHERE guild_id=? ORDER BY date'
  ).all(guildId);
  const byDate = {};
  for (const r of rows) byDate[r.date] = r.count;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    res.push({ date: key, count: byDate[key] || 0 });
  }
  return res;
}

function getUserMessageHistory(guildId, userId, days = 7) {
  const res = [];
  const now = new Date();
  const rows = sql.prepare(
    'SELECT date, count FROM activity_msg_days WHERE guild_id=? AND user_id=? ORDER BY date'
  ).all(guildId, userId);
  const byDate = {};
  for (const r of rows) byDate[r.date] = r.count;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    res.push({ date: key, count: byDate[key] || 0 });
  }
  return res;
}

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (!ms || ms < 60_000) return '< 1 min';
  const s  = Math.floor(ms / 1000);
  const m  = Math.floor(s / 60);
  const h  = Math.floor(m / 60);
  const d  = Math.floor(h / 24);
  const rm = m % 60;
  const rh = h % 24;
  if (d > 0)  return `${d}j ${rh}h ${rm}m`;
  if (rh > 0) return `${rh}h ${rm}m`;
  return `${rm}m`;
}

function topN(obj, n = 10) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function asciiBar(value, max, width = 10) {
  if (max === 0) return '░'.repeat(width);
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// no-op: SQLite writes are immediate (synchronous)
function save() {}

module.exports = {
  voiceStart, voiceEnd,
  gameStart, gameEnd,
  addMessage,
  getVoice, getVoiceRanking,
  getMessages, getMessageRanking, getMessageHistory, getUserMessageHistory,
  getGames, getGameRankingServer, getPlayerRanking,
  getVoicePeriod, getVoiceRankingPeriod,
  getMessagesPeriod, getUserMsgTotal, getMessageRankingPeriod,
  getGamesPeriod, getGameRankingServerPeriod, getPlayerRankingPeriod,
  fmtMs, topN, asciiBar,
  save,
};
