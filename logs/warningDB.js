// logs/warningDB.js
// Persistance JSON des avertissements (warns) par guild/utilisateur.
// Structure :
//   data.guilds[guildId][userId] = [{ id, reason, moderatorId, date }, ...]

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'warnings_data.json');
let data = { guilds: {} };

function load() {
  try {
    if (fs.existsSync(DB_PATH)) data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch { data = { guilds: {} }; }
}

function save() {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8'); } catch {}
}

function ensureUser(guildId, userId) {
  if (!data.guilds[guildId]) data.guilds[guildId] = {};
  if (!data.guilds[guildId][userId]) data.guilds[guildId][userId] = [];
  return data.guilds[guildId][userId];
}

// Ajoute un warn, retourne le nouveau total
function addWarn(guildId, userId, moderatorId, reason) {
  const warns = ensureUser(guildId, userId);
  const id = warns.length ? Math.max(...warns.map(w => w.id)) + 1 : 1;
  warns.push({ id, reason, moderatorId, date: Date.now() });
  save();
  return warns.length;
}

// Retourne la liste des warns d'un user
function getWarns(guildId, userId) {
  ensureUser(guildId, userId);
  return data.guilds[guildId][userId];
}

// Supprime tous les warns d'un user
function clearWarns(guildId, userId) {
  ensureUser(guildId, userId);
  data.guilds[guildId][userId] = [];
  save();
}

// Supprime un warn spécifique par ID
function removeWarn(guildId, userId, warnId) {
  const warns = ensureUser(guildId, userId);
  const idx = warns.findIndex(w => w.id === warnId);
  if (idx === -1) return false;
  warns.splice(idx, 1);
  save();
  return true;
}

// Retourne les warns dans une fenêtre de temps (ms depuis maintenant)
function getWarnsInWindow(guildId, userId, windowMs) {
  const warns = ensureUser(guildId, userId);
  const since = Date.now() - windowMs;
  return warns.filter(w => w.date >= since);
}

load();

module.exports = { addWarn, getWarns, clearWarns, removeWarn, getWarnsInWindow };
