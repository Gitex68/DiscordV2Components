// logs/logDB.js
// Persistance JSON pour la configuration des logs serveur.
// Structure :
//   data.guilds[guildId] = {
//     enabled:   boolean
//     channelId: string|null         salon de logs par défaut
//     events:    { [eventKey]: { enabled: boolean, channelId: string|null } }
//   }

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'logs_data.json');

let data = { guilds: {} };

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[LogDB] Erreur de lecture:', e.message);
    data = { guilds: {} };
  }
}

function save() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[LogDB] Erreur de sauvegarde:', e.message);
  }
}

// ─── Catégories d'événements ──────────────────────────────────────────────────

const EVENT_CATEGORIES = {
  messages: {
    label: '💬 Messages',
    events: {
      messageDelete:       { label: '🗑️ Message supprimé',        emoji: '🗑️' },
      messageUpdate:       { label: '✏️ Message modifié',          emoji: '✏️' },
      messageBulkDelete:   { label: '🧹 Purge de messages',        emoji: '🧹' },
      messageReactionAdd:  { label: '👍 Réaction ajoutée',         emoji: '👍' },
      messageReactionRemove: { label: '👎 Réaction retirée',       emoji: '👎' },
      messagePin:          { label: '📌 Message épinglé',          emoji: '📌' },
    },
  },
  members: {
    label: '👥 Membres',
    events: {
      guildMemberAdd:      { label: '📥 Membre rejoint',           emoji: '📥' },
      guildMemberRemove:   { label: '📤 Membre parti',             emoji: '📤' },
      guildMemberUpdate:   { label: '📝 Membre modifié',           emoji: '📝' },
      guildBanAdd:         { label: '🔨 Bannissement',             emoji: '🔨' },
      guildBanRemove:      { label: '🔓 Débannissement',           emoji: '🔓' },
    },
  },
  channels: {
    label: '📁 Salons',
    events: {
      channelCreate:       { label: '➕ Salon créé',               emoji: '➕' },
      channelDelete:       { label: '➖ Salon supprimé',           emoji: '➖' },
      channelUpdate:       { label: '🔧 Salon modifié',            emoji: '🔧' },
    },
  },
  roles: {
    label: '🏷️ Rôles',
    events: {
      roleCreate:          { label: '✨ Rôle créé',                emoji: '✨' },
      roleDelete:          { label: '🗑️ Rôle supprimé',           emoji: '🗑️' },
      roleUpdate:          { label: '🔧 Rôle modifié',             emoji: '🔧' },
    },
  },
  voice: {
    label: '🔊 Vocal',
    events: {
      voiceJoin:           { label: '🔊 Rejoint un vocal',         emoji: '🔊' },
      voiceLeave:          { label: '🔇 Quitté un vocal',          emoji: '🔇' },
      voiceMove:           { label: '🔀 Changé de vocal',          emoji: '🔀' },
    },
  },
  server: {
    label: '🏠 Serveur',
    events: {
      guildUpdate:         { label: '🔧 Serveur modifié',          emoji: '🔧' },
      emojiCreate:         { label: '😄 Emoji créé',               emoji: '😄' },
      emojiDelete:         { label: '😶 Emoji supprimé',           emoji: '😶' },
      stickerCreate:       { label: '📌 Sticker créé',             emoji: '📌' },
      stickerDelete:       { label: '📌 Sticker supprimé',         emoji: '📌' },
      inviteCreate:        { label: '📨 Invitation créée',         emoji: '📨' },
      inviteDelete:        { label: '📨 Invitation supprimée',     emoji: '📨' },
    },
  },
  moderation: {
    label: '🛡️ Modération',
    events: {
      timeout:             { label: '⏰ Timeout appliqué',         emoji: '⏰' },
      timeoutRemove:       { label: '✅ Timeout retiré',           emoji: '✅' },
    },
  },
  sanctions: {
    label: '⚖️ Sanctions',
    events: {
      cmdBan:         { label: '🔨 Ban (commande)',            emoji: '🔨' },
      cmdUnban:       { label: '🔓 Unban (commande)',          emoji: '🔓' },
      cmdKick:        { label: '👢 Kick (commande)',           emoji: '👢' },
      cmdMute:        { label: '⏰ Mute (commande)',           emoji: '⏰' },
      cmdUnmute:      { label: '🔊 Unmute (commande)',         emoji: '🔊' },
      cmdWarn:        { label: '⚠️ Avertissement',             emoji: '⚠️' },
      cmdClearwarns:  { label: '🗑️ Suppression tous warns',   emoji: '🗑️' },
      cmdRemovewarn:  { label: '➖ Suppression warn unique',   emoji: '➖' },
      cmdPurge:       { label: '🧹 Purge (commande)',          emoji: '🧹' },
      cmdClean:       { label: '🗑️ Clean (commande)',          emoji: '🗑️' },
      cmdLock:        { label: '🔒 Salon verrouillé',          emoji: '🔒' },
      cmdUnlock:      { label: '🔓 Salon déverrouillé',        emoji: '🔓' },
      cmdSlowmode:    { label: '🐢 Slowmode défini',           emoji: '🐢' },
      cmdVmute:       { label: '🔇 Mute vocal',                emoji: '🔇' },
      cmdVunmute:     { label: '🔈 Unmute vocal',              emoji: '🔈' },
      cmdVkick:       { label: '👢 Expulsion vocal',           emoji: '👢' },
      cmdMove:        { label: '🔀 Déplacement vocal',         emoji: '🔀' },
      cmdWouaf:       { label: '🐾 Suivi forcé (wouaf)',       emoji: '🐾' },
    },
  },
  threads: {
    label: '🧵 Fils de discussion',
    events: {
      threadCreate:        { label: '🧵 Fil créé',                 emoji: '🧵' },
      threadDelete:        { label: '🗑️ Fil supprimé',             emoji: '🗑️' },
      threadUpdate:        { label: '🔧 Fil modifié',              emoji: '🔧' },
    },
  },
  automod: {
    label: '🤖 AutoMod',
    events: {
      automodRuleCreate:   { label: '🤖 Règle AutoMod créée',      emoji: '🤖' },
      automodRuleDelete:   { label: '🗑️ Règle AutoMod supprimée',  emoji: '🗑️' },
      automodAction:       { label: '⚡ Action AutoMod déclenchée', emoji: '⚡' },
    },
  },
  events: {
    label: '📅 Événements planifiés',
    events: {
      scheduledEventCreate: { label: '📅 Événement créé',          emoji: '📅' },
      scheduledEventDelete: { label: '🗑️ Événement supprimé',      emoji: '🗑️' },
      scheduledEventUpdate: { label: '🔧 Événement modifié',       emoji: '🔧' },
    },
  },
  advanced: {
    label: '🔬 Avancé',
    events: {
      webhookUpdate:       { label: '🔗 Webhook modifié',          emoji: '🔗' },
      userUpdate:          { label: '👤 Profil utilisateur modifié', emoji: '👤' },
      messagePin:          { label: '📌 Message épinglé',          emoji: '📌' },
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
      musicPlay:    { label: '▶ Piste lancée',               emoji: '▶' },
      musicAdd:     { label: '➕ Ajout à la file',           emoji: '➕' },
      musicRemove:  { label: '🗑 Piste retirée de la file',  emoji: '🗑' },
      musicClear:   { label: '🧹 File vidée',                emoji: '🧹' },
      musicSkip:    { label: '⏭ Piste passée',              emoji: '⏭' },
      musicStop:    { label: '⏹ Lecteur arrêté',            emoji: '⏹' },
      ytdlDownload: { label: '⬇ Téléchargement (.ytdl)',    emoji: '⬇' },
    },
  },
};

// Clés de tous les événements (liste plate)
const ALL_EVENT_KEYS = Object.values(EVENT_CATEGORIES).flatMap(cat => Object.keys(cat.events));

// Config par défaut pour un événement
function defaultEventConfig() {
  return { enabled: false, channelId: null };
}

// Config par défaut complète pour une guilde
function defaultGuildConfig() {
  const events = {};
  for (const key of ALL_EVENT_KEYS) events[key] = defaultEventConfig();
  return {
    enabled:   false,
    channelId: null,
    events,
  };
}

function ensureGuild(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = defaultGuildConfig();
    save();
  } else {
    // Migration : compléter les champs manquants
    let changed = false;
    if (data.guilds[guildId].enabled === undefined) { data.guilds[guildId].enabled = false; changed = true; }
    if (!data.guilds[guildId].channelId === undefined) { data.guilds[guildId].channelId = null; changed = true; }
    if (!data.guilds[guildId].events) { data.guilds[guildId].events = {}; changed = true; }
    for (const key of ALL_EVENT_KEYS) {
      if (!data.guilds[guildId].events[key]) {
        data.guilds[guildId].events[key] = defaultEventConfig();
        changed = true;
      }
    }
    if (changed) save();
  }
  return data.guilds[guildId];
}

// ─── API ─────────────────────────────────────────────────────────────────────

function getConfig(guildId) {
  return ensureGuild(guildId);
}

function setEnabled(guildId, value) {
  ensureGuild(guildId).enabled = value;
  save();
}

function setChannel(guildId, channelId) {
  ensureGuild(guildId).channelId = channelId;
  save();
}

function setEventEnabled(guildId, eventKey, value) {
  const g = ensureGuild(guildId);
  if (!g.events[eventKey]) g.events[eventKey] = defaultEventConfig();
  g.events[eventKey].enabled = value;
  save();
}

function setEventChannel(guildId, eventKey, channelId) {
  const g = ensureGuild(guildId);
  if (!g.events[eventKey]) g.events[eventKey] = defaultEventConfig();
  g.events[eventKey].channelId = channelId;
  save();
}

// Active ou désactive tous les événements d'une catégorie
function setCategoryEnabled(guildId, categoryKey, value) {
  const cat = EVENT_CATEGORIES[categoryKey];
  if (!cat) return;
  const g = ensureGuild(guildId);
  for (const eventKey of Object.keys(cat.events)) {
    if (!g.events[eventKey]) g.events[eventKey] = defaultEventConfig();
    g.events[eventKey].enabled = value;
  }
  save();
}

// Active tous les événements d'un coup
function enableAll(guildId) {
  const g = ensureGuild(guildId);
  for (const key of ALL_EVENT_KEYS) {
    if (!g.events[key]) g.events[key] = defaultEventConfig();
    g.events[key].enabled = true;
  }
  save();
}

// Désactive tous les événements
function disableAll(guildId) {
  const g = ensureGuild(guildId);
  for (const key of ALL_EVENT_KEYS) {
    if (!g.events[key]) g.events[key] = defaultEventConfig();
    g.events[key].enabled = false;
  }
  save();
}

// Retourne true si on doit loguer cet event (enabled global + event enabled)
function shouldLog(guildId, eventKey) {
  const g = ensureGuild(guildId);
  if (!g.enabled) return false;
  return g.events[eventKey]?.enabled === true;
}

// Retourne l'ID du salon pour cet event (event-specific ou global)
function getChannelId(guildId, eventKey) {
  const g = ensureGuild(guildId);
  return g.events[eventKey]?.channelId || g.channelId || null;
}

load();

module.exports = {
  load, save,
  getConfig, setEnabled, setChannel,
  setEventEnabled, setEventChannel,
  setCategoryEnabled, enableAll, disableAll,
  shouldLog, getChannelId,
  EVENT_CATEGORIES, ALL_EVENT_KEYS,
};
