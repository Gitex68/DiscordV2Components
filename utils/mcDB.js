// utils/mcDB.js — SQLite (better-sqlite3) pour le système Minecraft Status
'use strict';

const sql = require('./db.js');

const DEFAULT_CONFIG = {
  enabled:             false,
  serverIp:            '',
  port:                25565,
  statusChannelId:     null,
  notificationRoleId:  null,
  statusMessageId:     null,
  checkInterval:       60,
  faviconData:         null,
  notifyJoin:          true,
  notifyLeave:         true,
  notifyOnline:        true,
  notifyOffline:       true,
  joinNotifDuration:   60,
  leaveNotifDuration:  120,
};

const _upsert = sql.prepare(`
  INSERT INTO mc_config (
    guild_id, enabled, server_ip, port,
    status_channel_id, notification_role_id, status_message_id,
    check_interval, favicon_data,
    notify_join, notify_leave, notify_online, notify_offline,
    join_notif_duration, leave_notif_duration
  ) VALUES (
    @guild_id, @enabled, @server_ip, @port,
    @status_channel_id, @notification_role_id, @status_message_id,
    @check_interval, @favicon_data,
    @notify_join, @notify_leave, @notify_online, @notify_offline,
    @join_notif_duration, @leave_notif_duration
  ) ON CONFLICT(guild_id) DO NOTHING
`);

const _select = sql.prepare('SELECT * FROM mc_config WHERE guild_id = ?');

function _rowToConfig(row) {
  if (!row) return { ...DEFAULT_CONFIG };
  return {
    enabled:             !!row.enabled,
    serverIp:            row.server_ip            ?? DEFAULT_CONFIG.serverIp,
    port:                row.port                 ?? DEFAULT_CONFIG.port,
    statusChannelId:     row.status_channel_id    ?? null,
    notificationRoleId:  row.notification_role_id ?? null,
    statusMessageId:     row.status_message_id    ?? null,
    checkInterval:       row.check_interval       ?? DEFAULT_CONFIG.checkInterval,
    faviconData:         row.favicon_data         ?? null,
    notifyJoin:          !!row.notify_join,
    notifyLeave:         !!row.notify_leave,
    notifyOnline:        !!row.notify_online,
    notifyOffline:       !!row.notify_offline,
    joinNotifDuration:   row.join_notif_duration  ?? DEFAULT_CONFIG.joinNotifDuration,
    leaveNotifDuration:  row.leave_notif_duration ?? DEFAULT_CONFIG.leaveNotifDuration,
  };
}

function _ensureRow(guildId) {
  const row = _select.get(guildId);
  if (!row) {
    const d = DEFAULT_CONFIG;
    _upsert.run({
      guild_id: guildId, enabled: 0, server_ip: d.serverIp, port: d.port,
      status_channel_id: null, notification_role_id: null, status_message_id: null,
      check_interval: d.checkInterval, favicon_data: null,
      notify_join: 1, notify_leave: 1, notify_online: 1, notify_offline: 1,
      join_notif_duration: d.joinNotifDuration, leave_notif_duration: d.leaveNotifDuration,
    });
    return _select.get(guildId);
  }
  return row;
}

const COL_MAP = {
  enabled:            'enabled',
  serverIp:           'server_ip',
  port:               'port',
  statusChannelId:    'status_channel_id',
  notificationRoleId: 'notification_role_id',
  statusMessageId:    'status_message_id',
  checkInterval:      'check_interval',
  faviconData:        'favicon_data',
  notifyJoin:         'notify_join',
  notifyLeave:        'notify_leave',
  notifyOnline:       'notify_online',
  notifyOffline:      'notify_offline',
  joinNotifDuration:  'join_notif_duration',
  leaveNotifDuration: 'leave_notif_duration',
};

function getConfig(guildId) {
  return _rowToConfig(_ensureRow(guildId));
}

function set(guildId, key, value) {
  _ensureRow(guildId);
  const col = COL_MAP[key];
  if (!col) throw new Error('[mcDB] Clé inconnue : ' + key);
  const v = typeof value === 'boolean' ? (value ? 1 : 0) : (value ?? null);
  sql.prepare('UPDATE mc_config SET ' + col + ' = ? WHERE guild_id = ?').run(v, guildId);
}

function setMany(guildId, obj) {
  _ensureRow(guildId);
  const sets = [];
  const vals = [];
  for (const [key, value] of Object.entries(obj)) {
    const col = COL_MAP[key];
    if (!col) continue;
    sets.push(col + ' = ?');
    vals.push(typeof value === 'boolean' ? (value ? 1 : 0) : (value ?? null));
  }
  if (sets.length === 0) return;
  vals.push(guildId);
  sql.prepare('UPDATE mc_config SET ' + sets.join(', ') + ' WHERE guild_id = ?').run(...vals);
}

module.exports = { getConfig, set, setMany, DEFAULT_CONFIG };
