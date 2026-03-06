// utils/db.js — Connexion SQLite centralisée (better-sqlite3)
// Un seul fichier data/bot.db pour tout le bot.
// Toutes les tables sont créées ici au démarrage.
'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'bot.db');
const sql     = new Database(DB_FILE);

// Performances : WAL mode + synchronous NORMAL
sql.pragma('journal_mode = WAL');
sql.pragma('synchronous = NORMAL');
sql.pragma('foreign_keys = ON');

// ─── Création des tables ──────────────────────────────────────────────────────

sql.exec(`
  -- ── Admin config ──────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS admin_config (
    guild_id      TEXT PRIMARY KEY,
    admin_role_id TEXT,
    mute_role_id  TEXT,
    mute_mode     TEXT NOT NULL DEFAULT 'timeout'
  );

  -- ── Logs config ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS log_config (
    guild_id   TEXT PRIMARY KEY,
    enabled    INTEGER NOT NULL DEFAULT 0,
    channel_id TEXT,
    events_json TEXT NOT NULL DEFAULT '{}'   -- { eventKey: { enabled, channelId } }
  );

  -- ── Warnings ──────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS warnings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason       TEXT NOT NULL DEFAULT '',
    date         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id);

  -- ── Ticket config ──────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS ticket_config (
    guild_id    TEXT PRIMARY KEY,
    config_json TEXT NOT NULL DEFAULT '{}',
    counter     INTEGER NOT NULL DEFAULT 0
  );

  -- ── Tickets ───────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS tickets (
    channel_id     TEXT PRIMARY KEY,
    guild_id       TEXT NOT NULL,
    id             INTEGER NOT NULL,
    owner_id       TEXT NOT NULL,
    tag            TEXT NOT NULL DEFAULT '',
    reason         TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'open',
    claimed_by     TEXT,
    added_users    TEXT NOT NULL DEFAULT '[]',  -- JSON array
    opened_at      INTEGER NOT NULL,
    closed_at      INTEGER,
    control_msg_id TEXT,
    log_msg_id     TEXT,
    log_thread_id  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);

  -- ── Free games config ─────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS freegames_config (
    guild_id      TEXT PRIMARY KEY,
    config_json   TEXT NOT NULL DEFAULT '{}'
  );

  -- ── Counters (sconfig) ────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS counters (
    guild_id      TEXT NOT NULL,
    type          TEXT NOT NULL,
    channel_id    TEXT NOT NULL,
    template      TEXT NOT NULL,
    current_name  TEXT,
    previous_name TEXT,
    PRIMARY KEY (guild_id, type)
  );

  -- ── Minecraft config ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS mc_config (
    guild_id            TEXT PRIMARY KEY,
    enabled             INTEGER NOT NULL DEFAULT 0,
    server_ip           TEXT NOT NULL DEFAULT '',
    port                INTEGER NOT NULL DEFAULT 25565,
    status_channel_id   TEXT,
    notification_role_id TEXT,
    status_message_id   TEXT,
    check_interval      INTEGER NOT NULL DEFAULT 60,
    favicon_data        TEXT,
    notify_join         INTEGER NOT NULL DEFAULT 1,
    notify_leave        INTEGER NOT NULL DEFAULT 1,
    notify_online       INTEGER NOT NULL DEFAULT 1,
    notify_offline      INTEGER NOT NULL DEFAULT 1,
    join_notif_duration  INTEGER NOT NULL DEFAULT 60,
    leave_notif_duration INTEGER NOT NULL DEFAULT 120
  );

  -- ── Rules config ──────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS rules_config (
    guild_id          TEXT PRIMARY KEY,
    enabled           INTEGER NOT NULL DEFAULT 0,
    rules_channel_id  TEXT,
    join_role_id      TEXT,
    verified_role_id  TEXT,
    rules_text        TEXT NOT NULL DEFAULT '',
    button_label      TEXT NOT NULL DEFAULT '',
    panel_message_id  TEXT
  );

  -- ── Temp voice config ─────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS tempvoice_config (
    guild_id       TEXT PRIMARY KEY,
    enabled        INTEGER NOT NULL DEFAULT 0,
    hub_channel_id TEXT,
    category_id    TEXT,
    default_limit  INTEGER NOT NULL DEFAULT 0,
    name_template  TEXT NOT NULL DEFAULT '🎮 {username}',
    allow_rename   INTEGER NOT NULL DEFAULT 1,
    allow_limit    INTEGER NOT NULL DEFAULT 1,
    allow_lock     INTEGER NOT NULL DEFAULT 1
  );

  -- ── Temp voice channels ───────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS tempvoice_channels (
    channel_id TEXT PRIMARY KEY,
    guild_id   TEXT NOT NULL,
    owner_id   TEXT NOT NULL,
    private    INTEGER NOT NULL DEFAULT 0
  );

  -- ── Activity : messages ───────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_messages (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, channel_id)
  );

  -- ── Activity : messages par jour (user) ───────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_msg_days (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    date     TEXT NOT NULL,
    count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, date)
  );

  -- ── Activity : messages par jour (serveur) ────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_msg_days_server (
    guild_id TEXT NOT NULL,
    date     TEXT NOT NULL,
    count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, date)
  );

  -- ── Activity : vocal cumulatif ────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_voice (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    total_ms   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, channel_id)
  );

  -- ── Activity : vocal par jour (user) ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_voice_days (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    date       TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    total_ms   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, date, channel_id)
  );

  -- ── Activity : vocal par jour (serveur) ──────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_voice_days_server (
    guild_id   TEXT NOT NULL,
    date       TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    total_ms   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, date, channel_id)
  );

  -- ── Activity : sessions vocales en cours ─────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_voice_sessions (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );

  -- ── Activity : jeux cumulatif ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_games (
    guild_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    game_name TEXT NOT NULL,
    total_ms  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, game_name)
  );

  -- ── Activity : jeux par jour (user) ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_game_days (
    guild_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    date      TEXT NOT NULL,
    game_name TEXT NOT NULL,
    total_ms  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, date, game_name)
  );

  -- ── Activity : sessions jeux en cours ────────────────────────────────────
  CREATE TABLE IF NOT EXISTS activity_game_sessions (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    game_name  TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
`);

module.exports = sql;
