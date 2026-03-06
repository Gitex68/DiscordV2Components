// tickets/ticketDB.js
// Persistance JSON en mémoire + fichier pour les données de tickets
// Structure :
//   data.guilds[guildId] = {
//     config: { categoryId, logChannelId, supportRoleId, panelChannelId, tags: [], maxOpen: 3 },
//     tickets: { [channelId]: TicketData },
//     counter: Number
//   }

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tickets_data.json');

// ─── Chargement / sauvegarde ──────────────────────────────────────────────────
let data = { guilds: {} };

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[TicketDB] Erreur de lecture:', e.message);
    data = { guilds: {} };
  }
}

function save() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[TicketDB] Erreur de sauvegarde:', e.message);
  }
}

// Valeurs par défaut complètes de la config
const DEFAULT_CONFIG = {
  // ── Salons ──────────────────────────────────────────────────────────────────
  categoryId:          null,   // Catégorie où créer les tickets ouverts
  closedCategoryId:    null,   // Catégorie où déplacer les tickets fermés (null = rester en place)
  logChannelId:        null,   // Salon unique logs + transcripts (threads par ticket)
  panelChannelId:      null,   // Salon du panel (info only)
  // ── Noms des catégories (renommables) ───────────────────────────────────────
  categoryName:        '📋 Tickets',         // Nom de la catégorie tickets ouverts
  closedCategoryName:  '📁 Tickets Fermés',  // Nom de la catégorie tickets fermés
  logChannelName:      '📋-ticket-logs',     // Nom du salon logs (renommable)
  panelChannelName:    '🎫-tickets',         // Nom du salon panel (renommable)
  // ── Rôles ───────────────────────────────────────────────────────────────────
  supportRoleId:       null,   // Rôle staff (peut gérer tous les tickets)
  viewerRoleId:        null,   // Rôle lecture seule (peut voir les tickets mais pas les gérer)
  claimRoleId:         null,   // Rôle autorisé à claim les tickets (null = supportRoleId uniquement)
  mentionRoles:        [],     // Rôles supplémentaires à ping à l'ouverture (en plus du supportRoleId)
  // ── Limites ─────────────────────────────────────────────────────────────────
  maxOpen:             3,      // Max tickets ouverts par utilisateur
  autoCloseHours:      0,      // Fermeture auto après N heures d'inactivité (0 = désactivé)
  closedDeleteHours:   24,     // Suppression auto des tickets fermés après N heures (0 = désactivé)
  // ── Tags ────────────────────────────────────────────────────────────────────
  tags:                ['Support', 'Bug', 'Commande', 'Autre'],
  // ── Comportement ────────────────────────────────────────────────────────────
  pingOnOpen:          true,   // Ping le rôle support à l'ouverture
  requireReason:       false,  // Obliger une raison à l'ouverture (modal)
  transcriptOnClose:   true,   // Créer un thread de transcript à la fermeture
  ticketNaming:        '{num}-{username}', // Schéma de nommage : {num}, {username}, {tag}
  // ── Messages personnalisables ────────────────────────────────────────────────
  welcomeMessage:      '',     // Message d'accueil dans le ticket (vide = message par défaut)
  openMessage:         '',     // Message textuel supplémentaire envoyé dans le salon à l'ouverture
  closeMessage:        '',     // Message de fermeture (vide = message par défaut)
  panelTitle:          '',     // Titre du panel (vide = titre par défaut)
  panelDescription:    '',     // Description du panel (vide = description par défaut)
  panelMsgId:          null,   // ID du message panel (pour mise à jour auto des tags)
};

// Initialiser la structure d'une guilde si absente, et compléter les champs manquants
function ensureGuild(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      config:  { ...DEFAULT_CONFIG },
      tickets: {},
      counter: 0,
    };
    save();
  } else {
    // Migration : ajouter les nouveaux champs s'ils manquent
    let changed = false;
    for (const [key, val] of Object.entries(DEFAULT_CONFIG)) {
      if (data.guilds[guildId].config[key] === undefined) {
        data.guilds[guildId].config[key] = val;
        changed = true;
      }
    }
    if (changed) save();
  }
  return data.guilds[guildId];
}

// ─── Config ───────────────────────────────────────────────────────────────────
function getConfig(guildId) {
  return ensureGuild(guildId).config;
}

function setConfig(guildId, key, value) {
  const guild = ensureGuild(guildId);
  guild.config[key] = value;
  save();
}

function addTag(guildId, tag) {
  const guild = ensureGuild(guildId);
  if (!guild.config.tags.includes(tag)) {
    guild.config.tags.push(tag);
    save();
  }
}

function removeTag(guildId, tag) {
  const guild = ensureGuild(guildId);
  guild.config.tags = guild.config.tags.filter(t => t !== tag);
  save();
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TicketData
 * @property {number}   id           Numéro séquentiel du ticket
 * @property {string}   channelId    ID du salon Discord
 * @property {string}   guildId      ID de la guilde
 * @property {string}   ownerId      ID de l'utilisateur ayant ouvert le ticket
 * @property {string}   tag          Raison/catégorie du ticket
 * @property {string}   reason       Raison détaillée saisie par l'utilisateur
 * @property {'open'|'closed'} status Statut courant
 * @property {string|null} claimedBy  ID du staff qui a pris en charge
 * @property {string[]} addedUsers   IDs des utilisateurs ajoutés manuellement
 * @property {number}   openedAt     Timestamp d'ouverture (ms)
 * @property {number|null} closedAt  Timestamp de fermeture (ms)
 * @property {string}   controlMsgId ID du message de contrôle (boutons)
 * @property {string}   logMsgId     ID du message dans les logs
 */

function createTicket(guildId, channelId, ownerId, tag, reason, controlMsgId = null) {
  const guild = ensureGuild(guildId);
  guild.counter += 1;
  /** @type {TicketData} */
  const ticket = {
    id:           guild.counter,
    channelId,
    guildId,
    ownerId,
    tag,
    reason,
    status:       'open',
    claimedBy:    null,
    addedUsers:   [],
    openedAt:     Date.now(),
    closedAt:     null,
    controlMsgId: controlMsgId,
    logMsgId:     null,
    logThreadId:  null,
  };
  guild.tickets[channelId] = ticket;
  save();
  return ticket;
}

function getTicket(guildId, channelId) {
  const guild = ensureGuild(guildId);
  return guild.tickets[channelId] || null;
}

function getTicketByChannel(guildIdOrChannelId, channelIdArg) {
  // Supporte (channelId) ou (guildId, channelId)
  if (channelIdArg !== undefined) {
    const guildId = guildIdOrChannelId;
    const channelId = channelIdArg;
    return data.guilds[guildId]?.tickets?.[channelId] || null;
  }
  // Recherche globale par channelId seul
  const channelId = guildIdOrChannelId;
  for (const guildId of Object.keys(data.guilds)) {
    const t = data.guilds[guildId].tickets[channelId];
    if (t) return t;
  }
  return null;
}

function updateTicket(guildId, channelId, changes) {
  const guild = ensureGuild(guildId);
  if (!guild.tickets[channelId]) return null;
  Object.assign(guild.tickets[channelId], changes);
  save();
  return guild.tickets[channelId];
}

function closeTicket(guildId, channelId) {
  return updateTicket(guildId, channelId, { status: 'closed', closedAt: Date.now() });
}

function reopenTicket(guildId, channelId) {
  return updateTicket(guildId, channelId, { status: 'open', closedAt: null });
}

function deleteTicket(guildId, channelId) {
  const guild = ensureGuild(guildId);
  delete guild.tickets[channelId];
  save();
}

function claimTicket(guildId, channelId, userId) {
  return updateTicket(guildId, channelId, { claimedBy: userId });
}

function unclaimTicket(guildId, channelId) {
  return updateTicket(guildId, channelId, { claimedBy: null });
}

function addUserToTicket(guildId, channelId, userId) {
  const guild = ensureGuild(guildId);
  const t = guild.tickets[channelId];
  if (!t) return null;
  if (!t.addedUsers.includes(userId)) {
    t.addedUsers.push(userId);
    save();
  }
  return t;
}

function removeUserFromTicket(guildId, channelId, userId) {
  const guild = ensureGuild(guildId);
  const t = guild.tickets[channelId];
  if (!t) return null;
  t.addedUsers = t.addedUsers.filter(id => id !== userId);
  save();
  return t;
}

// Tous les tickets ouverts d'une guilde par utilisateur
function getOpenTicketsByUser(guildId, userId) {
  const guild = ensureGuild(guildId);
  return Object.values(guild.tickets).filter(t => t.ownerId === userId && t.status === 'open');
}

// Tous les tickets (filtrables)
function getAllTickets(guildId, filter = {}) {
  const guild = ensureGuild(guildId);
  let tickets = Object.values(guild.tickets);
  if (filter.status)  tickets = tickets.filter(t => t.status  === filter.status);
  if (filter.ownerId) tickets = tickets.filter(t => t.ownerId === filter.ownerId);
  if (filter.tag)     tickets = tickets.filter(t => t.tag     === filter.tag);
  return tickets;
}

function getCounter(guildId) {
  return ensureGuild(guildId).counter;
}

// Initialisation au démarrage
load();

module.exports = {
  load, save,
  getConfig, setConfig, addTag, removeTag,
  createTicket, getTicket, getTicketByChannel, updateTicket,
  closeTicket, reopenTicket, deleteTicket,
  claimTicket, unclaimTicket,
  addUserToTicket, removeUserFromTicket,
  getOpenTicketsByUser, getAllTickets, getCounter,
  DEFAULT_CONFIG,
};
