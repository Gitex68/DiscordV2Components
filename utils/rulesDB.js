// utils/rulesDB.js — SQLite
'use strict';

const sql = require('./db.js');

const DEFAULT_RULES_TEXT =
  '# 📜 Règlement\n\n' +
  '**1.** Sois respectueux envers tous les membres.\n' +
  '**2.** Pas de spam, flood ou publicité non autorisée.\n' +
  '**3.** Pas de contenu NSFW en dehors des salons prévus à cet effet.\n' +
  '**4.** Respecte les décisions des modérateurs.\n' +
  '**5.** Bonne ambiance avant tout ! 🎉';

const DEFAULT_CONFIG = {
  enabled:        false,
  rulesChannelId: null,
  joinRoleId:     null,
  verifiedRoleId: null,
  rulesText:      DEFAULT_RULES_TEXT,
  buttonLabel:    '✅ J\'accepte le règlement',
  panelMessageId: null,
};

const _ins = sql.prepare(
  'INSERT OR IGNORE INTO rules_config (guild_id, enabled, rules_channel_id, join_role_id, verified_role_id, rules_text, button_label, panel_message_id) VALUES (?, 0, NULL, NULL, NULL, ?, ?, NULL)'
);
const _sel = sql.prepare('SELECT * FROM rules_config WHERE guild_id = ?');

function _ensure(guildId) {
  _ins.run(guildId, DEFAULT_CONFIG.rulesText, DEFAULT_CONFIG.buttonLabel);
}

function _rowToConfig(row) {
  if (!row) return { ...DEFAULT_CONFIG };
  return {
    enabled:        !!row.enabled,
    rulesChannelId: row.rules_channel_id ?? null,
    joinRoleId:     row.join_role_id     ?? null,
    verifiedRoleId: row.verified_role_id ?? null,
    rulesText:      row.rules_text       ?? DEFAULT_CONFIG.rulesText,
    buttonLabel:    row.button_label     ?? DEFAULT_CONFIG.buttonLabel,
    panelMessageId: row.panel_message_id ?? null,
  };
}

const COL_MAP = {
  enabled:        'enabled',
  rulesChannelId: 'rules_channel_id',
  joinRoleId:     'join_role_id',
  verifiedRoleId: 'verified_role_id',
  rulesText:      'rules_text',
  buttonLabel:    'button_label',
  panelMessageId: 'panel_message_id',
};

function getConfig(guildId) {
  _ensure(guildId);
  return _rowToConfig(_sel.get(guildId));
}

function set(guildId, key, value) {
  _ensure(guildId);
  const col = COL_MAP[key];
  if (!col) throw new Error('[rulesDB] Clé inconnue : ' + key);
  const v = typeof value === 'boolean' ? (value ? 1 : 0) : (value ?? null);
  sql.prepare('UPDATE rules_config SET ' + col + ' = ? WHERE guild_id = ?').run(v, guildId);
}

function setMany(guildId, obj) {
  _ensure(guildId);
  const sets = [], vals = [];
  for (const [key, value] of Object.entries(obj)) {
    const col = COL_MAP[key];
    if (!col) continue;
    sets.push(col + ' = ?');
    vals.push(typeof value === 'boolean' ? (value ? 1 : 0) : (value ?? null));
  }
  if (!sets.length) return;
  vals.push(guildId);
  sql.prepare('UPDATE rules_config SET ' + sets.join(', ') + ' WHERE guild_id = ?').run(...vals);
}

module.exports = { getConfig, set, setMany, DEFAULT_CONFIG };
