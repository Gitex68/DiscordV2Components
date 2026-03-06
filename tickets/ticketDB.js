// tickets/ticketDB.js — SQLite
'use strict';

const sql = require('../utils/db.js');

// ─── DEFAULT_CONFIG ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  categoryId:          null,
  closedCategoryId:    null,
  logChannelId:        null,
  panelChannelId:      null,
  categoryName:        '📋 Tickets',
  closedCategoryName:  '📁 Tickets Fermés',
  logChannelName:      '📋-ticket-logs',
  panelChannelName:    '🎫-tickets',
  supportRoleId:       null,
  viewerRoleId:        null,
  claimRoleId:         null,
  mentionRoles:        [],
  maxOpen:             3,
  autoCloseHours:      0,
  closedDeleteHours:   24,
  tags:                ['Support', 'Bug', 'Commande', 'Autre'],
  pingOnOpen:          true,
  requireReason:       false,
  transcriptOnClose:   true,
  ticketNaming:        '{num}-{username}',
  welcomeMessage:      '',
  openMessage:         '',
  closeMessage:        '',
  panelTitle:          '',
  panelDescription:    '',
  panelMsgId:          null,
};

// ─── Prepared statements ──────────────────────────────────────────────────────

const _insGuild = sql.prepare(
  'INSERT OR IGNORE INTO ticket_config (guild_id, config_json, counter) VALUES (?, ?, 0)'
);
const _selGuild = sql.prepare('SELECT * FROM ticket_config WHERE guild_id = ?');

const _insTick = sql.prepare(`
  INSERT OR REPLACE INTO tickets
    (channel_id, guild_id, id, owner_id, tag, reason, status, claimed_by,
     added_users, opened_at, closed_at, control_msg_id, log_msg_id, log_thread_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const _selTick  = sql.prepare('SELECT * FROM tickets WHERE channel_id = ?');
const _selTickG = sql.prepare('SELECT * FROM tickets WHERE guild_id = ?');
const _delTick  = sql.prepare('DELETE FROM tickets WHERE channel_id = ?');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _ensureGuild(guildId) {
  _insGuild.run(guildId, JSON.stringify({ ...DEFAULT_CONFIG }));
}

function _getGuildConfig(guildId) {
  _ensureGuild(guildId);
  const row = _selGuild.get(guildId);
  const saved = row.config_json ? JSON.parse(row.config_json) : {};
  // migration forward: compléter les champs manquants
  const cfg = { ...DEFAULT_CONFIG, ...saved };
  return { config: cfg, counter: row.counter };
}

function _saveCfg(guildId, cfg) {
  sql.prepare('UPDATE ticket_config SET config_json = ? WHERE guild_id = ?')
     .run(JSON.stringify(cfg), guildId);
}

function _rowToTicket(row) {
  if (!row) return null;
  return {
    id:           row.id,
    channelId:    row.channel_id,
    guildId:      row.guild_id,
    ownerId:      row.owner_id,
    tag:          row.tag,
    reason:       row.reason,
    status:       row.status,
    claimedBy:    row.claimed_by ?? null,
    addedUsers:   row.added_users ? JSON.parse(row.added_users) : [],
    openedAt:     row.opened_at,
    closedAt:     row.closed_at ?? null,
    controlMsgId: row.control_msg_id ?? null,
    logMsgId:     row.log_msg_id ?? null,
    logThreadId:  row.log_thread_id ?? null,
  };
}

function _saveTick(t) {
  _insTick.run(
    t.channelId, t.guildId, t.id, t.ownerId, t.tag, t.reason,
    t.status, t.claimedBy ?? null,
    JSON.stringify(t.addedUsers ?? []),
    t.openedAt, t.closedAt ?? null,
    t.controlMsgId ?? null, t.logMsgId ?? null, t.logThreadId ?? null
  );
}

// ─── Config API ───────────────────────────────────────────────────────────────

function getConfig(guildId) {
  return _getGuildConfig(guildId).config;
}

function setConfig(guildId, key, value) {
  const { config } = _getGuildConfig(guildId);
  config[key] = value;
  _saveCfg(guildId, config);
}

function addTag(guildId, tag) {
  const { config } = _getGuildConfig(guildId);
  if (!config.tags.includes(tag)) {
    config.tags.push(tag);
    _saveCfg(guildId, config);
  }
}

function removeTag(guildId, tag) {
  const { config } = _getGuildConfig(guildId);
  config.tags = config.tags.filter(t => t !== tag);
  _saveCfg(guildId, config);
}

// ─── Tickets API ──────────────────────────────────────────────────────────────

function createTicket(guildId, channelId, ownerId, tag, reason, controlMsgId = null) {
  _ensureGuild(guildId);
  const row = _selGuild.get(guildId);
  const counter = (row.counter || 0) + 1;
  sql.prepare('UPDATE ticket_config SET counter = ? WHERE guild_id = ?').run(counter, guildId);

  const ticket = {
    id: counter, channelId, guildId, ownerId, tag, reason,
    status: 'open', claimedBy: null, addedUsers: [],
    openedAt: Date.now(), closedAt: null,
    controlMsgId, logMsgId: null, logThreadId: null,
  };
  _saveTick(ticket);
  return ticket;
}

function getTicket(guildId, channelId) {
  return _rowToTicket(_selTick.get(channelId));
}

function getTicketByChannel(guildIdOrChannelId, channelIdArg) {
  if (channelIdArg !== undefined) {
    return _rowToTicket(_selTick.get(channelIdArg));
  }
  return _rowToTicket(_selTick.get(guildIdOrChannelId));
}

function updateTicket(guildId, channelId, changes) {
  const t = _rowToTicket(_selTick.get(channelId));
  if (!t) return null;
  Object.assign(t, changes);
  _saveTick(t);
  return t;
}

function closeTicket(guildId, channelId) {
  return updateTicket(guildId, channelId, { status: 'closed', closedAt: Date.now() });
}

function reopenTicket(guildId, channelId) {
  return updateTicket(guildId, channelId, { status: 'open', closedAt: null });
}

function deleteTicket(guildId, channelId) {
  _delTick.run(channelId);
}

function claimTicket(guildId, channelId, userId) {
  return updateTicket(guildId, channelId, { claimedBy: userId });
}

function unclaimTicket(guildId, channelId) {
  return updateTicket(guildId, channelId, { claimedBy: null });
}

function addUserToTicket(guildId, channelId, userId) {
  const t = _rowToTicket(_selTick.get(channelId));
  if (!t) return null;
  if (!t.addedUsers.includes(userId)) {
    t.addedUsers.push(userId);
    _saveTick(t);
  }
  return t;
}

function removeUserFromTicket(guildId, channelId, userId) {
  const t = _rowToTicket(_selTick.get(channelId));
  if (!t) return null;
  t.addedUsers = t.addedUsers.filter(id => id !== userId);
  _saveTick(t);
  return t;
}

function getOpenTicketsByUser(guildId, userId) {
  return _selTickG.all(guildId)
    .map(_rowToTicket)
    .filter(t => t.ownerId === userId && t.status === 'open');
}

function getAllTickets(guildId, filter = {}) {
  let tickets = _selTickG.all(guildId).map(_rowToTicket);
  if (filter.status)  tickets = tickets.filter(t => t.status  === filter.status);
  if (filter.ownerId) tickets = tickets.filter(t => t.ownerId === filter.ownerId);
  if (filter.tag)     tickets = tickets.filter(t => t.tag     === filter.tag);
  return tickets;
}

function getCounter(guildId) {
  _ensureGuild(guildId);
  return _selGuild.get(guildId).counter;
}

module.exports = {
  getConfig, setConfig, addTag, removeTag,
  createTicket, getTicket, getTicketByChannel, updateTicket,
  closeTicket, reopenTicket, deleteTicket,
  claimTicket, unclaimTicket,
  addUserToTicket, removeUserFromTicket,
  getOpenTicketsByUser, getAllTickets, getCounter,
  DEFAULT_CONFIG,
};
