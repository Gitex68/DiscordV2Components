// logs/logDB.js — SQLite
'use strict';

const sql = require('../utils/db.js');

// ─── Catégories d'événements ──────────────────────────────────────────────────

const EVENT_CATEGORIES = {
  messages: {
    label: '💬 Messages',
    events: {
      messageDelete:         { label: '🗑️ Message supprimé',          emoji: '🗑️' },
      messageUpdate:         { label: '✏️ Message modifié',            emoji: '✏️' },
      messageBulkDelete:     { label: '🧹 Purge de messages',          emoji: '🧹' },
      messageReactionAdd:    { label: '👍 Réaction ajoutée',           emoji: '👍' },
      messageReactionRemove: { label: '👎 Réaction retirée',           emoji: '👎' },
      messagePin:            { label: '📌 Message épinglé',            emoji: '📌' },
    },
  },
  members: {
    label: '👥 Membres',
    events: {
      guildMemberAdd:        { label: '📥 Membre rejoint',             emoji: '📥' },
      guildMemberRemove:     { label: '📤 Membre parti',               emoji: '📤' },
      guildMemberUpdate:     { label: '📝 Membre modifié',             emoji: '📝' },
      guildBanAdd:           { label: '🔨 Bannissement',               emoji: '🔨' },
      guildBanRemove:        { label: '🔓 Débannissement',             emoji: '🔓' },
    },
  },
  channels: {
    label: '📁 Salons',
    events: {
      channelCreate:         { label: '➕ Salon créé',                 emoji: '➕' },
      channelDelete:         { label: '➖ Salon supprimé',             emoji: '➖' },
      channelUpdate:         { label: '🔧 Salon modifié',              emoji: '🔧' },
    },
  },
  roles: {
    label: '🏷️ Rôles',
    events: {
      roleCreate:            { label: '✨ Rôle créé',                  emoji: '✨' },
      roleDelete:            { label: '🗑️ Rôle supprimé',             emoji: '🗑️' },
      roleUpdate:            { label: '🔧 Rôle modifié',               emoji: '🔧' },
    },
  },
  voice: {
    label: '🔊 Vocal',
    events: {
      voiceJoin:             { label: '🔊 Rejoint un vocal',           emoji: '��' },
      voiceLeave:            { label: '🔇 Quitté un vocal',            emoji: '🔇' },
      voiceMove:             { label: '🔀 Changé de vocal',            emoji: '🔀' },
    },
  },
  server: {
    label: '🏠 Serveur',
    events: {
      guildUpdate:           { label: '🔧 Serveur modifié',            emoji: '🔧' },
      emojiCreate:           { label: '😄 Emoji créé',                 emoji: '😄' },
      emojiDelete:           { label: '😶 Emoji supprimé',             emoji: '😶' },
      stickerCreate:         { label: '📌 Sticker créé',               emoji: '📌' },
      stickerDelete:         { label: '📌 Sticker supprimé',           emoji: '📌' },
      inviteCreate:          { label: '📨 Invitation créée',           emoji: '📨' },
      inviteDelete:          { label: '📨 Invitation supprimée',       emoji: '📨' },
    },
  },
  moderation: {
    label: '🛡️ Modération',
    events: {
      timeout:               { label: '⏰ Timeout appliqué',           emoji: '⏰' },
      timeoutRemove:         { label: '✅ Timeout retiré',             emoji: '✅' },
    },
  },
  sanctions: {
    label: '⚖️ Sanctions',
    events: {
      cmdBan:         { label: '🔨 Ban (commande)',           emoji: '🔨' },
      cmdUnban:       { label: '🔓 Unban (commande)',         emoji: '🔓' },
      cmdKick:        { label: '👢 Kick (commande)',          emoji: '👢' },
      cmdMute:        { label: '⏰ Mute (commande)',          emoji: '⏰' },
      cmdUnmute:      { label: '🔊 Unmute (commande)',        emoji: '🔊' },
      cmdWarn:        { label: '⚠️ Avertissement',            emoji: '⚠️' },
      cmdClearwarns:  { label: '🗑️ Suppression tous warns',  emoji: '🗑️' },
      cmdRemovewarn:  { label: '➖ Suppression warn unique',  emoji: '➖' },
      cmdPurge:       { label: '🧹 Purge (commande)',         emoji: '🧹' },
      cmdClean:       { label: '🗑️ Clean (commande)',         emoji: '🗑️' },
      cmdLock:        { label: '🔒 Salon verrouillé',         emoji: '🔒' },
      cmdUnlock:      { label: '🔓 Salon déverrouillé',       emoji: '🔓' },
      cmdSlowmode:    { label: '🐢 Slowmode défini',          emoji: '🐢' },
      cmdVmute:       { label: '🔇 Mute vocal',               emoji: '🔇' },
      cmdVunmute:     { label: '🔈 Unmute vocal',             emoji: '🔈' },
      cmdVkick:       { label: '👢 Expulsion vocal',          emoji: '👢' },
      cmdMove:        { label: '🔀 Déplacement vocal',        emoji: '🔀' },
      cmdWouaf:       { label: '🐾 Suivi forcé (wouaf)',      emoji: '🐾' },
    },
  },
  threads: {
    label: '🧵 Fils de discussion',
    events: {
      threadCreate:          { label: '�� Fil créé',                   emoji: '🧵' },
      threadDelete:          { label: '🗑️ Fil supprimé',               emoji: '🗑️' },
      threadUpdate:          { label: '🔧 Fil modifié',                emoji: '🔧' },
    },
  },
  automod: {
    label: '🤖 AutoMod',
    events: {
      automodRuleCreate:     { label: '🤖 Règle AutoMod créée',        emoji: '🤖' },
      automodRuleDelete:     { label: '🗑️ Règle AutoMod supprimée',    emoji: '🗑️' },
      automodAction:         { label: '⚡ Action AutoMod déclenchée',  emoji: '⚡' },
    },
  },
  events: {
    label: '📅 Événements planifiés',
    events: {
      scheduledEventCreate:  { label: '📅 Événement créé',             emoji: '📅' },
      scheduledEventDelete:  { label: '🗑️ Événement supprimé',         emoji: '🗑️' },
      scheduledEventUpdate:  { label: '🔧 Événement modifié',          emoji: '🔧' },
    },
  },
  advanced: {
    label: '🔬 Avancé',
    events: {
      webhookUpdate:         { label: '🔗 Webhook modifié',            emoji: '🔗' },
      userUpdate:            { label: '👤 Profil utilisateur modifié', emoji: '👤' },
      messagePin:            { label: '📌 Message épinglé',            emoji: '📌' },
    },
  },
  commands: {
    label: '📟 Commandes',
    events: {
      cmdUsed: { label: '📟 Commande utilisée', emoji: '📟' },
    },
  },
  multimedia: {
    label: '🎬 Multimédia',
    events: {
      musicPlay:     { label: '▶ Piste lancée',              emoji: '▶' },
      musicAdd:      { label: '➕ Ajout à la file',          emoji: '➕' },
      musicRemove:   { label: '🗑 Piste retirée de la file', emoji: '🗑' },
      musicClear:    { label: '🧹 File vidée',               emoji: '🧹' },
      musicSkip:     { label: '⏭ Piste passée',             emoji: '⏭' },
      musicStop:     { label: '⏹ Lecteur arrêté',           emoji: '⏹' },
      ytdlDownload:  { label: '⬇ Téléchargement (.ytdl)',   emoji: '⬇' },
    },
  },
};

const ALL_EVENT_KEYS = Object.values(EVENT_CATEGORIES).flatMap(cat => Object.keys(cat.events));

// ─── helpers SQLite ───────────────────────────────────────────────────────────

function _defaultEvents() {
  const ev = {};
  for (const k of ALL_EVENT_KEYS) ev[k] = { enabled: false, channelId: null };
  return ev;
}

const _ins = sql.prepare(
  'INSERT OR IGNORE INTO log_config (guild_id, enabled, channel_id, events_json) VALUES (?, 0, NULL, ?)'
);
const _sel = sql.prepare('SELECT * FROM log_config WHERE guild_id = ?');

function _ensure(guildId) {
  _ins.run(guildId, JSON.stringify(_defaultEvents()));
}

function _get(guildId) {
  _ensure(guildId);
  const row = _sel.get(guildId);
  const events = row.events_json ? JSON.parse(row.events_json) : _defaultEvents();
  // migration : compléter les clés manquantes
  for (const k of ALL_EVENT_KEYS) {
    if (!events[k]) events[k] = { enabled: false, channelId: null };
  }
  return { enabled: !!row.enabled, channelId: row.channel_id ?? null, events };
}

function _saveEvents(guildId, events) {
  sql.prepare('UPDATE log_config SET events_json = ? WHERE guild_id = ?')
     .run(JSON.stringify(events), guildId);
}

// ─── API ─────────────────────────────────────────────────────────────────────

function getConfig(guildId)         { return _get(guildId); }

function setEnabled(guildId, value) {
  _ensure(guildId);
  sql.prepare('UPDATE log_config SET enabled = ? WHERE guild_id = ?').run(value ? 1 : 0, guildId);
}

function setChannel(guildId, channelId) {
  _ensure(guildId);
  sql.prepare('UPDATE log_config SET channel_id = ? WHERE guild_id = ?').run(channelId ?? null, guildId);
}

function setEventEnabled(guildId, eventKey, value) {
  const cfg = _get(guildId);
  if (!cfg.events[eventKey]) cfg.events[eventKey] = { enabled: false, channelId: null };
  cfg.events[eventKey].enabled = value;
  _saveEvents(guildId, cfg.events);
}

function setEventChannel(guildId, eventKey, channelId) {
  const cfg = _get(guildId);
  if (!cfg.events[eventKey]) cfg.events[eventKey] = { enabled: false, channelId: null };
  cfg.events[eventKey].channelId = channelId ?? null;
  _saveEvents(guildId, cfg.events);
}

function setCategoryEnabled(guildId, categoryKey, value) {
  const cat = EVENT_CATEGORIES[categoryKey];
  if (!cat) return;
  const cfg = _get(guildId);
  for (const k of Object.keys(cat.events)) {
    if (!cfg.events[k]) cfg.events[k] = { enabled: false, channelId: null };
    cfg.events[k].enabled = value;
  }
  _saveEvents(guildId, cfg.events);
}

function enableAll(guildId) {
  const cfg = _get(guildId);
  for (const k of ALL_EVENT_KEYS) cfg.events[k] = { ...(cfg.events[k] || {}), enabled: true };
  _saveEvents(guildId, cfg.events);
}

function disableAll(guildId) {
  const cfg = _get(guildId);
  for (const k of ALL_EVENT_KEYS) cfg.events[k] = { ...(cfg.events[k] || {}), enabled: false };
  _saveEvents(guildId, cfg.events);
}

function shouldLog(guildId, eventKey) {
  const cfg = _get(guildId);
  if (!cfg.enabled) return false;
  return cfg.events[eventKey]?.enabled === true;
}

function getChannelId(guildId, eventKey) {
  const cfg = _get(guildId);
  return cfg.events[eventKey]?.channelId || cfg.channelId || null;
}

module.exports = {
  getConfig, setEnabled, setChannel,
  setEventEnabled, setEventChannel,
  setCategoryEnabled, enableAll, disableAll,
  shouldLog, getChannelId,
  EVENT_CATEGORIES, ALL_EVENT_KEYS,
};
