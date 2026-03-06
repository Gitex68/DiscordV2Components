// logs/warningDB.js — SQLite
'use strict';

const sql = require('../utils/db.js');

const _ins = sql.prepare(
  'INSERT INTO warnings (guild_id, user_id, moderator_id, reason, date) VALUES (?, ?, ?, ?, ?)'
);
const _selUser  = sql.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY date ASC');
const _delUser  = sql.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?');
const _delOne   = sql.prepare('DELETE FROM warnings WHERE id = ? AND guild_id = ? AND user_id = ?');

// Ajoute un warn, retourne le nouveau total
function addWarn(guildId, userId, moderatorId, reason) {
  _ins.run(guildId, userId, moderatorId, reason, Date.now());
  return _selUser.all(guildId, userId).length;
}

// Retourne la liste des warns d'un user
function getWarns(guildId, userId) {
  return _selUser.all(guildId, userId).map(r => ({
    id:          r.id,
    reason:      r.reason,
    moderatorId: r.moderator_id,
    date:        r.date,
  }));
}

// Supprime tous les warns d'un user
function clearWarns(guildId, userId) {
  _delUser.run(guildId, userId);
}

// Supprime un warn spécifique par ID (l'id est l'AUTOINCREMENT de SQLite)
function removeWarn(guildId, userId, warnId) {
  const info = _delOne.run(warnId, guildId, userId);
  return info.changes > 0;
}

// Retourne les warns dans une fenêtre de temps (ms depuis maintenant)
function getWarnsInWindow(guildId, userId, windowMs) {
  const since = Date.now() - windowMs;
  return _selUser.all(guildId, userId)
    .filter(r => r.date >= since)
    .map(r => ({ id: r.id, reason: r.reason, moderatorId: r.moderator_id, date: r.date }));
}

module.exports = { addWarn, getWarns, clearWarns, removeWarn, getWarnsInWindow };
