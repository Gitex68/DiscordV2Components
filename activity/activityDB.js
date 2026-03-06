// activity/activityDB.js
// Persistance JSON pour les statistiques d'activité
// Structure :
//   data.guilds[guildId] = {
//     voice        : { [userId]: { [channelId]: totalMs } }          ← cumulatif
//     messages     : { [userId]: { [channelId]: count } }            ← cumulatif
//     games        : { [userId]: { [gameName]: totalMs } }           ← cumulatif
//     msgDays      : { [YYYY-MM-DD]: count }                         ← messages serveur/jour
//     userMsgDays  : { [userId]: { [YYYY-MM-DD]: count } }           ← messages user/jour
//     voiceDays    : { [YYYY-MM-DD]: { [channelId]: ms } }           ← vocal serveur/jour
//     userVoiceDays: { [userId]: { [YYYY-MM-DD]: { [channelId]: ms } } } ← vocal user/jour
//     gameDays     : { [YYYY-MM-DD]: { [gameName]: ms } }            ← jeux serveur/jour
//     userGameDays : { [userId]: { [YYYY-MM-DD]: { [gameName]: ms } } }  ← jeux user/jour
//   }
//   data.voiceSessions[guildId][userId] = { channelId, startedAt }
//   data.gameSessions[guildId][userId]  = { game, startedAt }

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'activity_data.json');

let data = { guilds: {}, voiceSessions: {}, gameSessions: {} };

// ─── Chargement / sauvegarde ──────────────────────────────────────────────────
function load() {
  try {
    if (fs.existsSync(DB_PATH))
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    console.error('[ActivityDB] Erreur lecture:', e.message);
    data = { guilds: {}, voiceSessions: {}, gameSessions: {} };
  }
}

let _saveTimer = null;
function save() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(data), 'utf8'); }
    catch (e) { console.error('[ActivityDB] Erreur écriture:', e.message); }
  }, 2_000);
}

// ─── Helpers structure ────────────────────────────────────────────────────────
function guild(gid) {
  if (!data.guilds[gid])
    data.guilds[gid] = { voice: {}, messages: {}, games: {}, msgDays: {}, userMsgDays: {},
                         voiceDays: {}, userVoiceDays: {}, gameDays: {}, userGameDays: {} };
  // migrations douces
  if (!data.guilds[gid].userMsgDays)   data.guilds[gid].userMsgDays   = {};
  if (!data.guilds[gid].voiceDays)     data.guilds[gid].voiceDays     = {};
  if (!data.guilds[gid].userVoiceDays) data.guilds[gid].userVoiceDays = {};
  if (!data.guilds[gid].gameDays)      data.guilds[gid].gameDays      = {};
  if (!data.guilds[gid].userGameDays)  data.guilds[gid].userGameDays  = {};
  return data.guilds[gid];
}
function ensureObj(obj, ...keys) {
  let cur = obj;
  for (const k of keys) { if (!cur[k]) cur[k] = {}; cur = cur[k]; }
  return cur;
}

// ─── VOCAL ───────────────────────────────────────────────────────────────────
function voiceStart(guildId, userId, channelId) {
  ensureObj(data.voiceSessions, guildId);
  data.voiceSessions[guildId][userId] = { channelId, startedAt: Date.now() };
  save();
}

function voiceEnd(guildId, userId) {
  const session = data.voiceSessions[guildId]?.[userId];
  if (!session) return;
  const ms    = Date.now() - session.startedAt;
  const today = new Date().toISOString().slice(0, 10);
  const g     = guild(guildId);

  // Cumulatif
  ensureObj(g.voice, userId);
  g.voice[userId][session.channelId] = (g.voice[userId][session.channelId] || 0) + ms;

  // Bucket serveur/jour
  ensureObj(g.voiceDays, today);
  g.voiceDays[today][session.channelId] = (g.voiceDays[today][session.channelId] || 0) + ms;

  // Bucket user/jour
  ensureObj(g.userVoiceDays, userId, today);
  g.userVoiceDays[userId][today][session.channelId] =
    (g.userVoiceDays[userId][today][session.channelId] || 0) + ms;

  delete data.voiceSessions[guildId][userId];
  save();
}

/** Renvoie { [channelId]: totalMs } pour un user */
function getVoice(guildId, userId) {
  return guild(guildId).voice[userId] || {};
}

/** Renvoie { [userId]: totalMs } (toutes chaînes confondues) — classement serveur */
function getVoiceRanking(guildId) {
  const voiceMap = guild(guildId).voice;
  const totals = {};
  for (const [uid, channels] of Object.entries(voiceMap)) {
    totals[uid] = Object.values(channels).reduce((a, b) => a + b, 0);
  }
  return totals;
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
function addMessage(guildId, userId, channelId) {
  const g = guild(guildId);
  ensureObj(g.messages, userId);
  g.messages[userId][channelId] = (g.messages[userId][channelId] || 0) + 1;

  // compteur par jour (serveur global)
  const today = new Date().toISOString().slice(0, 10);
  g.msgDays[today] = (g.msgDays[today] || 0) + 1;

  // compteur par jour (par user — pour graphique personnel)
  ensureObj(g.userMsgDays, userId);
  g.userMsgDays[userId][today] = (g.userMsgDays[userId][today] || 0) + 1;

  save();
}

/** { [channelId]: count } pour un user */
function getMessages(guildId, userId) {
  return guild(guildId).messages[userId] || {};
}

/** { [userId]: total } — classement */
function getMessageRanking(guildId) {
  const msgMap = guild(guildId).messages;
  const totals = {};
  for (const [uid, channels] of Object.entries(msgMap)) {
    totals[uid] = Object.values(channels).reduce((a, b) => a + b, 0);
  }
  return totals;
}

// ─── JEUX ─────────────────────────────────────────────────────────────────────
function gameStart(guildId, userId, gameName) {
  ensureObj(data.gameSessions, guildId);
  // Si une session précédente existe, la fermer d'abord
  gameEnd(guildId, userId);
  data.gameSessions[guildId][userId] = { game: gameName, startedAt: Date.now() };
  save();
}

function gameEnd(guildId, userId) {
  const session = data.gameSessions[guildId]?.[userId];
  if (!session) return;
  const ms = Date.now() - session.startedAt;
  if (ms < 60_000) { // ignorer < 1 min
    delete data.gameSessions[guildId][userId];
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const g     = guild(guildId);

  // Cumulatif
  ensureObj(g.games, userId);
  g.games[userId][session.game] = (g.games[userId][session.game] || 0) + ms;

  // Bucket serveur/jour
  ensureObj(g.gameDays, today);
  g.gameDays[today][session.game] = (g.gameDays[today][session.game] || 0) + ms;

  // Bucket user/jour
  ensureObj(g.userGameDays, userId, today);
  g.userGameDays[userId][today][session.game] =
    (g.userGameDays[userId][today][session.game] || 0) + ms;

  delete data.gameSessions[guildId][userId];
  save();
}

/** { [gameName]: totalMs } pour un user */
function getGames(guildId, userId) {
  return guild(guildId).games[userId] || {};
}

/** { [gameName]: totalMs } — top jeux du serveur */
function getGameRankingServer(guildId) {
  const gamesMap = guild(guildId).games;
  const totals   = {};
  for (const userGames of Object.values(gamesMap)) {
    for (const [game, ms] of Object.entries(userGames)) {
      totals[game] = (totals[game] || 0) + ms;
    }
  }
  return totals;
}

/** { [userId]: totalMs (tous jeux confondus) } — classement joueurs */
function getPlayerRanking(guildId) {
  const gamesMap = guild(guildId).games;
  const totals   = {};
  for (const [uid, userGames] of Object.entries(gamesMap)) {
    totals[uid] = Object.values(userGames).reduce((a, b) => a + b, 0);
  }
  return totals;
}

// ─── LECTURES PAR PÉRIODE ────────────────────────────────────────────────────
// days = 0 → tout le cumulatif ; sinon N derniers jours depuis les buckets /jour

/** { [channelId]: ms } pour un user sur N jours (0 = tout) */
function getVoicePeriod(guildId, userId, days) {
  if (!days) return getVoice(guildId, userId);
  const g   = guild(guildId);
  const map = g.userVoiceDays[userId] || {};
  return _sumDays(map, days);
}

/** { [userId]: ms } classement vocal serveur sur N jours */
function getVoiceRankingPeriod(guildId, days) {
  if (!days) return getVoiceRanking(guildId);
  const g      = guild(guildId);
  const totals = {};
  const cutoff = _cutoffDate(days);
  for (const [uid, dayMap] of Object.entries(g.userVoiceDays || {})) {
    for (const [date, channels] of Object.entries(dayMap)) {
      if (date < cutoff) continue;
      for (const [ch, ms] of Object.entries(channels)) {
        totals[uid] = (totals[uid] || 0) + ms;
      }
    }
  }
  return totals;
}

/** { [channelId]: count } messages pour un user sur N jours */
function getMessagesPeriod(guildId, userId, days) {
  if (!days) return getMessages(guildId, userId);
  const g      = guild(guildId);
  const map    = g.userMsgDays[userId] || {};
  const cutoff = _cutoffDate(days);
  const totals = {};
  // userMsgDays = { date: count } (pas par salon) — on agrège sur msgDays par user
  // Note: on retourne un total global (pas par salon) car msgDays n'est pas décomposé par salon
  let total = 0;
  for (const [date, count] of Object.entries(map)) {
    if (date >= cutoff) total += count;
  }
  return { total };   // pseudo-map {total: n} pour compatibilité
}

/** Total messages user sur N jours */
function getUserMsgTotal(guildId, userId, days) {
  if (!days) {
    const m = getMessages(guildId, userId);
    return Object.values(m).reduce((a, b) => a + b, 0);
  }
  const g      = guild(guildId);
  const map    = g.userMsgDays[userId] || {};
  const cutoff = _cutoffDate(days);
  return Object.entries(map)
    .filter(([d]) => d >= cutoff)
    .reduce((a, [, n]) => a + n, 0);
}

/** { [userId]: count } classement messages sur N jours */
function getMessageRankingPeriod(guildId, days) {
  if (!days) return getMessageRanking(guildId);
  const g      = guild(guildId);
  const cutoff = _cutoffDate(days);
  const totals = {};
  for (const [uid, dayMap] of Object.entries(g.userMsgDays || {})) {
    for (const [date, count] of Object.entries(dayMap)) {
      if (date >= cutoff) totals[uid] = (totals[uid] || 0) + count;
    }
  }
  return totals;
}

/** { [gameName]: ms } pour un user sur N jours */
function getGamesPeriod(guildId, userId, days) {
  if (!days) return getGames(guildId, userId);
  const g   = guild(guildId);
  const map = g.userGameDays[userId] || {};
  return _sumDaysNested(map, days);
}

/** { [gameName]: ms } top jeux serveur sur N jours */
function getGameRankingServerPeriod(guildId, days) {
  if (!days) return getGameRankingServer(guildId);
  const g      = guild(guildId);
  const cutoff = _cutoffDate(days);
  const totals = {};
  for (const [, dayMap] of Object.entries(g.userGameDays || {})) {
    for (const [date, games] of Object.entries(dayMap)) {
      if (date < cutoff) continue;
      for (const [game, ms] of Object.entries(games)) {
        totals[game] = (totals[game] || 0) + ms;
      }
    }
  }
  return totals;
}

/** { [userId]: ms } classement joueurs sur N jours */
function getPlayerRankingPeriod(guildId, days) {
  if (!days) return getPlayerRanking(guildId);
  const g      = guild(guildId);
  const cutoff = _cutoffDate(days);
  const totals = {};
  for (const [uid, dayMap] of Object.entries(g.userGameDays || {})) {
    for (const [date, games] of Object.entries(dayMap)) {
      if (date < cutoff) continue;
      for (const ms of Object.values(games)) {
        totals[uid] = (totals[uid] || 0) + ms;
      }
    }
  }
  return totals;
}

// ─── Helpers internes ────────────────────────────────────────────────────────
function _cutoffDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return d.toISOString().slice(0, 10);
}

/** Somme { date: { key: ms } } → { key: ms } sur N jours */
function _sumDaysNested(dayMap, days) {
  const cutoff = _cutoffDate(days);
  const totals = {};
  for (const [date, inner] of Object.entries(dayMap)) {
    if (date < cutoff) continue;
    for (const [k, ms] of Object.entries(inner)) {
      totals[k] = (totals[k] || 0) + ms;
    }
  }
  return totals;
}

/** Somme { date: { key: ms } } → { key: ms } — alias */
function _sumDays(dayMap, days) { return _sumDaysNested(dayMap, days); }

// ─── Historique messages par jour (pour graphiques) ─────────────────────────

/** Messages serveur des N derniers jours — retourne [{date,count}] */
function getMessageHistory(guildId, days = 7) {
  const g   = guild(guildId);
  const res = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    res.push({ date: key, count: g.msgDays[key] || 0 });
  }
  return res;
}

/** Messages user des N derniers jours — retourne [{date,count}] */
function getUserMessageHistory(guildId, userId, days = 7) {
  const g   = guild(guildId);
  const map = g.userMsgDays[userId] || {};
  const res = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    res.push({ date: key, count: map[key] || 0 });
  }
  return res;
}

// ─── UTILITAIRES ─────────────────────────────────────────────────────────────
/** Formate une durée en ms → "2j 4h 30m" */
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

/** Trie un objet { key: number } et retourne les N premiers */
function topN(obj, n = 10) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/** Barre ASCII proportionnelle */
function asciiBar(value, max, width = 10) {
  if (max === 0) return '░'.repeat(width);
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

load();

module.exports = {
  voiceStart, voiceEnd,
  gameStart, gameEnd,
  addMessage,
  getVoice, getVoiceRanking,
  getMessages, getMessageRanking, getMessageHistory, getUserMessageHistory,
  getGames, getGameRankingServer, getPlayerRanking,
  // Lectures par période
  getVoicePeriod, getVoiceRankingPeriod,
  getMessagesPeriod, getUserMsgTotal, getMessageRankingPeriod,
  getGamesPeriod, getGameRankingServerPeriod, getPlayerRankingPeriod,
  fmtMs, topN, asciiBar,
  save,
};
